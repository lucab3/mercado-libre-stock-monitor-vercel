/**
 * Endpoint para limpiar webhooks antiguos y optimizar el procesamiento
 */

const databaseService = require('../services/databaseService');
const sessionManager = require('../utils/sessionManager');
const logger = require('../utils/logger');

/**
 * Limpiar webhooks antiguos
 */
async function cleanupOldWebhooks(req, res) {
  try {
    // 1. Validar autenticación
    const cookieId = req.headers.cookie?.match(/ml-session=([^;]+)/)?.[1];
    if (!cookieId) {
      return res.status(401).json({
        success: false,
        error: 'No hay sesión activa',
        needsAuth: true
      });
    }

    const session = sessionManager.getSessionByCookie(cookieId);
    if (!session) {
      return res.status(401).json({
        success: false,
        error: 'Sesión inválida',
        needsAuth: true
      });
    }

    logger.info('🧹 Iniciando limpieza de webhooks antiguos...');

    // 2. Obtener estadísticas antes de la limpieza
    const statsBefore = await databaseService.getStats();
    const pendingWebhooksBefore = statsBefore.pendingWebhooks || 0;

    // 3. Ejecutar limpieza
    await databaseService.runMaintenance();

    // 4. Obtener estadísticas después de la limpieza
    const statsAfter = await databaseService.getStats();
    const pendingWebhooksAfter = statsAfter.pendingWebhooks || 0;

    const cleanedCount = pendingWebhooksBefore - pendingWebhooksAfter;

    logger.info(`✅ Limpieza completada: ${cleanedCount} webhooks procesados/limpiados`);

    res.json({
      success: true,
      message: 'Limpieza de webhooks completada',
      results: {
        webhooksBefore: pendingWebhooksBefore,
        webhooksAfter: pendingWebhooksAfter,
        cleaned: cleanedCount,
        improvement: `${((cleanedCount / Math.max(pendingWebhooksBefore, 1)) * 100).toFixed(1)}%`
      },
      stats: {
        before: statsBefore,
        after: statsAfter
      }
    });

  } catch (error) {
    logger.error(`❌ Error en limpieza de webhooks: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error en limpieza de webhooks'
    });
  }
}

/**
 * Obtener estadísticas de webhooks
 */
async function getWebhookStats(req, res) {
  try {
    // 1. Validar autenticación
    const cookieId = req.headers.cookie?.match(/ml-session=([^;]+)/)?.[1];
    if (!cookieId) {
      return res.status(401).json({
        success: false,
        error: 'No hay sesión activa',
        needsAuth: true
      });
    }

    const session = sessionManager.getSessionByCookie(cookieId);
    if (!session) {
      return res.status(401).json({
        success: false,
        error: 'Sesión inválida',
        needsAuth: true
      });
    }

    // 2. Obtener estadísticas
    const stats = await databaseService.getStats();

    res.json({
      success: true,
      stats: stats,
      recommendations: generateRecommendations(stats)
    });

  } catch (error) {
    logger.error(`❌ Error obteniendo estadísticas: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Generar recomendaciones basadas en estadísticas
 */
function generateRecommendations(stats) {
  const recommendations = [];
  
  if (stats.pendingWebhooks > 100) {
    recommendations.push({
      type: 'warning',
      message: `Hay ${stats.pendingWebhooks} webhooks pendientes`,
      action: 'Ejecutar limpieza de webhooks',
      priority: 'high'
    });
  }

  if (stats.pendingWebhooks > 500) {
    recommendations.push({
      type: 'error',
      message: 'Acumulación crítica de webhooks',
      action: 'Ejecutar limpieza inmediata y revisar configuración',
      priority: 'critical'
    });
  }

  if (stats.lowStockProducts > 50) {
    recommendations.push({
      type: 'info',
      message: `${stats.lowStockProducts} productos con stock bajo`,
      action: 'Revisar inventario y reabastecimiento',
      priority: 'medium'
    });
  }

  return recommendations;
}

/**
 * Manejador principal
 */
module.exports = async function handler(req, res) {
  // Habilitar CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  switch (req.method) {
    case 'POST':
      return await cleanupOldWebhooks(req, res);
    
    case 'GET':
      return await getWebhookStats(req, res);
    
    default:
      return res.status(405).json({ error: 'Método no permitido' });
  }
}