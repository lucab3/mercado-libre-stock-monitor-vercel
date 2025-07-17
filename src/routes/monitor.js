/**
 * Rutas de monitoreo de stock
 */

const express = require('express');
const router = express.Router();
const monitorController = require('../controllers/monitorController');
const { expressAuth } = require('../middleware/expressAuth');

// Todas las rutas de monitor requieren autenticación
router.use(expressAuth);

// Iniciar monitoreo
router.post('/start', monitorController.startMonitoring);

// Detener monitoreo  
router.post('/stop', monitorController.stopMonitoring);

// Verificación manual
router.post('/check-now', monitorController.checkNow);

// Estado del monitor
router.get('/status', monitorController.getStatus);

// Estado del monitor desde BD
router.get('/status-db', monitorController.getStatusFromDB);

// Sincronizar productos
router.post('/sync', monitorController.syncProducts);

module.exports = router;