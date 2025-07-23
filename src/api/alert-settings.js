/**
 * API endpoint para configuración de alertas
 */

const databaseService = require('../services/databaseService');
const logger = require('../utils/logger');

// Parse cookies manually since we don't have middleware
function parseCookies(cookieHeader) {
  const cookies = {};
  if (cookieHeader) {
    cookieHeader.split(';').forEach(cookie => {
      const [name, value] = cookie.trim().split('=');
      if (name && value) {
        cookies[name] = decodeURIComponent(value);
      }
    });
  }
  return cookies;
}

/**
 * Obtener configuración de alertas del usuario
 */
async function getAlertSettings(req, res) {
  try {
    // 1. Validar autenticación
    const cookies = parseCookies(req.headers.cookie);
    const cookieId = cookies['ml-session'];
    if (!cookieId) {
      return res.status(401).json({
        success: false,
        error: 'No hay sesión activa'
      });
    }

    const session = await databaseService.getUserSession(cookieId);
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
    const cookies = parseCookies(req.headers.cookie);
    const cookieId = cookies['ml-session'];
    if (!cookieId) {
      return res.status(401).json({
        success: false,
        error: 'No hay sesión activa'
      });
    }

    const session = await databaseService.getUserSession(cookieId);
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

module.exports = async function handler(req, res) {
  // Habilitar CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  switch (req.method) {
    case 'GET':
      return await getAlertSettings(req, res);
    
    case 'PUT':
      return await updateAlertSettings(req, res);
    
    default:
      return res.status(405).json({ error: 'Método no permitido' });
  }
};