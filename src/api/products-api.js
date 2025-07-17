/**
 * API endpoint para productos usando middleware de autenticación centralizado
 * Reemplaza la lógica de productos que estaba en index.js
 */

const databaseService = require('../services/databaseService');
const { withAuth } = require('../middleware/serverlessAuth');
const logger = require('../utils/logger');

/**
 * Obtener todos los productos del usuario autenticado
 */
async function getProducts(req, res) {
  try {
    // La autenticación ya fue validada por withAuth middleware
    const userId = req.auth.userId;
    
    logger.info(`📦 Obteniendo productos para usuario: ${userId}`);
    const products = await databaseService.getAllProducts(userId);
    logger.info(`📦 Productos encontrados: ${products.length}`);
    
    // Formatear productos para el frontend
    const productDetails = products.map(product => ({
      id: product.id,
      title: product.title,
      seller_sku: product.seller_sku,
      available_quantity: product.available_quantity,
      status: product.status,
      permalink: product.permalink,
      thumbnail: null, // No tenemos thumbnails en BD
      updated_at: product.updated_at || product.last_webhook_sync
    }));
    
    res.json({
      success: true,
      products: productDetails,
      total: products.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error(`❌ Error obteniendo productos: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Error obteniendo productos',
      message: error.message
    });
  }
}

/**
 * Obtener estadísticas de productos
 */
async function getProductStats(req, res) {
  try {
    // La autenticación ya fue validada por withAuth middleware
    const userId = req.auth.userId;
    
    logger.info(`📊 Obteniendo estadísticas para usuario: ${userId}`);
    
    // Obtener productos y calcular estadísticas
    const products = await databaseService.getAllProducts(userId);
    const lowStockProducts = await databaseService.getLowStockProducts(userId, 5);
    
    const stats = {
      totalProducts: products.length,
      lowStockProducts: lowStockProducts.length,
      activeProducts: products.filter(p => p.status === 'active').length,
      pausedProducts: products.filter(p => p.status === 'paused').length,
      lastSync: products.length > 0 ? 
        Math.max(...products.map(p => new Date(p.updated_at || p.last_webhook_sync || 0).getTime())) : 
        null,
      monitoring: false // TODO: Obtener estado real del monitor
    };
    
    res.json({
      success: true,
      ...stats,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error(`❌ Error obteniendo estadísticas: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Error obteniendo estadísticas',
      message: error.message
    });
  }
}

/**
 * Manejador principal de rutas
 */
async function handleProducts(req, res) {
  const { method, url } = req;
  
  switch (method) {
    case 'GET':
      if (url?.endsWith('/stats')) {
        return await getProductStats(req, res);
      }
      return await getProducts(req, res);
    
    default:
      return res.status(405).json({
        success: false,
        error: 'Método no permitido',
        allowedMethods: ['GET']
      });
  }
}

// Export con middleware de autenticación centralizado
module.exports = withAuth(handleProducts);