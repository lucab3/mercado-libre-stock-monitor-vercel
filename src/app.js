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
  
  // Health check endpoint (movido desde /api/healthcheck.js)
  app.get('/health', (req, res) => {
    res.status(200).json({
      status: 'ok',
      message: 'El servicio está funcionando correctamente',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'production',
      vercel: true
    });
  });
  
  // Página principal - redirigir según autenticación
  app.get('/', async (req, res) => {
    try {
      const sessionCookie = req.cookies['ml-session'];
      
      if (!sessionCookie) {
        // No hay sesión, redirigir al React login
        return res.redirect('/login');
      }
      
      // Verificar si la sesión es válida
      const databaseService = require('./services/databaseService');
      const session = await databaseService.getUserSession(sessionCookie);
      
      if (!session) {
        // Sesión inválida, limpiar cookie y redirigir al React login
        res.clearCookie('ml-session');
        return res.redirect('/login');
      }
      
      // Sesión válida, mostrar React dashboard
      return res.redirect('/dashboard');
      
    } catch (error) {
      logger.error(`Error en página principal: ${error.message}`);
      res.redirect('/login');
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
      const clientIP = req.ip || req.connection.remoteAddress;
      const result = await webhookProcessor.handleWebhook(req.body, clientIP, req.headers);
      
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
  
  // API sync-next (sincronización inicial con prevención de duplicados)
  const handleSyncNext = require('./api/sync-next');
  app.get('/api/sync-next', handleSyncNext);
  
  // API categories/info (obtener nombres de categorías desde archivo JSON estático)
  const categoriesInfoHandler = require('../api/categories/info');
  app.post('/api/categories/info', categoriesInfoHandler);

  // API products (obtener productos desde BD con filtros de bajo stock)  
  app.get('/api/products', async (req, res) => {
    try {
      console.log('🔍 /api/products endpoint called - CONSOLE LOG');
      logger.info('🔍 /api/products endpoint called');
      const sessionCookie = req.cookies['ml-session'];
      logger.info(`🔍 sessionCookie: ${sessionCookie ? sessionCookie.substring(0, 10) + '...' : 'NONE'}`);
      
      if (!sessionCookie) {
        return res.status(401).json({
          success: false,
          error: 'No hay sesión activa',
          needsAuth: true
        });
      }
      
      const session = await databaseService.getUserSession(sessionCookie);
      if (!session) {
        return res.status(401).json({
          success: false,
          error: 'Sesión inválida',
          needsAuth: true
        });
      }
      
      // CRITICAL: Usar userId de la sesión en lugar de sessionCookie  
      const userId = session.userId;
      logger.info(`📦 Obteniendo productos para usuario: ${userId} (sesión: ${sessionCookie.substring(0, 10)}...)`);
      
      // Obtener productos desde BD usando método que retorna todos los campos
      const products = await databaseService.getProducts(userId);
      logger.info(`📦 Productos encontrados: ${products.length}`);
      logger.info(`📦 Primeros 3 productos:`, products.slice(0, 3).map(p => ({ id: p.id, title: p.title, status: p.status })));
      
      // Formatear productos para el frontend con todos los campos necesarios
      const productDetails = products.map(product => ({
        id: product.id,
        title: product.title,
        seller_sku: product.seller_sku,
        available_quantity: product.available_quantity,
        price: product.price,
        status: product.status,
        permalink: product.permalink,
        category_id: product.category_id,
        condition: product.condition,
        listing_type_id: product.listing_type_id,
        health: product.health,
        updated_at: product.updated_at || product.last_webhook_update || product.last_api_sync || product.created_at
      }));
      
      const response = {
        products: productDetails,
        total: products.length,
        showing: productDetails.length
      };
      
      logger.info(`📦 Enviando respuesta: ${response.total} productos, primeros 2:`, response.products.slice(0, 2).map(p => ({ id: p.id, title: p.title })));
      res.json(response);
      
    } catch (error) {
      logger.error(`❌ Error obteniendo productos: ${error.message}`);
      res.status(500).json({ 
        error: 'Error obteniendo productos' 
      });
    }
  });

  // API products/stats (estadísticas de productos)
  app.get('/api/products/stats', async (req, res) => {
    try {
      const sessionCookie = req.cookies['ml-session'];
      
      if (!sessionCookie) {
        return res.status(401).json({
          success: false,
          error: 'No hay sesión activa',
          needsAuth: true
        });
      }
      
      const session = await databaseService.getUserSession(sessionCookie);
      if (!session) {
        return res.status(401).json({
          success: false,
          error: 'Sesión inválida',
          needsAuth: true
        });
      }
      
      // CRITICAL: Usar userId de la sesión en lugar de sessionCookie
      const userId = session.userId;
      logger.info(`📊 Obteniendo estadísticas para usuario: ${userId} (sesión: ${sessionCookie.substring(0, 10)}...)`);
      
      // Obtener productos y calcular estadísticas
      const products = await databaseService.getProducts(userId);
      const lowStockProducts = await databaseService.getLowStockProducts(userId, 5);
      
      const stats = {
        totalProducts: products.length,
        lowStockProducts: lowStockProducts.length,
        activeProducts: products.filter(p => p.status === 'active').length,
        pausedProducts: products.filter(p => p.status === 'paused').length,
        lastSync: products.length > 0 ? 
          Math.max(...products.map(p => new Date(p.updated_at || p.last_webhook_update || p.last_api_sync || p.created_at || 0).getTime())) : 
          null
      };
      
      res.json({
        success: true,
        ...stats,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error(`❌ Error obteniendo estadísticas: ${error.message}`);
      res.status(500).json({
        success: false,
        error: 'Error obteniendo estadísticas',
        message: error.message
      });
    }
  });

  // API logout (para compatibilidad con React)
  app.post('/api/auth/logout', async (req, res) => {
    try {
      const sessionCookie = req.cookies['ml-session'];
      
      if (sessionCookie) {
        // Revocar en BD
        await databaseService.revokeUserSession(sessionCookie);
        logger.info(`🔓 Sesión cerrada: ${sessionCookie.substring(0, 8)}...`);
      }
      
      // Limpiar cookie
      res.clearCookie('ml-session', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/'
      });
      
      res.json({
        success: true,
        message: 'Sesión cerrada correctamente'
      });
      
    } catch (error) {
      logger.error(`Error en logout: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
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