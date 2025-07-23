/**
 * API endpoint para productos usando middleware de autenticación centralizado
 * Reemplaza la lógica de productos que estaba en index.js
 */

const databaseService = require('../services/databaseService');
const { withAuth } = require('../middleware/serverlessAuth');
const logger = require('../utils/logger');

// Almacenamiento temporal de departamentos en memoria (en producción sería en base de datos)
const departmentStorage = new Map();

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
    const productDetails = products.map(product => {
      // Generar URL correcta usando el mismo método que el HTML original
      const productUrl = product.permalink || `https://articulo.mercadolibre.com.ar/${product.id}`;
      
      return {
        id: product.id,
        title: product.title,
        seller_sku: product.seller_sku,
        available_quantity: product.available_quantity,
        status: product.status,
        permalink: product.permalink,
        productUrl: productUrl, // URL preferida para links
        category_id: product.category_id, // Agregar category_id para filtros
        thumbnail: null, // No tenemos thumbnails en BD
        updated_at: product.updated_at || product.last_webhook_sync
      };
    });
    
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
 * Obtener configuración de departamentos del usuario
 */
async function getDepartments(req, res) {
  try {
    const userId = req.auth.userId;
    
    logger.info(`📁 Obteniendo configuración de departamentos para usuario: ${userId}`);
    
    // Obtener configuración del usuario (por ahora desde memoria, después desde BD)
    const userDepartments = departmentStorage.get(userId) || [];
    
    logger.info(`📁 Encontrados ${userDepartments.length} departamentos configurados`);
    
    res.json({
      success: true,
      departments: userDepartments,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error(`❌ Error obteniendo departamentos: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Error obteniendo configuración de departamentos',
      message: error.message
    });
  }
}

/**
 * Guardar configuración de departamentos del usuario
 */
async function saveDepartments(req, res) {
  try {
    const userId = req.auth.userId;
    const { departments } = req.body;
    
    if (!Array.isArray(departments)) {
      return res.status(400).json({
        success: false,
        error: 'Formato inválido',
        message: 'departments debe ser un array'
      });
    }
    
    // Validar estructura de departamentos
    for (const dept of departments) {
      if (!dept.id || !dept.name || !Array.isArray(dept.categories)) {
        return res.status(400).json({
          success: false,
          error: 'Estructura de departamento inválida',
          message: 'Cada departamento debe tener id, name y categories (array)'
        });
      }
    }
    
    logger.info(`💾 Guardando ${departments.length} departamentos para usuario: ${userId}`);
    
    // Guardar en memoria (por ahora)
    departmentStorage.set(userId, departments);
    
    // Log de los departamentos guardados
    departments.forEach(dept => {
      logger.info(`  📁 ${dept.name}: ${dept.categories.length} categorías [${dept.categories.map(c => c.name).join(', ')}]`);
    });
    
    res.json({
      success: true,
      message: 'Configuración de departamentos guardada correctamente',
      departments: departments,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error(`❌ Error guardando departamentos: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Error guardando configuración de departamentos',
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
      if (url?.includes('/departments')) {
        return await getDepartments(req, res);
      }
      return await getProducts(req, res);
    
    case 'POST':
      if (url?.includes('/departments')) {
        return await saveDepartments(req, res);
      }
      return res.status(404).json({
        success: false,
        error: 'Endpoint no encontrado'
      });
    
    default:
      return res.status(405).json({
        success: false,
        error: 'Método no permitido',
        allowedMethods: ['GET', 'POST']
      });
  }
}

// Export con middleware de autenticación centralizado
module.exports = withAuth(handleProducts);