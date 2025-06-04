// Cargar variables de entorno ANTES que cualquier otra cosa
const path = require('path');

// Cargar .env.local si existe, sino usar .env
const envPath = path.join(__dirname, '../.env.local');
const fs = require('fs');

if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
} else {
  require('dotenv').config();
}

const express = require('express');
const cookieParser = require('cookie-parser'); // NUEVO
const config = require('../config/config');
const logger = require('./utils/logger');
const auth = require('./api/auth');
const stockMonitor = require('./services/stockMonitor');
const sessionManager = require('./utils/sessionManager'); // NUEVO

// Inicialización de la aplicación Express
const app = express();
const port = process.env.PORT || config.app.port;

logger.info('🚀 Iniciando aplicación Monitor de Stock ML...');
logger.info(`📊 Puerto configurado: ${port}`);
logger.info(`🌍 Entorno: ${process.env.NODE_ENV || 'development'}`);
logger.info(`🎭 Mock API: ${process.env.MOCK_ML_API === 'true' ? 'ACTIVADO' : 'DESACTIVADO'}`);
logger.info(`🔐 Sistema de sesiones con cookies: ACTIVADO`); // NUEVO

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(cookieParser()); // NUEVO

// NUEVO: Middleware para manejar cookies de sesión
app.use((req, res, next) => {
  // Obtener cookie de sesión
  let sessionCookie = req.cookies['ml-session'];
  
  // Establecer el cookieId en auth para este request
  if (sessionCookie) {
    auth.setCurrentCookieId(sessionCookie);
  } else {
    auth.setCurrentCookieId(null);
  }
  
  // Hacer disponible para otros middlewares
  req.sessionCookie = sessionCookie;
  
  next();
});

// NUEVO: Middleware de seguridad para validar sesiones
app.use('/api/', async (req, res, next) => {
  // Solo aplicar a rutas que requieren autenticación
  const protectedRoutes = ['/api/monitor/', '/api/products/', '/api/rate-limit/'];
  const isProtectedRoute = protectedRoutes.some(route => req.path.startsWith(route));

  if (isProtectedRoute && auth.isAuthenticated()) {
    try {
      // Validar que la sesión actual pertenece al usuario correcto
      const isValidSession = await auth.validateCurrentSession();
      
      if (!isValidSession) {
        logger.error('🚨 SEGURIDAD: Sesión inválida detectada - forzando logout');
        auth.logout();
        
        // Limpiar cookie del navegador
        res.clearCookie('ml-session', {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/'
        });
        
        return res.status(401).json({ 
          error: 'Sesión inválida',
          message: 'Tu sesión no es válida. Por favor, inicia sesión nuevamente.',
          requiresReauth: true
        });
      }
    } catch (error) {
      logger.error(`Error en validación de sesión: ${error.message}`);
      auth.logout();
      
      // Limpiar cookie del navegador
      res.clearCookie('ml-session', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/'
      });
      
      return res.status(401).json({ 
        error: 'Error de validación',
        message: 'Error validando tu sesión. Por favor, inicia sesión nuevamente.',
        requiresReauth: true
      });
    }
  }

  next();
});

// Middleware para verificación automática en cada request (solo para usuarios autenticados)
app.use(async (req, res, next) => {
  // Solo hacer auto-check si el usuario está autenticado y no es una llamada de API
  if (auth.isAuthenticated() && !req.path.startsWith('/api/') && req.method === 'GET') {
    try {
      // Verificar si es necesario hacer una nueva verificación automática
      await stockMonitor.autoCheckIfNeeded();
    } catch (error) {
      logger.error(`Error en auto-verificación: ${error.message}`);
      // No interrumpir la request principal por este error
    }
  }
  next();
});

// Debug básico - AGREGAR DESPUÉS DE LOS MIDDLEWARE
app.get('/debug/simple', (req, res) => {
  res.json({
    message: 'Debug endpoint funcionando',
    timestamp: new Date().toISOString(),
    env: {
      NODE_ENV: process.env.NODE_ENV || 'undefined',
      VERCEL: process.env.VERCEL || 'undefined', 
      MOCK_ML_API: process.env.MOCK_ML_API || 'undefined'
    }
  });
});

// Debug de variables ML
app.get('/debug/ml-config', (req, res) => {
  try {
    const config = {
      mockMode: process.env.MOCK_ML_API === 'true',
      clientId: process.env.ML_CLIENT_ID ? '***' + process.env.ML_CLIENT_ID.slice(-4) : 'NO_CONFIGURADO',
      clientSecret: process.env.ML_CLIENT_SECRET ? '***' + process.env.ML_CLIENT_SECRET.slice(-4) : 'NO_CONFIGURADO',
      redirectUri: process.env.ML_REDIRECT_URI || 'NO_CONFIGURADO',
      country: process.env.ML_COUNTRY || 'AR',
      allEnvVars: Object.keys(process.env).filter(key => key.startsWith('ML_'))
    };
    
    res.json({
      message: 'Configuración actual de ML',
      config,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      error: 'Error al obtener configuración',
      message: error.message
    });
  }
});

app.get('/debug/oauth-flow', (req, res) => {
  try {
    const auth = require('./api/auth');
    
    res.json({
      message: 'Debug del flujo OAuth',
      env_variables: {
        ML_CLIENT_ID: process.env.ML_CLIENT_ID,
        ML_CLIENT_SECRET: process.env.ML_CLIENT_SECRET ? '***' + process.env.ML_CLIENT_SECRET.slice(-4) : 'MISSING',
        ML_REDIRECT_URI: process.env.ML_REDIRECT_URI,
        ML_COUNTRY: process.env.ML_COUNTRY,
        MOCK_ML_API: process.env.MOCK_ML_API
      },
      auth_state: {
        isAuthenticated: auth.isAuthenticated(),
        mockMode: auth.mockMode,
        baseUrls: auth.baseUrls || 'not available',
        clientId: auth.clientId,
        redirectUri: auth.redirectUri
      },
      oauth_url: {
        would_generate: auth.getAuthUrl(),
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({
      error: 'Error en debug OAuth',
      message: error.message,
      stack: error.stack
    });
  }
});

// NUEVO: Debug de cookies y sesiones
app.get('/debug/cookie-sessions', (req, res) => {
  if (process.env.NODE_ENV !== 'development') {
    return res.status(403).json({ error: 'Solo disponible en desarrollo' });
  }

  try {
    const stats = sessionManager.getStats();
    
    res.json({
      message: 'Estado de sesiones con cookies',
      cookieFromBrowser: req.cookies['ml-session'] ? 
        req.cookies['ml-session'].substring(0, 8) + '...' : 'NO_COOKIE',
      currentCookieId: auth.currentCookieId ? 
        auth.currentCookieId.substring(0, 8) + '...' : null,
      sessionStats: stats,
      isAuthenticated: auth.isAuthenticated(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// NUEVO: Debug de sesiones (solo desarrollo)
app.get('/debug/sessions', (req, res) => {
  if (process.env.NODE_ENV !== 'development') {
    return res.status(403).json({ error: 'Solo disponible en desarrollo' });
  }

  try {
    const stats = sessionManager.getStats();
    const currentSessionInfo = auth.getCurrentSessionInfo();
    
    res.json({
      message: 'Estado de sesiones activas',
      stats,
      currentSession: currentSessionInfo,
      currentSessionId: auth.currentSessionId ? 
        auth.currentSessionId.substring(0, 8) + '...' : null,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Debug del estado de autenticación
app.get('/debug/auth-state', (req, res) => {
  try {
    res.json({
      message: 'Estado completo de autenticación',
      timestamp: new Date().toISOString(),
      auth_state: {
        isAuthenticated: auth.isAuthenticated(),
        mockMode: auth.mockMode,
        hasTokens: !!auth.tokens,
        currentCookieId: auth.currentCookieId ? 
          auth.currentCookieId.substring(0, 8) + '...' : null,
        sessionInfo: auth.getCurrentSessionInfo(),
        tokens: auth.tokens ? {
          has_access_token: !!auth.tokens.access_token,
          has_refresh_token: !!auth.tokens.refresh_token,
          access_token_preview: auth.tokens.access_token ? 
            auth.tokens.access_token.substring(0, 20) + '...' : 'NONE',
          expires_at: auth.tokens.expires_at,
          expires_in_minutes: auth.tokens.expires_at ? 
            Math.floor((auth.tokens.expires_at - Date.now()) / 60000) : 'N/A'
        } : null,
        client_config: {
          clientId: auth.clientId ? '***' + auth.clientId.slice(-4) : 'NO_CONFIGURADO',
          redirectUri: auth.redirectUri,
          baseUrls: auth.baseUrls
        }
      },
      environment: {
        NODE_ENV: process.env.NODE_ENV,
        VERCEL: !!process.env.VERCEL,
        MOCK_ML_API: process.env.MOCK_ML_API,
        ML_CLIENT_ID: process.env.ML_CLIENT_ID ? '***' + process.env.ML_CLIENT_ID.slice(-4) : 'MISSING',
        ML_CLIENT_SECRET: process.env.ML_CLIENT_SECRET ? 'CONFIGURED' : 'MISSING',
        ML_REDIRECT_URI: process.env.ML_REDIRECT_URI || 'MISSING'
      }
    });
  } catch (error) {
    res.status(500).json({
      error: 'Error obteniendo estado de auth',
      message: error.message,
      stack: error.stack
    });
  }
});

// Debug del proceso de obtención de productos
app.get('/debug/products-flow', async (req, res) => {
  if (!auth.isAuthenticated()) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  try {
    const products = require('./api/products');
    
    // Simular el flujo completo
    logger.info('🐛 DEBUG: Iniciando flujo de productos...');
    
    // 1. Verificar estado de auth
    const authState = {
      isAuthenticated: auth.isAuthenticated(),
      hasTokens: !!auth.tokens,
      mockMode: products.mockMode,
      currentUserId: await auth.getCurrentUserId()
    };
    
    // 2. Intentar obtener productos
    let productResult = null;
    let productError = null;
    
    try {
      if (products.mockMode) {
        productResult = await products.mockAPI.getUserProducts('mock_user');
        productResult = productResult.results || [];
      } else {
        productResult = await products.getAllProducts();
      }
    } catch (error) {
      productError = {
        message: error.message,
        stack: error.stack
      };
    }
    
    res.json({
      message: 'Debug del flujo de productos',
      timestamp: new Date().toISOString(),
      authState,
      productResult: {
        success: !productError,
        count: productResult ? productResult.length : 0,
        error: productError,
        sample: productResult ? productResult.slice(0, 3) : null
      }
    });
    
  } catch (error) {
    res.status(500).json({
      error: 'Error en debug de productos',
      message: error.message
    });
  }
});

// Debug del estado del monitor
app.get('/debug/monitor-state', (req, res) => {
  try {
    const stockMonitor = require('./services/stockMonitor');
    
    const status = stockMonitor.getStatus();
    const trackedProducts = Array.from(stockMonitor.trackedProducts.entries()).map(([id, product]) => ({
      id,
      title: product.title,
      stock: product.available_quantity,
      hasLowStock: product.hasLowStock(5)
    }));
    
    res.json({
      message: 'Estado completo del monitor',
      timestamp: new Date().toISOString(),
      monitorStatus: status,
      trackedProducts,
      trackedProductsCount: stockMonitor.trackedProducts.size,
      lowStockProductsCount: status.lowStockProducts.length
    });
    
  } catch (error) {
    res.status(500).json({
      error: 'Error obteniendo estado del monitor',
      message: error.message
    });
  }
});

// Test de conexión con ML API
app.get('/debug/test-ml-connection', async (req, res) => {
  if (!auth.isAuthenticated()) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  try {
    const products = require('./api/products');
    
    if (products.mockMode) {
      res.json({
        message: 'Conexión en modo MOCK',
        mockMode: true,
        status: 'OK',
        timestamp: new Date().toISOString()
      });
      return;
    }
    
    // Intentar hacer una llamada simple a ML API
    const mlApiClient = require('./api/ml-api-client');
    
    // Configurar token
    if (auth.tokens && auth.tokens.access_token) {
      mlApiClient.setAccessToken(auth.tokens.access_token);
    }
    
    // Test de llamada simple
    const user = await mlApiClient.getUser();
    
    res.json({
      message: 'Conexión exitosa con ML API',
      mockMode: false,
      status: 'OK',
      user: {
        id: user.id,
        nickname: user.nickname,
        email: user.email
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    res.status(500).json({
      error: 'Error conectando con ML API',
      message: error.message,
      details: error.response ? {
        status: error.response.status,
        data: error.response.data
      } : null
    });
  }
});

// Ruta principal
app.get('/', async (req, res) => {
  try {
    if (auth.isAuthenticated()) {
      // Si está autenticado, asegurar que el monitoreo esté activo
      if (!stockMonitor.monitoringActive) {
        try {
          await stockMonitor.start();
        } catch (error) {
          logger.error(`Error al iniciar monitoreo automático: ${error.message}`);
        }
      }
      res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
    } else {
      res.sendFile(path.join(__dirname, 'public', 'login.html'));
    }
  } catch (error) {
    logger.error(`Error en ruta principal: ${error.message}`);
    res.status(500).send('Error interno del servidor');
  }
});

// Ruta para iniciar el proceso de autenticación
app.get('/auth/login', (req, res) => {
  try {
    const authUrl = auth.getAuthUrl();

    // Si estamos en modo mock y la URL es relativa, redirigir directamente
    if (authUrl.startsWith('/')) {
      res.redirect(authUrl);
    } else {
      res.redirect(authUrl);
    }
  } catch (error) {
    logger.error(`Error al obtener URL de autenticación: ${error.message}`);
    res.status(500).send('Error al iniciar proceso de autenticación: ' + error.message);
  }
});

// MODIFICADO: Callback de autenticación para establecer cookie
app.get('/auth/callback', async (req, res) => {
  const { code, error, error_description } = req.query;

  // Verificar si hay error en la respuesta de ML
  if (error) {
    logger.error(`❌ Error de ML en callback: ${error} - ${error_description}`);
    return res.status(400).send(`Error de autenticación: ${error_description || error}`);
  }

  if (!code) {
    logger.error('❌ No se recibió código de autorización en callback');
    return res.status(400).send('Error: No se recibió el código de autorización');
  }

  try {
    logger.info(`🔄 Procesando callback con código: ${code.substring(0, 10)}...`);
    
    // Verificar si estamos en modo mock
    if (process.env.MOCK_ML_API === 'true') {
      logger.info('🎭 Procesando callback en modo MOCK');
    } else {
      logger.info('🔐 Procesando callback en modo REAL');
      logger.info(`🌍 Client ID: ${process.env.ML_CLIENT_ID ? '***' + process.env.ML_CLIENT_ID.slice(-4) : 'NO_CONFIGURADO'}`);
      logger.info(`🔗 Redirect URI: ${process.env.ML_REDIRECT_URI}`);
    }

    // Obtener o generar cookieId para este navegador
    let cookieId = req.cookies['ml-session'];
    if (!cookieId) {
      // Generar nuevo cookieId para este navegador
      cookieId = sessionManager.generateCookieId();
    }

    // Intercambiar código por tokens Y crear sesión con cookie
    const result = await auth.getTokensFromCode(code, cookieId);
    
    if (!result.tokens || !result.tokens.access_token) {
      throw new Error('No se obtuvieron tokens válidos del intercambio');
    }

    // CRÍTICO: Establecer cookie segura en el navegador
    res.cookie('ml-session', result.cookieId, {
      httpOnly: true,           // No accesible desde JavaScript
      secure: process.env.NODE_ENV === 'production', // Solo HTTPS en producción
      sameSite: 'lax',         // Protección CSRF
      maxAge: 6 * 60 * 60 * 1000, // 6 horas
      path: '/'                // Disponible en toda la app
    });

    logger.info('✅ Tokens obtenidos y cookie de sesión establecida');
    logger.info(`🍪 Cookie establecida: ${result.cookieId.substring(0, 8)}...`);
    
    // Mostrar información de la sesión creada
    const sessionInfo = auth.getCurrentSessionInfo();
    if (sessionInfo) {
      logger.info(`🔐 Sesión creada: ${sessionInfo.sessionId} para usuario ${sessionInfo.userId}`);
    }

    // Iniciar el monitoreo automáticamente después de la autenticación
    try {
      logger.info('🔄 Iniciando monitoreo después de autenticación...');
      await stockMonitor.start();
      logger.info('✅ Monitoreo iniciado después de autenticación exitosa');
    } catch (monitorError) {
      logger.error(`❌ Error al iniciar monitoreo: ${monitorError.message}`);
      // No bloquear el flujo de autenticación por errores de monitoreo
    }

    // Redirigir al dashboard
    res.redirect('/');
    
  } catch (error) {
    logger.error(`❌ Error en el callback de autenticación: ${error.message}`);
    
    // Log adicional para debugging
    if (error.response) {
      logger.error(`📄 Respuesta del servidor ML:`, {
        status: error.response.status,
        data: error.response.data,
        headers: error.response.headers
      });
    }
    
    // Respuesta más detallada para debugging
    const errorMessage = `Error durante la autenticación: ${error.message}`;
    const debugInfo = process.env.NODE_ENV === 'development' ? 
      `\n\nDetalles técnicos:\n- Código recibido: ${code}\n- Error: ${error.stack}` : '';
    
    res.status(500).send(errorMessage + debugInfo);
  }
});

// MODIFICADO: Logout para limpiar cookie
app.get('/auth/logout', (req, res) => {
  try {
    const currentUserId = auth.currentSessionId;
    if (currentUserId) {
      logger.info(`🚪 Cerrando sesión para usuario: ${currentUserId}`);
    }

    auth.logout(); // Esto ahora invalida la sesión automáticamente
    stockMonitor.stop();

    // CRÍTICO: Limpiar cookie del navegador
    res.clearCookie('ml-session', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/'
    });

    logger.info('🚪 Sesión cerrada y cookie eliminada');
    res.redirect('/');
  } catch (error) {
    logger.error(`Error al cerrar sesión: ${error.message}`);
    res.status(500).send('Error al cerrar sesión: ' + error.message);
  }
});

// MODIFICADO: API para verificar el estado de autenticación y monitoreo con validación de cookies
app.get('/api/auth/status', async (req, res) => {
  try {
    const isAuthenticated = auth.isAuthenticated();
    let userInfo = null;
    let sessionValid = true;
    
    if (isAuthenticated) {
      try {
        userInfo = {
          id: await auth.getCurrentUserId(),
          sessionInfo: auth.getCurrentSessionInfo()
        };
        
        // Validar que la sesión sea legítima
        sessionValid = await auth.validateCurrentSession();
        
        if (!sessionValid) {
          logger.warn('⚠️ Sesión inválida detectada en /api/auth/status');
          auth.logout();
          
          // Limpiar cookie
          res.clearCookie('ml-session', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/'
          });
          
          return res.json({
            authenticated: false,
            monitoring: { active: false },
            mockMode: process.env.MOCK_ML_API === 'true',
            message: 'Sesión inválida - usuario deslogueado por seguridad'
          });
        }
        
      } catch (error) {
        logger.error(`Error obteniendo info de usuario: ${error.message}`);
        auth.logout();
        
        // Limpiar cookie
        res.clearCookie('ml-session', {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/'
        });
        
        return res.json({
          authenticated: false,
          monitoring: { active: false },
          mockMode: process.env.MOCK_ML_API === 'true',
          message: 'Error de sesión - usuario deslogueado'
        });
      }
    }

    const monitorStatus = stockMonitor.getStatus();

    // Debug en desarrollo
    if (process.env.NODE_ENV === 'development') {
      stockMonitor.debugCurrentState();
    }

    res.json({ 
      authenticated: isAuthenticated && sessionValid,
      user: userInfo,
      monitoring: {
        ...monitorStatus,
        responseTime: Date.now()
      },
      mockMode: process.env.MOCK_ML_API === 'true',
      lastSyncTime: new Date().toISOString()
    });
  } catch (error) {
    logger.error(`Error en /api/auth/status: ${error.message}`);
    res.status(500).json({ 
      error: 'Error al obtener estado',
      authenticated: false,
      monitoring: { active: false, error: error.message }
    });
  }
});

// API para iniciar el monitoreo manualmente
app.post('/api/monitor/start', async (req, res) => {
  if (!auth.isAuthenticated()) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  try {
    await stockMonitor.start();
    res.json({ 
      success: true, 
      message: 'Monitoreo iniciado',
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error(`Error al iniciar monitoreo: ${error.message}`);
    res.status(500).json({ error: 'Error al iniciar monitoreo' });
  }
});

// API para detener el monitoreo
app.post('/api/monitor/stop', (req, res) => {
  if (!auth.isAuthenticated()) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  try {
    stockMonitor.stop();
    res.json({ 
      success: true, 
      message: 'Monitoreo detenido',
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error(`Error al detener monitoreo: ${error.message}`);
    res.status(500).json({ error: 'Error al detener monitoreo' });
  }
});

// API para forzar verificación de stock
app.post('/api/monitor/check-now', async (req, res) => {
  if (!auth.isAuthenticated()) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  try {
    logger.info('🔍 Verificación manual iniciada desde API');
    const result = await stockMonitor.checkStock();

    res.json({ 
      success: true, 
      message: 'Verificación completada',
      result: {
        ...result,
        checkTime: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error(`Error al verificar stock: ${error.message}`);
    res.status(500).json({ error: 'Error al verificar stock: ' + error.message });
  }
});

// API para verificar stock de un producto específico
app.get('/api/products/:id/stock', async (req, res) => {
  if (!auth.isAuthenticated()) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  try {
    const productId = req.params.id;
    logger.info(`🔍 API: Verificación individual de producto ${productId}`);

    // Usar el método del monitor para mantener consistencia
    const product = await stockMonitor.checkProductStock(productId);

    const responseData = {
      id: product.id,
      title: product.title,
      available_quantity: product.available_quantity, // Stock actual en tiempo real
      has_low_stock: product.hasLowStock(config.monitoring.stockThreshold),
      is_out_of_stock: product.isOutOfStock(),
      threshold: config.monitoring.stockThreshold,
      last_updated: Date.now(),
      last_updated_iso: new Date().toISOString()
    };

    logger.info(`📊 API: Respuesta para ${productId}: ${product.available_quantity} unidades`);

    res.json(responseData);
  } catch (error) {
    logger.error(`Error al verificar stock de producto ${req.params.id}: ${error.message}`);
    res.status(500).json({ 
      error: 'Error al verificar stock',
      productId: req.params.id,
      message: error.message
    });
  }
});

// NUEVO: API para debug (solo en desarrollo)
app.get('/api/debug/stock-state', (req, res) => {
  if (!auth.isAuthenticated()) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  if (process.env.NODE_ENV !== 'development') {
    return res.status(403).json({ error: 'Solo disponible en desarrollo' });
  }

  try {
    const monitorStatus = stockMonitor.getStatus();
    const trackedProducts = Array.from(stockMonitor.trackedProducts.values()).map(p => ({
      id: p.id,
      title: p.title,
      stock: p.available_quantity,
      hasLowStock: p.hasLowStock(config.monitoring.stockThreshold)
    }));

    // Si estamos en modo mock, incluir estado del Mock API
    let mockState = null;
    if (process.env.MOCK_ML_API === 'true') {
      try {
        const mockAPI = require('./api/mock-ml-api');
        mockState = {
          ...mockAPI.getCurrentStockStatus(),
          stats: mockAPI.getStockChangeStats()
        };
      } catch (mockError) {
        logger.error(`Error obteniendo estado mock: ${mockError.message}`);
        mockState = { error: mockError.message };
      }
    }

    res.json({
      monitorStatus,
      trackedProducts,
      mockState,
      timestamp: Date.now()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// NUEVO: API para controlar cambios automáticos de stock (solo desarrollo)
app.post('/api/debug/trigger-stock-changes', (req, res) => {
  if (!auth.isAuthenticated()) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  if (process.env.NODE_ENV !== 'development') {
    return res.status(403).json({ error: 'Solo disponible en desarrollo' });
  }

  try {
    if (process.env.MOCK_ML_API === 'true') {
      const mockAPI = require('./api/mock-ml-api');
      const changesCount = mockAPI.triggerStockChanges();

      res.json({
        success: true,
        message: `${changesCount} productos cambiaron stock`,
        changesCount,
        timestamp: Date.now()
      });
    } else {
      res.json({
        success: false,
        message: 'Solo disponible en modo mock'
      });
    }
  } catch (error) {
    logger.error(`Error forzando cambios de stock: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// NUEVO: API para configurar frecuencia de cambios (solo desarrollo)
app.post('/api/debug/set-change-frequency', (req, res) => {
  if (!auth.isAuthenticated()) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  if (process.env.NODE_ENV !== 'development') {
    return res.status(403).json({ error: 'Solo disponible en desarrollo' });
  }

  try {
    const { seconds } = req.body;

    if (!seconds || seconds < 5 || seconds > 300) {
      return res.status(400).json({ 
        error: 'La frecuencia debe estar entre 5 y 300 segundos' 
      });
    }

    if (process.env.MOCK_ML_API === 'true') {
      const mockAPI = require('./api/mock-ml-api');
      mockAPI.setStockChangeFrequency(seconds);

      res.json({
        success: true,
        message: `Frecuencia actualizada a ${seconds} segundos`,
        frequency: seconds,
        timestamp: Date.now()
      });
    } else {
      res.json({
        success: false,
        message: 'Solo disponible en modo mock'
      });
    }
  } catch (error) {
    logger.error(`Error configurando frecuencia: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Mostrar información de la aplicación
app.get('/api/app-info', (req, res) => {
  res.json({
    name: 'Mercado Libre Stock Monitor',
    version: '1.0.1',
    environment: process.env.NODE_ENV || 'production',
    vercel: !!process.env.VERCEL,
    mockMode: process.env.MOCK_ML_API === 'true',
    plan: 'free',
    features: {
      autoMonitoring: 'on-access',
      cronJobs: false,
      manualCheck: true,
      realTimeSync: true,
      dynamicStock: true,
      secureSessions: true // NUEVO
    }
  });
});

// Ruta de verificación de estado para Vercel - MODIFICADO con info de sesiones
app.get('/health', (req, res) => {
  try {
    const status = stockMonitor.getStatus();
    const sessionStats = sessionManager.getStats();

    res.status(200).json({
      status: 'OK',
      message: 'El servicio está funcionando correctamente',
      timestamp: new Date().toISOString(),
      authenticated: auth.isAuthenticated(),
      monitoring: {
        active: status.active,
        totalProducts: status.totalProducts,
        lowStockProducts: status.lowStockProducts.length
      },
      sessions: sessionStats, // NUEVO
      mockMode: process.env.MOCK_ML_API === 'true'
    });
  } catch (error) {
    logger.error(`Error en health check: ${error.message}`);
    res.status(500).json({
      status: 'ERROR',
      message: 'Error interno del servidor',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// ========== ENDPOINTS DE RATE LIMITING ==========
// API para obtener estadísticas de rate limiting
app.get('/api/rate-limit/stats', (req, res) => {
  if (!auth.isAuthenticated()) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  try {
    const productsService = require('./api/products');
    const stats = productsService.getRateLimitStats();

    res.json({
      success: true,
      rateLimitStats: stats,
      timestamp: new Date().toISOString(),
      recommendations: generateRateLimitRecommendations(stats)
    });
  } catch (error) {
    logger.error(`Error obteniendo stats de rate limit: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// API para optimizar rate limiting
app.post('/api/rate-limit/optimize', async (req, res) => {
  if (!auth.isAuthenticated()) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  try {
    const productsService = require('./api/products');
    const optimization = await productsService.optimizeRateLimit();

    res.json({
      success: true,
      optimization,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error(`Error optimizando rate limit: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// API para hacer pausa inteligente
app.post('/api/rate-limit/smart-pause', async (req, res) => {
  if (!auth.isAuthenticated()) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  try {
    const productsService = require('./api/products');
    await productsService.smartPause();

    res.json({
      success: true,
      message: 'Pausa inteligente aplicada',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error(`Error en pausa inteligente: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Health check con información de rate limiting
app.get('/api/health/detailed', async (req, res) => {
  try {
    const productsService = require('./api/products');
    const healthCheck = await productsService.healthCheck();
    const rateLimitStats = productsService.getRateLimitStats();

    res.json({
      status: healthCheck.status,
      services: {
        api: healthCheck,
        rateLimit: {
          status: rateLimitStats.utilizationPercent > 90 ? 'WARNING' : 'OK',
          stats: rateLimitStats
        }
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// ========== FUNCIONES AUXILIARES ==========

function generateRateLimitRecommendations(stats) {
  const recommendations = [];

  if (stats.utilizationPercent > 80) {
    recommendations.push({
      type: 'warning',
      message: 'Alto uso del rate limit',
      action: 'Considera reducir la frecuencia de verificaciones'
    });
  }

  if (stats.queueLength > 5) {
    recommendations.push({
      type: 'info',
      message: 'Cola de requests larga',
      action: 'Las verificaciones pueden tardar más de lo normal'
    });
  }

  if (stats.rejectedRequests > 0) {
    recommendations.push({
      type: 'error',
      message: 'Requests rechazadas por rate limit',
      action: 'El sistema está ajustando automáticamente los límites'
    });
  }

  if (stats.averageWaitTime > 5000) {
    recommendations.push({
      type: 'warning',
      message: 'Tiempo de espera elevado',
      action: 'Considera usar verificaciones en lote'
    });
  }

  return recommendations;
}

// ========== MIDDLEWARE DE RATE LIMITING ==========
// Middleware para agregar headers informativos
app.use('/api/', (req, res, next) => {
  // Solo aplicar a rutas que hacen llamadas a ML API
  const mlApiRoutes = ['/api/monitor/', '/api/products/'];
  const isMLApiRoute = mlApiRoutes.some(route => req.path.startsWith(route));

  if (isMLApiRoute && auth.isAuthenticated()) {
    const productsService = require('./api/products');
    const stats = productsService.getRateLimitStats();

    // Agregar headers informativos
    res.set({
      'X-RateLimit-Limit': stats.maxRequests,
      'X-RateLimit-Remaining': Math.max(0, stats.maxRequests - stats.currentRequests),
      'X-RateLimit-Reset': Date.now() + 60000,
      'X-RateLimit-Window': '60'
    });

    // Si está muy saturado, responder con 429
    if (stats.utilizationPercent > 95) {
      return res.status(429).json({
        error: 'Rate limit interno alcanzado',
        message: 'Demasiadas requests en un corto período',
        retryAfter: 60,
        stats: {
          current: stats.currentRequests,
          max: stats.maxRequests,
          utilization: stats.utilizationPercent
        }
      });
    }
  }

  next();
});

// Solo iniciar el servidor si no estamos en Vercel
if (!process.env.VERCEL) {
  try {
    const server = app.listen(port, () => {
      const baseUrl = `http://localhost:${port}`;
      logger.info(`🚀 Servidor iniciado en ${baseUrl}`);
      logger.info(`🔗 URL para redirección OAuth: ${baseUrl}/auth/callback`);
      logger.info(`🎭 Modo Mock API: ${process.env.MOCK_ML_API === 'true' ? 'ACTIVADO' : 'DESACTIVADO'}`);
      logger.info(`🔐 Sistema de sesiones seguras con cookies: ACTIVADO`);

      if (process.env.MOCK_ML_API === 'true') {
        logger.info(`✨ Modo Demo: Puedes iniciar sesión directamente sin credenciales reales`);
        logger.info(`🔄 Stock cambia automáticamente cada 30 segundos`);
      }

      // En desarrollo local, iniciar monitoreo si ya estamos autenticados
      if (auth.isAuthenticated()) {
        stockMonitor.start()
          .then(() => {
            logger.info('✅ Monitoreo iniciado automáticamente');
          })
          .catch(error => {
            logger.error(`❌ Error al iniciar monitoreo automático: ${error.message}`);
          });
      } else {
        logger.info('⏳ Esperando autenticación para iniciar monitoreo');
      }
    });

    // Manejar errores del servidor
    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        logger.error(`❌ Puerto ${port} ya está en uso. Intenta con otro puerto.`);
        process.exit(1);
      } else {
        logger.error(`❌ Error del servidor: ${error.message}`);
        process.exit(1);
      }
    });

    // Manejo de cierre limpio
    process.on('SIGTERM', () => {
      logger.info('⏹️  Cerrando servidor...');
      stockMonitor.stop();
      server.close(() => {
        logger.info('✅ Servidor cerrado correctamente');
        process.exit(0);
      });
    });

    process.on('SIGINT', () => {
      logger.info('⏹️  Cerrando servidor...');
      stockMonitor.stop();
      server.close(() => {
        logger.info('✅ Servidor cerrado correctamente');
        process.exit(0);
      });
    });

  } catch (error) {
    logger.error(`❌ Error fatal al iniciar servidor: ${error.message}`);
    process.exit(1);
  }
} else {
  // En Vercel, solo logear que está ejecutando
  logger.info('🔧 Ejecutando en modo Vercel serverless');
  logger.info(`🎭 Modo Mock API: ${process.env.MOCK_ML_API === 'true' ? 'ACTIVADO' : 'DESACTIVADO'}`);
  logger.info(`🔐 Sistema de sesiones seguras con cookies: ACTIVADO`);
}

// Exportar la aplicación para Vercel
module.exports = app;

// Manejo de errores no capturados
process.on('uncaughtException', (error) => {
  logger.error(`❌ Error no capturado: ${error.message}`, { stack: error.stack });

  if (!process.env.VERCEL) {
    process.exit(1);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('❌ Rechazo de promesa no manejado', { reason });

  if (!process.env.VERCEL) {
    process.exit(1);
  }
});