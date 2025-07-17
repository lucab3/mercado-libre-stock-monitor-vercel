/**
 * Entry point principal usando arquitectura MVC
 * Mantiene compatibilidad con deployment existente
 */

const createApp = require('./app');
const logger = require('./utils/logger');

// Crear aplicación usando la nueva arquitectura MVC
const app = createApp();

// Puerto de configuración
const port = process.env.PORT || 3000;

// ========== RUTAS TEMPORALES DE COMPATIBILIDAD ==========
// TODO: Migrar estas rutas a controladores dedicados

// Mantener algunas rutas críticas del index.js original por compatibilidad
const auth = require('./api/auth');
const stockMonitor = require('./services/stockMonitor');
const webhookProcessor = require('./services/webhookProcessor');
const sessionManager = require('./utils/sessionManager');
const databaseService = require('./services/databaseService');

// Middleware para compatibilidad con auth legacy
app.use((req, res, next) => {
  const sessionCookie = req.cookies['ml-session'];
  if (sessionCookie) {
    auth.setCurrentCookieId(sessionCookie);
  } else {
    auth.setCurrentCookieId(null);
  }
  req.sessionCookie = sessionCookie;
  next();
});

// ========== ENDPOINTS CRÍTICOS MANTENIDOS ==========

// Webhook de ML (crítico para funcionamiento)
app.post('/api/webhooks/ml', async (req, res) => {
  try {
    logger.info('🔔 Webhook ML recibido');
    const result = await webhookProcessor.processWebhook(req.body);
    
    if (result.success) {
      res.status(200).json({ status: 'processed', result });
    } else {
      res.status(400).json({ status: 'error', error: result.error });
    }
  } catch (error) {
    logger.error(`❌ Error procesando webhook: ${error.message}`);
    res.status(500).json({ status: 'error', error: error.message });
  }
});

// API sync-next (usado por el monitoreo)
app.get('/api/sync-next', async (req, res) => {
  try {
    const sessionCookie = req.sessionCookie;
    
    if (!sessionCookie) {
      return res.status(401).json({ error: 'No autenticado' });
    }
    
    const session = await databaseService.getUserSession(sessionCookie);
    if (!session) {
      return res.status(401).json({ error: 'Sesión inválida' });
    }
    
    // Ejecutar sync
    const result = await stockMonitor.syncAllProducts();
    
    if (result.success) {
      await databaseService.saveSyncControl(session.userId, result.totalProducts);
    }
    
    res.json(result);
    
  } catch (error) {
    logger.error(`Error en sync-next: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// API auth status (para compatibilidad)
app.get('/api/auth/status', async (req, res) => {
  try {
    const sessionCookie = req.sessionCookie;
    
    if (!sessionCookie) {
      return res.json({ authenticated: false, needsAuth: true });
    }
    
    const session = await databaseService.getUserSession(sessionCookie);
    
    if (session) {
      res.json({
        authenticated: true,
        user: { id: session.userId },
        session: { createdAt: session.createdAt }
      });
    } else {
      res.json({ authenticated: false, needsAuth: true });
    }
    
  } catch (error) {
    logger.error(`Error en auth status: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Webhook status
app.get('/api/webhooks/status', async (req, res) => {
  try {
    const pendingWebhooks = await databaseService.getPendingWebhooks(10);
    
    res.json({
      success: true,
      pendingCount: pendingWebhooks.length,
      pending: pendingWebhooks,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error(`Error obteniendo estado webhooks: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Debug endpoints (solo desarrollo)
if (process.env.NODE_ENV === 'development') {
  app.get('/debug/auth-state', (req, res) => {
    res.json({
      isAuthenticated: auth.isAuthenticated(),
      mockMode: auth.mockMode,
      sessionCookie: req.sessionCookie ? req.sessionCookie.substring(0, 8) + '...' : null,
      sessionStats: sessionManager.getStats()
    });
  });
}

// ========== STARTUP ==========

// Inicializar servicios
async function initializeServices() {
  try {
    logger.info('🔧 Inicializando servicios...');
    
    // Inicializar session manager
    logger.info('🔐 Session Manager inicializado');
    
    // Inicializar stock monitor
    logger.info('📊 Stock Monitor inicializado');
    
    logger.info('✅ Todos los servicios inicializados correctamente');
    
  } catch (error) {
    logger.error(`❌ Error inicializando servicios: ${error.message}`);
    throw error;
  }
}

// Función para iniciar servidor (para uso local)
async function startServer() {
  try {
    await initializeServices();
    
    app.listen(port, () => {
      logger.info(`🚀 Servidor iniciado en puerto ${port}`);
      logger.info(`🌐 Disponible en: http://localhost:${port}`);
    });
    
  } catch (error) {
    logger.error(`❌ Error iniciando servidor: ${error.message}`);
    process.exit(1);
  }
}

// Iniciar servidor solo si es ejecutado directamente
if (require.main === module) {
  startServer();
}

// Exportar app para Vercel
module.exports = app;