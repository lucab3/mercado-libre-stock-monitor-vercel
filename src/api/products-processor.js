/**
 * Endpoint HTTP para procesamiento inteligente de productos
 * Wrapper HTTP para el servicio de procesamiento
 */

const { withAuth } = require('../middleware/serverlessAuth');
const databaseService = require('../services/databaseService');
const logger = require('../utils/logger');
const { processProductsBatch } = require('../services/productProcessor');


/**
 * Procesar actualizaciones de productos via HTTP
 * Wrapper HTTP que delega al servicio de procesamiento
 */
async function processProductUpdates(req, res) {
  try {
    const userId = req.auth.userId;
    const { productIds } = req.body;

    // Usar la instancia singleton de mlApiService
    const mlApiServiceInstance = require('./ml-api-products-service');
    
    // Inyectar dependencias
    const dependencies = {
      databaseService,
      mlApiService: mlApiServiceInstance,
      logger
    };

    // Delegar al servicio puro
    const result = await processProductsBatch(productIds, userId, dependencies);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }

  } catch (error) {
    logger.error(`❌ HTTP Wrapper Error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Error en endpoint de procesamiento',
      message: error.message
    });
  }
}

/**
 * Manejador principal de rutas
 */
async function handleProcessProducts(req, res) {
  switch (req.method) {
    case 'POST':
      return await processProductUpdates(req, res);
    
    default:
      return res.status(405).json({ error: 'Método no permitido' });
  }
}

// Export solo para HTTP con middleware de autenticación
module.exports = withAuth(handleProcessProducts);