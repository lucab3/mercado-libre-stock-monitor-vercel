/**
 * Endpoint serverless para obtener información de categorías
 * Consulta la API de MercadoLibre para obtener nombres legibles
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
    const mlApiClient = require('../src/api/ml-api-client');
    
    // Procesar en lotes de 5 para evitar rate limit
    const chunkSize = 5;
    for (let i = 0; i < categoryIds.length; i += chunkSize) {
      const chunk = categoryIds.slice(i, i + chunkSize);
      
      await Promise.all(chunk.map(async (categoryId) => {
        try {
          // Intentar obtener de la API de ML
          const categoryInfo = await mlApiClient.getCategory(categoryId);
          if (categoryInfo && categoryInfo.name) {
            categoriesInfo[categoryId] = {
              id: categoryId,
              name: categoryInfo.name,
              path_from_root: categoryInfo.path_from_root || []
            };
          } else {
            // Fallback al mapeo estático
            categoriesInfo[categoryId] = {
              id: categoryId,
              name: categoryNames[categoryId] || categoryId,
              path_from_root: []
            };
          }
        } catch (error) {
          logger.warn(`⚠️ Error obteniendo categoría ${categoryId}: ${error.message}`);
          // Fallback al mapeo estático
          categoriesInfo[categoryId] = {
            id: categoryId,
            name: categoryNames[categoryId] || categoryId,
            path_from_root: []
          };
        }
      }));
      
      // Pequeña pausa entre lotes
      if (i + chunkSize < categoryIds.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
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