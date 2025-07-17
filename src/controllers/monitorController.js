/**
 * Controlador de monitoreo de stock
 * Maneja toda la lógica de negocio relacionada con el monitoreo
 */

const stockMonitor = require('../services/stockMonitor');
const databaseService = require('../services/databaseService');
const logger = require('../utils/logger');

class MonitorController {
  
  /**
   * Iniciar monitoreo
   */
  async startMonitoring(req, res) {
    try {
      const userId = req.user.userId;
      
      logger.info(`🚀 Iniciando monitoreo para usuario: ${userId}`);
      
      const result = await stockMonitor.startMonitoring();
      
      if (result.success) {
        res.json({
          success: true,
          message: 'Monitoreo iniciado correctamente',
          status: stockMonitor.getStatus(),
          timestamp: new Date().toISOString()
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error,
          message: result.message || 'Error iniciando el monitoreo'
        });
      }
      
    } catch (error) {
      logger.error(`❌ Error iniciando monitoreo: ${error.message}`);
      res.status(500).json({
        success: false,
        error: 'Error interno',
        message: 'Error interno iniciando el monitoreo'
      });
    }
  }

  /**
   * Detener monitoreo
   */
  async stopMonitoring(req, res) {
    try {
      const userId = req.user.userId;
      
      logger.info(`⏹️ Deteniendo monitoreo para usuario: ${userId}`);
      
      stockMonitor.stopMonitoring();
      
      res.json({
        success: true,
        message: 'Monitoreo detenido correctamente',
        status: stockMonitor.getStatus(),
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error(`❌ Error deteniendo monitoreo: ${error.message}`);
      res.status(500).json({
        success: false,
        error: 'Error interno',
        message: 'Error interno deteniendo el monitoreo'
      });
    }
  }

  /**
   * Ejecutar verificación manual
   */
  async checkNow(req, res) {
    try {
      const userId = req.user.userId;
      
      logger.info(`🔍 Verificación manual para usuario: ${userId}`);
      
      // Ejecutar verificación inmediata
      const result = await stockMonitor.checkStockChanges();
      
      res.json({
        success: true,
        message: 'Verificación manual completada',
        result: result,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error(`❌ Error en verificación manual: ${error.message}`);
      res.status(500).json({
        success: false,
        error: 'Error en verificación',
        message: error.message
      });
    }
  }

  /**
   * Obtener estado del monitor
   */
  async getStatus(req, res) {
    try {
      const status = stockMonitor.getStatus();
      
      res.json({
        success: true,
        ...status,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error(`❌ Error obteniendo estado: ${error.message}`);
      res.status(500).json({
        success: false,
        error: 'Error obteniendo estado',
        message: error.message
      });
    }
  }

  /**
   * Obtener estado del monitor desde BD
   */
  async getStatusFromDB(req, res) {
    try {
      const userId = req.user.userId;
      
      // Obtener productos y estadísticas desde BD
      const products = await databaseService.getAllProducts(userId);
      const lowStockProducts = await databaseService.getLowStockProducts(userId, 5);
      const alertsCount = await databaseService.getAlertsCount(userId);
      
      // Estado del monitor en memoria
      const monitorStatus = stockMonitor.getStatus();
      
      const dbStatus = {
        success: true,
        userId: userId,
        products: {
          total: products.length,
          active: products.filter(p => p.status === 'active').length,
          paused: products.filter(p => p.status === 'paused').length,
          lowStock: lowStockProducts.length
        },
        alerts: alertsCount,
        monitor: {
          active: monitorStatus.active,
          lastCheck: monitorStatus.lastCheckTime,
          nextCheck: monitorStatus.nextCheckTime,
          interval: monitorStatus.checkInterval
        },
        lastSync: products.length > 0 ? 
          Math.max(...products.map(p => new Date(p.updated_at || 0).getTime())) : 
          null,
        timestamp: new Date().toISOString()
      };
      
      res.json(dbStatus);
      
    } catch (error) {
      logger.error(`❌ Error obteniendo estado desde BD: ${error.message}`);
      res.status(500).json({
        success: false,
        error: 'Error obteniendo estado desde BD',
        message: error.message
      });
    }
  }

  /**
   * Sincronizar productos
   */
  async syncProducts(req, res) {
    try {
      const userId = req.user.userId;
      
      logger.info(`🔄 Iniciando sincronización para usuario: ${userId}`);
      
      // Ejecutar sincronización completa
      const result = await stockMonitor.syncAllProducts();
      
      if (result.success) {
        // Guardar timestamp de sincronización
        await databaseService.saveSyncControl(userId, result.totalProducts);
        
        res.json({
          success: true,
          message: 'Sincronización completada exitosamente',
          totalProducts: result.totalProducts,
          newProducts: result.newProducts,
          updatedProducts: result.updatedProducts,
          timestamp: new Date().toISOString()
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error,
          message: result.message || 'Error en la sincronización'
        });
      }
      
    } catch (error) {
      logger.error(`❌ Error en sincronización: ${error.message}`);
      res.status(500).json({
        success: false,
        error: 'Error interno',
        message: 'Error interno durante la sincronización'
      });
    }
  }
}

module.exports = new MonitorController();