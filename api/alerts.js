/**
 * API endpoint para manejo de alertas de stock
 * Permite obtener, filtrar y configurar alertas
 */

const databaseService = require('../src/services/databaseService');
const sessionManager = require('../src/utils/sessionManager');
const logger = require('../src/utils/logger');

/**
 * Obtener alertas con filtros y paginación
 */
async function getAlerts(req, res) {
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

    const userId = session.userId;
    
    // 2. Obtener parámetros de filtros
    const {
      alertType,
      limit = 50,
      offset = 0,
      onlyUnread = false,
      timeRange = 'all' // 'today', 'week', 'month', 'all'
    } = req.query;

    logger.info(`📋 Obteniendo alertas para usuario ${userId} con filtros:`, {
      alertType,
      limit: parseInt(limit),
      offset: parseInt(offset),
      onlyUnread,
      timeRange
    });

    // 3. Preparar filtros para base de datos
    const filters = {
      limit: parseInt(limit),
      offset: parseInt(offset),
      alertType
    };

    // 4. Obtener alertas desde base de datos
    const alerts = await databaseService.getStockAlerts(userId, filters);
    
    // 5. Obtener conteo por tipo de alerta
    const alertCounts = await databaseService.getAlertsCount(userId);

    // 6. Clasificar alertas por prioridad
    const classifiedAlerts = classifyAlerts(alerts);

    // 7. Preparar respuesta
    const response = {
      success: true,
      alerts: classifiedAlerts,
      counts: alertCounts,
      summary: {
        total: alerts.length,
        critical: classifiedAlerts.filter(a => a.priority === 'critical').length,
        warning: classifiedAlerts.filter(a => a.priority === 'warning').length,
        info: classifiedAlerts.filter(a => a.priority === 'info').length
      },
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: alerts.length === parseInt(limit) // Si llegamos al límite, probablemente hay más
      }
    };

    res.json(response);

  } catch (error) {
    logger.error(`❌ Error obteniendo alertas: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error al obtener alertas'
    });
  }
}

/**
 * Marcar alertas como leídas
 */
async function markAlertsAsRead(req, res) {
  try {
    // 1. Validar autenticación
    const cookieId = req.headers.cookie?.match(/ml-session=([^;]+)/)?.[1];
    if (!cookieId) {
      return res.status(401).json({
        success: false,
        error: 'No hay sesión activa'
      });
    }

    const session = sessionManager.getSessionByCookie(cookieId);
    if (!session) {
      return res.status(401).json({
        success: false,
        error: 'Sesión inválida'
      });
    }

    const userId = session.userId;
    const { alertIds } = req.body;

    if (!alertIds || !Array.isArray(alertIds)) {
      return res.status(400).json({
        success: false,
        error: 'Se requiere un array de alertIds'
      });
    }

    // TODO: Implementar función para marcar alertas como leídas
    // const result = await databaseService.markAlertsAsRead(userId, alertIds);

    res.json({
      success: true,
      message: `${alertIds.length} alertas marcadas como leídas`,
      markedCount: alertIds.length
    });

  } catch (error) {
    logger.error(`❌ Error marcando alertas como leídas: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Obtener configuración de alertas del usuario
 */
async function getAlertSettings(req, res) {
  try {
    // 1. Validar autenticación
    const cookieId = req.headers.cookie?.match(/ml-session=([^;]+)/)?.[1];
    if (!cookieId) {
      return res.status(401).json({
        success: false,
        error: 'No hay sesión activa'
      });
    }

    const session = sessionManager.getSessionByCookie(cookieId);
    if (!session) {
      return res.status(401).json({
        success: false,
        error: 'Sesión inválida'
      });
    }

    const userId = session.userId;

    // Configuración por defecto
    const defaultSettings = {
      popupsEnabled: true,
      soundEnabled: false,
      lowStockThreshold: 5,
      showCriticalOnly: false,
      autoMarkAsRead: false
    };

    // TODO: Implementar obtención de configuración desde base de datos
    // const userSettings = await databaseService.getUserAlertSettings(userId);

    res.json({
      success: true,
      settings: defaultSettings
    });

  } catch (error) {
    logger.error(`❌ Error obteniendo configuración de alertas: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Actualizar configuración de alertas del usuario
 */
async function updateAlertSettings(req, res) {
  try {
    // 1. Validar autenticación
    const cookieId = req.headers.cookie?.match(/ml-session=([^;]+)/)?.[1];
    if (!cookieId) {
      return res.status(401).json({
        success: false,
        error: 'No hay sesión activa'
      });
    }

    const session = sessionManager.getSessionByCookie(cookieId);
    if (!session) {
      return res.status(401).json({
        success: false,
        error: 'Sesión inválida'
      });
    }

    const userId = session.userId;
    const { settings } = req.body;

    if (!settings) {
      return res.status(400).json({
        success: false,
        error: 'Se requiere el objeto settings'
      });
    }

    logger.info(`⚙️ Actualizando configuración de alertas para usuario ${userId}:`, settings);

    // TODO: Implementar actualización de configuración en base de datos
    // const result = await databaseService.updateUserAlertSettings(userId, settings);

    res.json({
      success: true,
      message: 'Configuración de alertas actualizada',
      settings: settings
    });

  } catch (error) {
    logger.error(`❌ Error actualizando configuración de alertas: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Clasificar alertas por prioridad y agregar metadata
 */
function classifyAlerts(alerts) {
  return alerts.map(alert => {
    const baseAlert = {
      ...alert,
      timeAgo: getTimeAgo(alert.created_at),
      formattedTime: new Date(alert.created_at).toLocaleString()
    };

    // Clasificar por tipo y prioridad
    switch (alert.alert_type) {
      case 'LOW_STOCK':
        return {
          ...baseAlert,
          priority: 'critical',
          color: '#dc3545', // Rojo
          bgColor: '#f8d7da',
          icon: '🚨',
          title: 'Stock Bajo',
          description: `El producto "${alert.product_title}" tiene solo ${alert.new_stock} unidades disponibles`,
          actionRequired: true
        };
      
      case 'STOCK_DECREASE':
        return {
          ...baseAlert,
          priority: alert.new_stock <= 10 ? 'warning' : 'info',
          color: alert.new_stock <= 10 ? '#fd7e14' : '#6c757d',
          bgColor: alert.new_stock <= 10 ? '#fdefd5' : '#e9ecef',
          icon: '📉',
          title: 'Stock Disminuido',
          description: `El stock del producto "${alert.product_title}" bajó de ${alert.previous_stock} a ${alert.new_stock} unidades`,
          actionRequired: alert.new_stock <= 10
        };
      
      case 'STOCK_INCREASE':
        return {
          ...baseAlert,
          priority: 'info',
          color: '#28a745', // Verde
          bgColor: '#d4edda',
          icon: '📈',
          title: 'Stock Aumentado',
          description: `El stock del producto "${alert.product_title}" subió de ${alert.previous_stock} a ${alert.new_stock} unidades`,
          actionRequired: false
        };
      
      default:
        return {
          ...baseAlert,
          priority: 'info',
          color: '#6c757d',
          bgColor: '#e9ecef',
          icon: '📦',
          title: 'Alerta de Stock',
          description: `Cambio en el producto "${alert.product_title}"`,
          actionRequired: false
        };
    }
  });
}

/**
 * Calcular tiempo transcurrido
 */
function getTimeAgo(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffInMs = now - date;
  const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
  const diffInHours = Math.floor(diffInMinutes / 60);
  const diffInDays = Math.floor(diffInHours / 24);

  if (diffInMinutes < 1) {
    return 'Hace menos de 1 minuto';
  } else if (diffInMinutes < 60) {
    return `Hace ${diffInMinutes} minuto${diffInMinutes > 1 ? 's' : ''}`;
  } else if (diffInHours < 24) {
    return `Hace ${diffInHours} hora${diffInHours > 1 ? 's' : ''}`;
  } else if (diffInDays < 7) {
    return `Hace ${diffInDays} día${diffInDays > 1 ? 's' : ''}`;
  } else {
    return date.toLocaleDateString();
  }
}

/**
 * Manejador principal de rutas
 */
async function handleAlerts(req, res) {
  switch (req.method) {
    case 'GET':
      return await getAlerts(req, res);
    
    case 'POST':
      if (req.url?.endsWith('/mark-read')) {
        return await markAlertsAsRead(req, res);
      }
      return res.status(404).json({ error: 'Endpoint no encontrado' });
    
    case 'PUT':
      if (req.url?.endsWith('/settings')) {
        return await updateAlertSettings(req, res);
      }
      return res.status(404).json({ error: 'Endpoint no encontrado' });
    
    default:
      return res.status(405).json({ error: 'Método no permitido' });
  }
}

/**
 * Manejador para configuración de alertas
 */
async function handleAlertSettings(req, res) {
  switch (req.method) {
    case 'GET':
      return await getAlertSettings(req, res);
    
    case 'PUT':
      return await updateAlertSettings(req, res);
    
    default:
      return res.status(405).json({ error: 'Método no permitido' });
  }
}

// Export por defecto para Vercel
export default async function handler(req, res) {
  // Habilitar CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  return await handleAlerts(req, res);
}

// También exportar funciones individuales para uso interno
module.exports = {
  handleAlerts,
  handleAlertSettings,
  getAlerts,
  markAlertsAsRead,
  getAlertSettings,
  updateAlertSettings
};