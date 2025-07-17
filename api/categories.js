/**
 * Endpoint serverless para obtener información de categorías
 * Consulta la API de MercadoLibre para obtener nombres legibles
 */

const { withAuth } = require('../src/middleware/serverlessAuth');
const logger = require('../src/utils/logger');

// Mock de ML API Client para pruebas
const mockMLClient = {
  async getCategory(categoryId) {
    // Simulación de respuesta exitosa
    const mockResponses = {
      'MLA10626': { id: 'MLA10626', name: 'Hogar y Jardín', path_from_root: [] },
      'MLA1648': { id: 'MLA1648', name: 'Computación', path_from_root: [] },
      'MLA1144': { id: 'MLA1144', name: 'Consolas y Videojuegos', path_from_root: [] },
      'MLA1000': { id: 'MLA1000', name: 'Electrónicos', path_from_root: [] },
      'MLA1055': { id: 'MLA1055', name: 'Celulares y Teléfonos', path_from_root: [] }
    };
    
    if (mockResponses[categoryId]) {
      return mockResponses[categoryId];
    }
    
    // Si no está en mock, intentar con ML API real
    const MLAPIClient = require('../src/api/ml-api-client');
    const mlClient = new MLAPIClient();
    return await mlClient.getCategory(categoryId);
  }
};

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
    // Usar mock client por ahora para pruebas
    const mlClient = mockMLClient;
    
    // Procesar en lotes de 5 para evitar rate limit
    const chunkSize = 5;
    for (let i = 0; i < categoryIds.length; i += chunkSize) {
      const chunk = categoryIds.slice(i, i + chunkSize);
      
      await Promise.all(chunk.map(async (categoryId) => {
        try {
          // Intentar obtener de la API de ML
          const categoryInfo = await mlClient.getCategory(categoryId);
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