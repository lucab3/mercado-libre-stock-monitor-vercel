/**
 * Endpoint serverless para obtener información de categorías
 * Usa la base de datos de Supabase para resolver nombres
 */

const databaseService = require('../src/services/databaseService');
const logger = require('../src/utils/logger');

/**
 * Obtener información de categorías desde la base de datos
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

    logger.info(`📂 API Categories - Obteniendo información de ${categoryIds.length} categorías:`, categoryIds);

    // Obtener categorías desde la base de datos
    const categories = await databaseService.getCategoriesByIds(categoryIds);
    
    const categoriesInfo = {};
    
    // Mapear las categorías encontradas
    categories.forEach(category => {
      categoriesInfo[category.id] = {
        id: category.id,
        name: category.name,
        path_from_root: category.path_from_root || []
      };
    });

    // Para categorías no encontradas, usar nombre genérico
    categoryIds.forEach(categoryId => {
      if (!categoriesInfo[categoryId]) {
        categoriesInfo[categoryId] = {
          id: categoryId,
          name: `Categoría ${categoryId}`,
          path_from_root: []
        };
      }
    });

    logger.info(`📦 API Categories - Respuesta: ${Object.keys(categoriesInfo).length} categorías procesadas`);

    res.json({
      success: true,
      categories: categoriesInfo,
      total: Object.keys(categoriesInfo).length
    });

  } catch (error) {
    logger.error(`❌ API Categories - Error: ${error.message}`);
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
}

// Export directo sin middleware
module.exports = handleCategories;