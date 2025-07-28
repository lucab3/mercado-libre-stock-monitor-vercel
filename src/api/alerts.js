/**
 * API endpoint para manejo de alertas de stock
 * Permite obtener, filtrar y configurar alertas
 * REFACTORIZADO: Usa middleware de autenticación centralizado
 */

const databaseService = require('../services/databaseService');
const { withAuth } = require('../middleware/serverlessAuth');
const logger = require('../utils/logger');

/**
 * Obtener alertas con filtros y paginación
 */
async function getAlerts(req, res) {
  try {
    // La autenticación ya fue validada por withAuth middleware
    const userId = req.auth.userId;
    
    // 2. Obtener y validar parámetros de filtros de forma segura
    const {
      alertType: rawAlertType,
      priority: rawPriority, 
      limit: rawLimit = 50,
      offset: rawOffset = 0,
      onlyUnread: rawOnlyUnread = false,
      timeRange: rawTimeRange = 'all'
    } = req.query;
    
    // Validación de seguridad que preserva comportamiento original
    const validAlertTypes = ['LOW_STOCK', 'STOCK_DECREASE', 'STOCK_INCREASE'];
    const validPriorities = ['critical', 'warning', 'info'];
    const validTimeRanges = ['today', 'week', 'month', 'all'];
    
    // alertType: permitir undefined, validar solo si está presente
    const alertType = rawAlertType && !validAlertTypes.includes(rawAlertType) 
      ? (logger.warn(`🚨 alertType inválido: ${rawAlertType} desde IP: ${req.ip}`), undefined)
      : rawAlertType;
    
    // priority: preservar undefined para lógica hasValidPriorityFilter
    const priority = rawPriority && !validPriorities.includes(rawPriority)
      ? (logger.warn(`🚨 priority inválido: ${rawPriority} desde IP: ${req.ip}`), undefined)
      : rawPriority;
    
    // limit: validar rango y convertir a número
    const limitNum = parseInt(rawLimit);
    const limit = isNaN(limitNum) || limitNum < 1 || limitNum > 500 
      ? (logger.warn(`🚨 limit inválido: ${rawLimit} desde IP: ${req.ip}`), 50)
      : limitNum;
    
    // offset: validar no negativo
    const offsetNum = parseInt(rawOffset);
    const offset = isNaN(offsetNum) || offsetNum < 0 || offsetNum > 100000
      ? (logger.warn(`🚨 offset inválido: ${rawOffset} desde IP: ${req.ip}`), 0)
      : offsetNum;
    
    // onlyUnread: validar boolean
    const onlyUnread = rawOnlyUnread === 'true' || rawOnlyUnread === true;
    
    // timeRange: validar enum
    const timeRange = !validTimeRanges.includes(rawTimeRange)
      ? (logger.warn(`🚨 timeRange inválido: ${rawTimeRange} desde IP: ${req.ip}`), 'all')
      : rawTimeRange;

    logger.info(`📋 Obteniendo alertas para usuario ${userId} con filtros:`, {
      alertType,
      priority,
      limit,
      offset,
      onlyUnread,
      timeRange
    });

    // 3. Preparar filtros para base de datos (sin paginación inicial si hay filtro de prioridad)
    const hasValidPriorityFilter = priority && priority.trim() !== '' && priority !== 'all';
    const filters = {
      limit: hasValidPriorityFilter ? 500 : limit, // Si hay filtro de prioridad, traer más para filtrar después
      offset: hasValidPriorityFilter ? 0 : offset,  // Si hay filtro de prioridad, empezar desde 0
      alertType
    };

    // 4. SIEMPRE obtener todas las alertas para calcular contadores correctos
    const allAlertsFilters = { limit: 1000, offset: 0, alertType };
    const allAlerts = await databaseService.getStockAlerts(userId, allAlertsFilters);
    
    // 5. Clasificar TODAS las alertas por prioridad para contadores
    const allClassifiedAlerts = classifyAlerts(allAlerts);
    
    // 6. Obtener alertas con filtros específicos para mostrar
    const alerts = await databaseService.getStockAlerts(userId, filters);
    const classifiedAlerts = classifyAlerts(alerts);
    
    // 7. Filtrar por prioridad si se especifica
    let filteredAlerts = classifiedAlerts;
    if (hasValidPriorityFilter) {
      filteredAlerts = classifiedAlerts.filter(alert => alert.priority === priority);
      logger.info(`🔍 Filtrando por prioridad '${priority}': ${filteredAlerts.length}/${classifiedAlerts.length} alertas`);
    } else {
      logger.info(`📋 Mostrando todas las alertas: ${classifiedAlerts.length}`);
    }
    
    // 7. Aplicar paginación después de filtrar por prioridad
    const startIndex = offset;
    const endIndex = startIndex + limit;
    const paginatedAlerts = filteredAlerts.slice(startIndex, endIndex);
    
    // 8. Obtener conteo por tipo de alerta
    const alertCounts = await databaseService.getAlertsCount(userId);
    
    // 9. Preparar respuesta
    const response = {
      success: true,
      alerts: paginatedAlerts,
      counts: alertCounts,
      summary: {
        total: allClassifiedAlerts.length, // Total real de todas las alertas
        critical: allClassifiedAlerts.filter(a => a.priority === 'critical').length,
        warning: allClassifiedAlerts.filter(a => a.priority === 'warning').length,
        info: allClassifiedAlerts.filter(a => a.priority === 'informative').length
      },
      pagination: {
        limit,
        offset,
        hasMore: endIndex < filteredAlerts.length
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
    // La autenticación ya fue validada por withAuth middleware
    const userId = req.auth.userId;
    const { alertIds: rawAlertIds } = req.body;

    // Validar alertIds array
    if (!rawAlertIds || !Array.isArray(rawAlertIds)) {
      logger.warn(`🚨 alertIds no es array desde IP: ${req.ip}`);
      return res.status(400).json({
        success: false,
        error: 'Se requiere un array de alertIds'
      });
    }
    
    // Validar límite para prevenir DoS
    if (rawAlertIds.length > 1000) {
      logger.warn(`🚨 Demasiados alertIds (${rawAlertIds.length}) desde IP: ${req.ip}`);
      return res.status(400).json({
        success: false,
        error: 'Máximo 1000 alertIds permitidos'
      });
    }
    
    // Validar y sanitizar cada alertId
    const alertIds = [];
    for (let i = 0; i < rawAlertIds.length; i++) {
      const id = rawAlertIds[i];
      
      // Validar que sea string/number y convertir a string
      if (typeof id === 'string' || typeof id === 'number') {
        const stringId = String(id).slice(0, 50); // Limitar longitud
        
        // Validar formato (números o UUIDs típicos)
        if (/^[a-zA-Z0-9_-]+$/.test(stringId)) {
          alertIds.push(stringId);
        } else {
          logger.warn(`🚨 alertId con formato inválido: ${stringId} desde IP: ${req.ip}`);
        }
      }
    }
    
    if (alertIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No se encontraron alertIds válidos'
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
    // La autenticación ya fue validada por withAuth middleware
    const userId = req.auth.userId;

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
    // La autenticación ya fue validada por withAuth middleware
    const userId = req.auth.userId;
    const { settings: rawSettings } = req.body;

    // Validar que settings sea un objeto
    if (!rawSettings || typeof rawSettings !== 'object' || Array.isArray(rawSettings)) {
      logger.warn(`🚨 settings no es objeto desde IP: ${req.ip}`);
      return res.status(400).json({
        success: false,  
        error: 'Se requiere el objeto settings'
      });
    }
    
    // Validar y sanitizar configuraciones
    const settings = {};
    
    // popupsEnabled: boolean
    if ('popupsEnabled' in rawSettings) {
      settings.popupsEnabled = Boolean(rawSettings.popupsEnabled);
    }
    
    // soundEnabled: boolean  
    if ('soundEnabled' in rawSettings) {
      settings.soundEnabled = Boolean(rawSettings.soundEnabled);
    }
    
    // lowStockThreshold: number (1-100)
    if ('lowStockThreshold' in rawSettings) {
      const threshold = Number(rawSettings.lowStockThreshold);
      if (isNaN(threshold) || threshold < 1 || threshold > 100) {
        logger.warn(`🚨 lowStockThreshold inválido: ${rawSettings.lowStockThreshold} desde IP: ${req.ip}`);
        return res.status(400).json({
          success: false,
          error: 'lowStockThreshold debe ser un número entre 1 y 100'
        });
      }
      settings.lowStockThreshold = Math.floor(threshold);
    }
    
    // showCriticalOnly: boolean
    if ('showCriticalOnly' in rawSettings) {
      settings.showCriticalOnly = Boolean(rawSettings.showCriticalOnly);
    }
    
    // autoMarkAsRead: boolean
    if ('autoMarkAsRead' in rawSettings) {
      settings.autoMarkAsRead = Boolean(rawSettings.autoMarkAsRead);
    }
    
    // Verificar que al menos una configuración sea válida
    if (Object.keys(settings).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No se encontraron configuraciones válidas'
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
          priority: alert.new_stock <= 10 ? 'warning' : 'informative',
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
          priority: 'informative',
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
          priority: 'informative',
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
 * Obtener configuración de alertas del usuario (movido desde alert-settings.js)
 */
async function getAlertSettings(req, res) {
  try {
    const userId = req.auth.userId;

    // Configuración por defecto
    const defaultSettings = {
      popupsEnabled: true,
      soundEnabled: false,
      lowStockThreshold: 5,
      showCriticalOnly: false,
      autoMarkAsRead: false
    };

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
 * Actualizar configuración de alertas del usuario (movido desde alert-settings.js)
 */
async function updateAlertSettings(req, res) {
  try {
    const userId = req.auth.userId;
    const { settings } = req.body;

    if (!settings) {
      return res.status(400).json({
        success: false,
        error: 'Se requiere el objeto settings'
      });
    }

    logger.info(`⚙️ Actualizando configuración de alertas para usuario ${userId}:`, settings);

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
 * Manejador principal de rutas
 */
async function handleAlerts(req, res) {
  // Manejar rutas de configuración
  if (req.url?.endsWith('/settings')) {
    switch (req.method) {
      case 'GET':
        return await getAlertSettings(req, res);
      case 'PUT':
        return await updateAlertSettings(req, res);
      default:
        return res.status(405).json({ error: 'Método no permitido para settings' });
    }
  }

  // Manejar rutas de alertas principales
  switch (req.method) {
    case 'GET':
      return await getAlerts(req, res);
    
    case 'POST':
      if (req.url?.endsWith('/mark-read')) {
        return await markAlertsAsRead(req, res);
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

// Export por defecto para Vercel con middleware de autenticación centralizado
module.exports = withAuth(handleAlerts);