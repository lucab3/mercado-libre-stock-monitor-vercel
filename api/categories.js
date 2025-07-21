/**
 * Endpoint serverless para obtener información de categorías
 * Estrategia híbrida: BD primero, luego ML API como fallback
 */

const databaseService = require('../src/services/databaseService');

/**
 * Función compartida para obtener categorías con estrategia híbrida
 * Esta función puede ser usada desde cualquier parte de la aplicación
 */
async function getCategoriesWithHybridStrategy(categoryIds) {
  if (!categoryIds || categoryIds.length === 0) {
    return {};
  }

  console.log(`📂 Hybrid Categories - Procesando ${categoryIds.length} categorías`);

  const categoriesInfo = {};
  
  // PASO 1: Consultar primero en la BD
  console.log('🔍 Consultando categorías en BD...');
  const dbCategories = await databaseService.getCategoriesByIds(categoryIds);
  const foundInDb = new Set();
  
  dbCategories.forEach(category => {
    foundInDb.add(category.id);
    categoriesInfo[category.id] = {
      id: category.id,
      name: category.name,
      path_from_root: category.path_from_root || []
    };
  });
  
  console.log(`📦 Encontradas ${foundInDb.size} de ${categoryIds.length} categorías en BD`);
  
  // PASO 2: Para las que no están en BD, consultar ML API
  const missingCategoryIds = categoryIds.filter(id => !foundInDb.has(id));
  
  if (missingCategoryIds.length > 0) {
    console.log(`🌐 Consultando ${missingCategoryIds.length} categorías en ML API...`);
    
    const categoryPromises = missingCategoryIds.map(async (categoryId) => {
      const categoryData = await fetchCategoryFromML(categoryId);
      
      if (categoryData) {
        // Guardar en BD para próximas consultas
        try {
          await databaseService.upsertCategory(categoryData);
          console.log(`💾 Categoría ${categoryId} guardada en BD`);
        } catch (dbError) {
          console.warn(`⚠️ Error guardando categoría ${categoryId} en BD:`, dbError.message);
        }
        
        // Agregar a respuesta
        categoriesInfo[categoryId] = {
          id: categoryData.id,
          name: categoryData.name,
          path_from_root: categoryData.path_from_root
        };
      } else {
        // Fallback si la API de ML también falla
        categoriesInfo[categoryId] = {
          id: categoryId,
          name: `Categoría ${categoryId}`,
          path_from_root: []
        };
      }
    });

    await Promise.all(categoryPromises);
  }

  console.log(`📦 Hybrid Categories - Procesadas ${Object.keys(categoriesInfo).length} categorías`);
  console.log(`   • ${foundInDb.size} desde BD, ${missingCategoryIds.length} desde ML API`);

  return {
    categories: categoriesInfo,
    stats: {
      total: Object.keys(categoriesInfo).length,
      database: foundInDb.size,
      api: missingCategoryIds.length
    }
  };
}

/**
 * Obtener información de categoría desde la API de MercadoLibre
 */
async function fetchCategoryFromML(categoryId) {
  try {
    const response = await fetch(`https://api.mercadolibre.com/categories/${categoryId}`);
    
    if (!response.ok) {
      console.warn(`⚠️ API Categories - ML API error for ${categoryId}: ${response.status}`);
      return null;
    }
    
    const categoryData = await response.json();
    return {
      id: categoryData.id,
      name: categoryData.name,
      country_code: 'AR', // Asumiendo Argentina por defecto
      site_id: 'MLA',
      path_from_root: categoryData.path_from_root || [],
      total_items_in_this_category: categoryData.total_items_in_this_category || 0
    };
  } catch (error) {
    console.warn(`⚠️ API Categories - Error fetching ${categoryId}: ${error.message}`);
    return null;
  }
}

/**
 * Obtener información de categorías (Híbrido: BD + ML API)
 */
async function getCategoriesInfo(req, res) {
  try {
    const { categoryIds } = req.body;
    
    if (!categoryIds || !Array.isArray(categoryIds)) {
      return res.status(400).json({
        success: false,
        error: 'categoryIds debe ser un array'
      });
    }

    console.log(`📂 API Categories - Obteniendo información de ${categoryIds.length} categorías:`, categoryIds);

    // Usar la función compartida híbrida
    const result = await getCategoriesWithHybridStrategy(categoryIds);

    res.json({
      success: true,
      categories: result.categories,
      total: result.stats.total,
      source: {
        database: result.stats.database,
        api: result.stats.api
      }
    });

  } catch (error) {
    console.error(`❌ API Categories - Error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Error obteniendo información de categorías',
      message: error.message
    });
  }
}

/**
 * Manejador principal de rutas para Vercel
 */
module.exports = async function handler(req, res) {
  const { method } = req;
  
  console.log(`🌐 API Categories - ${method} request received`);
  
  switch (method) {
    case 'POST':
      return await getCategoriesInfo(req, res);
    
    default:
      return res.status(405).json({
        success: false,
        error: 'Método no permitido',
        allowedMethods: ['POST']
      });
  }
};

// Exportar también la función compartida para uso interno
module.exports.getCategoriesWithHybridStrategy = getCategoriesWithHybridStrategy;
module.exports.fetchCategoryFromML = fetchCategoryFromML;