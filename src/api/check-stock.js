/**
 * Endpoint para verificación de stock (para Vercel Cron)
 * Puede ser llamado por un Cron Job de Vercel para verificar el stock periódicamente
 * Configurar en vercel.json: "crons": [{"path": "/api/check-stock", "schedule": "*/15 * * * *"}]
 */

const auth = require('../src/api/auth');
const stockMonitor = require('../src/services/stockMonitor');
const logger = require('../src/utils/logger');

module.exports = async (req, res) => {
  try {
    // Verificar si estamos autenticados
    if (!auth.isAuthenticated()) {
      return res.status(401).json({
        success: false,
        message: 'No autenticado. Necesitas autenticarte primero con Mercado Libre.'
      });
    }

    // Ejecutar la verificación de stock
    logger.info('Iniciando verificación de stock programada...');
    await stockMonitor.checkStock();
    
    // Responder con éxito
    return res.status(200).json({
      success: true,
      message: 'Verificación de stock completada correctamente',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error(`Error al ejecutar verificación de stock programada: ${error.message}`);
    
    // Responder con error
    return res.status(500).json({
      success: false,
      message: 'Error al verificar stock',
      error: error.message
    });
  }
};