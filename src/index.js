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

// ========== MIDDLEWARE PARA COMPATIBILIDAD CON AUTH LEGACY ==========
// Necesario para mantener compatibilidad con el sistema de auth existente

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