/**
 * Endpoint serverless para obtener información de categorías
 * Usa archivo JSON estático del árbol completo de ML
 */

const path = require('path');
const fs = require('fs');

// Cargar categorías desde archivo JSON estático
let categoriesData = null;

function loadCategoriesData() {
  if (!categoriesData) {
    const categoriesPath = path.join(process.cwd(), 'src/data/categories.json');
    categoriesData = JSON.parse(fs.readFileSync(categoriesPath, 'utf8'));
    console.log(`📂 Categorías cargadas: ${Object.keys(categoriesData).length} categorías desde archivo estático`);
  }
  return categoriesData;
}

/**
 * Función para obtener categorías desde archivo JSON estático
 */
function getCategoriesFromStatic(categoryIds) {
  if (!categoryIds || categoryIds.length === 0) {
    return {};
  }

  console.log(`📂 Static Categories - Procesando ${categoryIds.length} categorías`);

  const allCategories = loadCategoriesData();
  const categoriesInfo = {};
  
  categoryIds.forEach(categoryId => {
    const categoryData = allCategories[categoryId];
    if (categoryData) {
      categoriesInfo[categoryId] = {
        id: categoryData.id,
        name: categoryData.name,
        path_from_root: categoryData.path_from_root || []
      };
    } else {
      // Fallback para categorías no encontradas
      categoriesInfo[categoryId] = {
        id: categoryId,
        name: `Categoría ${categoryId}`,
        path_from_root: []
      };
    }
  });

  console.log(`📦 Static Categories - Procesadas ${Object.keys(categoriesInfo).length} categorías desde archivo estático`);

  return {
    categories: categoriesInfo,
    stats: {
      total: Object.keys(categoriesInfo).length,
      found: categoryIds.filter(id => allCategories[id]).length,
      missing: categoryIds.filter(id => !allCategories[id]).length
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
 * Obtener información de categorías desde archivo JSON estático
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

    // Usar archivo JSON estático (súper rápido, sin consultas externas)
    const result = getCategoriesFromStatic(categoryIds);

    res.json({
      success: true,
      categories: result.categories,
      total: result.stats.total,
      source: {
        static: result.stats.found,
        fallback: result.stats.missing
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

// Exportar también la función estática para uso interno
module.exports.getCategoriesFromStatic = getCategoriesFromStatic;
module.exports.loadCategoriesData = loadCategoriesData;