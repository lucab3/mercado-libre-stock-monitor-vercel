/**
 * Configuración principal de la aplicación Express
 * Arquitectura MVC limpia y escalable
 */

// Cargar variables de entorno ANTES que cualquier otra cosa
const path = require('path');
const fs = require('fs');

// Cargar .env.local si existe, sino usar .env
const envPath = path.join(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
} else {
  require('dotenv').config();
}

const express = require('express');
const cookieParser = require('cookie-parser');
const logger = require('./utils/logger');
const corsMiddleware = require('./middleware/cors');

// Importar rutas
const authRoutes = require('./routes/auth');
const monitorRoutes = require('./routes/monitor');
// const webhookRoutes = require('./routes/webhooks'); // TODO: Crear
// const healthRoutes = require('./routes/health'); // TODO: Crear

/**
 * Crear y configurar aplicación Express
 */
function createApp() {
  const app = express();
  
  logger.info('🚀 Configurando aplicación Express MVC...');
  logger.info(`🌍 Entorno: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`🎭 Mock API: ${process.env.MOCK_ML_API === 'true' ? 'ACTIVADO' : 'DESACTIVADO'}`);
  
  // ========== MIDDLEWARES BÁSICOS ==========
  
  // CORS
  app.use(corsMiddleware);
  
  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  
  // Cookies
  app.use(cookieParser());
  
  // Archivos estáticos
  app.use(express.static(path.join(__dirname, 'public')));
  
  // Logging de requests (solo en desarrollo)
  if (process.env.NODE_ENV === 'development') {
    app.use((req, res, next) => {
      logger.debug(`${req.method} ${req.path}`);
      next();
    });
  }
  
  // ========== RUTAS PRINCIPALES ==========
  
  // Página principal - redirigir según autenticación
  app.get('/', async (req, res) => {
    try {
      const sessionCookie = req.cookies['ml-session'];
      
      if (!sessionCookie) {
        return res.redirect('/auth/login');
      }
      
      // Verificar si la sesión es válida
      const databaseService = require('./services/databaseService');
      const session = await databaseService.getUserSession(sessionCookie);
      
      if (!session) {
        // Sesión inválida, limpiar cookie y redirigir
        res.clearCookie('ml-session');
        return res.redirect('/auth/login');
      }
      
      // Sesión válida, mostrar dashboard
      const dashboardPath = path.join(__dirname, 'public/dashboard.html');
      res.sendFile(dashboardPath);
      
    } catch (error) {
      logger.error(`Error en página principal: ${error.message}`);
      res.redirect('/auth/login');
    }
  });
  
  // Página de acceso denegado
  app.get('/acceso-denegado', (req, res) => {
    res.status(403).send(`
      <html>
        <head><title>Acceso Denegado</title></head>
        <body style="font-family: Arial; text-align: center; padding: 50px;">
          <h1>🚫 Acceso Denegado</h1>
          <p>No tienes permisos para acceder a esta aplicación.</p>
          <p>Contacta al administrador si crees que esto es un error.</p>
          <a href="/auth/login">Intentar de nuevo</a>
        </body>
      </html>
    `);
  });
  
  // ========== RUTAS MODULARES ==========
  
  // Rutas de autenticación
  app.use('/auth', authRoutes);
  
  // Rutas de monitoreo (requieren auth)
  app.use('/api/monitor', monitorRoutes);
  
  // ========== RUTAS CRÍTICAS TEMPORALES ==========
  // TODO: Migrar a controladores dedicados
  
  const webhookProcessor = require('./services/webhookProcessor');
  const databaseService = require('./services/databaseService');
  const stockMonitor = require('./services/stockMonitor');
  
  // Webhook de ML (crítico)
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
  
  // API auth status (para compatibilidad)
  app.get('/api/auth/status', async (req, res) => {
    try {
      const sessionCookie = req.cookies['ml-session'];
      
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
  
  // API sync-next (usado por el monitoreo)
  app.get('/api/sync-next', async (req, res) => {
    try {
      const sessionCookie = req.cookies['ml-session'];
      
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
  
  // ========== HEALTH CHECK BÁSICO ==========
  
  app.get('/health', (req, res) => {
    res.json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      version: require('../package.json').version
    });
  });
  
  // ========== MANEJO DE ERRORES ==========
  
  // 404 - Ruta no encontrada
  app.use((req, res) => {
    logger.warn(`404 - Ruta no encontrada: ${req.method} ${req.path}`);
    res.status(404).json({
      error: 'Ruta no encontrada',
      path: req.path,
      method: req.method
    });
  });
  
  // Error handler global
  app.use((error, req, res, next) => {
    logger.error(`Error no manejado: ${error.message}`, error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Error interno'
    });
  });
  
  logger.info('✅ Aplicación Express configurada correctamente');
  
  return app;
}

module.exports = createApp;