/**
 * Endpoint serverless para obtener información de categorías
 * Usa la misma lógica que funcionaba en la versión HTML
 */

const { withAuth } = require('../src/middleware/serverlessAuth');
const logger = require('../src/utils/logger');

// Mapeo estático como fallback
const categoryNames = {
  'MLM1055': 'Celulares y Teléfonos',
  'MLM1648': 'Computación', 
  'MLM1144': 'Consolas y Videojuegos',
  'MLM1000': 'Electrónicos',
  'MLM1403': 'Instrumentos Musicales',
  'MLM1276': 'Deportes y Fitness',
  'MLM1430': 'Ropa y Accesorios',
  'MLM1132': 'Juegos y Juguetes',
  'MLM1367': 'Industrias y Oficinas',
  'MLM1039': 'Cámaras y Accesorios',
  'MLA10626': 'Hogar y Jardín',
  'MLA1144': 'Consolas y Videojuegos',
  'MLA1648': 'Computación',
  'MLA1000': 'Electrónicos',
  'MLA1055': 'Celulares y Teléfonos',
  'MLA1403': 'Instrumentos Musicales',
  'MLA1276': 'Deportes y Fitness',
  'MLA1430': 'Ropa y Accesorios',
  'MLA1132': 'Juegos y Juguetes',
  'MLA1367': 'Industrias y Oficinas',
  'MLA1039': 'Cámaras y Accesorios'
};

/**
 * Obtener información de categorías
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

    logger.info(`📂 Obteniendo información de ${categoryIds.length} categorías`);

    const categoriesInfo = {};
    
    // Usar el ML API Client real como en la versión HTML
    const MLAPIClient = require('../src/api/ml-api-client');
    const mlClient = new MLAPIClient();
    
    try {
      // Usar getMultipleCategories que ya maneja lotes y rate limiting
      const categories = await mlClient.getMultipleCategories(categoryIds);
      
      categories.forEach(category => {
        if (category && category.id) {
          categoriesInfo[category.id] = {
            id: category.id,
            name: category.name,
            path_from_root: category.path_from_root || [],
            children_categories: category.children_categories || [],
            total_items_in_this_category: category.total_items_in_this_category || 0
          };
        }
      });
      
      // Para categorías no encontradas, usar fallback
      categoryIds.forEach(categoryId => {
        if (!categoriesInfo[categoryId]) {
          categoriesInfo[categoryId] = {
            id: categoryId,
            name: categoryNames[categoryId] || `Categoría ${categoryId}`,
            path_from_root: []
          };
        }
      });
      
    } catch (error) {
      logger.error(`❌ Error obteniendo categorías de ML API: ${error.message}`);
      
      // Fallback completo al mapeo estático
      categoryIds.forEach(categoryId => {
        categoriesInfo[categoryId] = {
          id: categoryId,
          name: categoryNames[categoryId] || `Categoría ${categoryId}`,
          path_from_root: []
        };
      });
    }

    res.json({
      success: true,
      categories: categoriesInfo,
      total: Object.keys(categoriesInfo).length
    });

  } catch (error) {
    logger.error(`❌ Error en getCategoriesInfo: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Error obteniendo información de categorías',
      message: error.message
    });
  }
}

/**
 * Manejador principal de rutas
 */
async function handleCategories(req, res) {
  const { method } = req;
  
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
}

// Export con middleware de autenticación
module.exports = withAuth(handleCategories);