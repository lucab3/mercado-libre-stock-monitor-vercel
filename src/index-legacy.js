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
const cookieParser = require('cookie-parser');
const config = require('../config/config');
const logger = require('./utils/logger');
const auth = require('./api/auth');
const stockMonitor = require('./services/stockMonitor');
const sessionManager = require('./utils/sessionManager');
const webhookProcessor = require('./services/webhookProcessor');
const databaseService = require('./services/databaseService');

// Inicialización de la aplicación Express
const app = express();
const port = process.env.PORT || config.app.port;

logger.info('🚀 Iniciando aplicación Monitor de Stock ML...');
logger.info(`📊 Puerto configurado: ${port}`);
logger.info(`🌍 Entorno: ${process.env.NODE_ENV || 'development'}`);
logger.info(`🎭 Mock API: ${process.env.MOCK_ML_API === 'true' ? 'ACTIVADO' : 'DESACTIVADO'}`);
logger.info(`🔐 Sistema de sesiones con cookies: ACTIVADO`);

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(cookieParser());

// Middleware para manejar cookies de sesión
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

// Middleware de seguridad para validar sesiones
app.use('/api/', async (req, res, next) => {
  // Solo aplicar a rutas que requieren autenticación
  const protectedRoutes = ['/api/monitor', '/api/products', '/api/rate-limit', '/api/stock-alerts'];
  const isProtectedRoute = protectedRoutes.some(route => req.path.startsWith(route));

  if (isProtectedRoute) {
    logger.info(`🔍 SERVERLESS AUTH CHECK: ${req.path}`);
    
    try {
      // Obtener session ID de la cookie
      const sessionCookie = req.sessionCookie;
      logger.info(`🍪 COOKIE: ${sessionCookie ? 'Presente' : 'Ausente'}`);
      
      if (!sessionCookie) {
        logger.error('🚨 SERVERLESS: No se encontró cookie de sesión');
        return res.status(401).json({ 
          error: 'No autenticado',
          message: 'No se encontró sesión. Por favor, inicia sesión.',
          requiresReauth: true
        });
      }
      
      // Validar sesión directamente desde la base de datos
      logger.info(`🔍 VALIDANDO SESIÓN: ${sessionCookie.substring(0, 8)}...`);
      const session = await databaseService.getUserSession(sessionCookie);
      
      if (!session || !session.data) {
        logger.error('🚨 SERVERLESS: Sesión no encontrada en BD');
        
        // Limpiar cookie del navegador
        res.clearCookie('ml-session', {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/'
        });
        
        return res.status(401).json({ 
          error: 'Sesión inválida',
          message: 'Tu sesión ha expirado. Por favor, inicia sesión nuevamente.',
          requiresReauth: true
        });
      }
      
      // Establecer datos de sesión para esta request
      auth.setCurrentCookieId(sessionCookie);
      auth.currentSessionId = session.userId;
      
      logger.info(`✅ SERVERLESS: Sesión válida para usuario ${session.userId}`);
      logger.info(`✅ AUTH STATE: currentSessionId=${auth.currentSessionId}`);
      
    } catch (error) {
      logger.error(`❌ ERROR en validación de sesión serverless: ${error.message}`);
      logger.error(`❌ STACK: ${error.stack}`);
      
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

// Debug básico
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

// Debug de cookies y sesiones
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

// Debug de sesiones (solo desarrollo)
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

// NUEVO: API para debug detallado de productos
app.get('/debug/products-data', async (req, res) => {
  if (!auth.isAuthenticated()) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  try {
    const products = require('./api/products');
    const debugResult = await products.debugProductsData();
    
    res.json(debugResult);
  } catch (error) {
    logger.error(`Error en debug de productos: ${error.message}`);
    res.status(500).json({ 
      error: 'Error al debuggear productos',
      message: error.message 
    });
  }
});

// NUEVO: API para listar TODOS los productos (no solo muestra)
app.get('/debug/all-products', async (req, res) => {
  if (!auth.isAuthenticated()) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  try {
    const products = require('./api/products');
    const stockMonitor = require('./services/stockMonitor');
    
    logger.info('🔍 Obteniendo TODOS los productos del usuario...');
    
    // Obtener lista completa de IDs usando scan (TODOS los productos)
    const scanResult = await products.getAllProducts();
    const allProductIds = Array.isArray(scanResult) ? scanResult : scanResult.results || [];
    
    logger.info(`📋 Total de IDs obtenidos con scan: ${allProductIds.length}`);
    
    // Info adicional del scan si está disponible
    if (scanResult.scanCompleted !== undefined) {
      logger.info(`📊 Scan completado: ${scanResult.scanCompleted ? 'SÍ' : 'NO'} (${scanResult.pagesProcessed || 'N/A'} páginas)`);
    }
    
    // Obtener detalles de los primeros 50 productos para análisis rápido
    // (para 2908 productos sería demasiado lento obtener todos los detalles)
    const sampleSize = Math.min(50, allProductIds.length);
    const sampleIds = allProductIds.slice(0, sampleSize);
    const allProductDetails = [];
    const errorProducts = [];
    
    logger.info(`📊 Analizando muestra de ${sampleSize} productos de ${allProductIds.length} total`);
    
    // Procesar muestra en lotes para evitar rate limit
    const batchSize = 10;
    for (let i = 0; i < sampleIds.length; i += batchSize) {
      const batch = sampleIds.slice(i, i + batchSize);
      
      logger.info(`📦 Procesando lote ${Math.floor(i/batchSize) + 1}/${Math.ceil(sampleIds.length/batchSize)}: ${batch.length} productos`);
      
      for (const id of batch) {
        try {
          const productData = await products.getProduct(id);
          allProductDetails.push({
            id: productData.id,
            title: productData.title,
            seller_sku: productData.seller_sku,
            available_quantity: productData.available_quantity,
            status: productData.status,
            permalink: productData.permalink,
            health: productData.health,
            listing_type_id: productData.listing_type_id,
            last_updated: productData.last_updated,
            linkType: productData.permalink ? 
              (productData.permalink.includes('internal-shop.mercadoshops.com.ar') ? 'mercadoshops' : 'standard') : 
              'missing'
          });
        } catch (error) {
          logger.error(`❌ Error obteniendo producto ${id}: ${error.message}`);
          errorProducts.push({
            id,
            error: error.message
          });
        }
      }
      
      // Pausa entre lotes
      if (i + batchSize < sampleIds.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    // Estadísticas
    const stats = {
      totalIdsFound: allProductIds.length, // Total de productos únicos obtenidos en este lote
      sampleAnalyzed: sampleSize, // Muestra analizada para detalles
      successfullyLoaded: allProductDetails.length,
      errorProducts: errorProducts.length,
      byStatus: {},
      byLinkType: {},
      withSKU: allProductDetails.filter(p => p.seller_sku).length,
      withoutSKU: allProductDetails.filter(p => !p.seller_sku).length,
      scanMethod: 'batch', // Indica que usamos el método scan por lotes
      scanCompleted: scanResult.scanCompleted !== undefined ? scanResult.scanCompleted : null,
      batchCompleted: scanResult.batchCompleted !== undefined ? scanResult.batchCompleted : null,
      hasMoreProducts: scanResult.hasMoreProducts !== undefined ? scanResult.hasMoreProducts : null,
      pagesProcessed: scanResult.pagesProcessed || null,
      duplicatesDetected: scanResult.duplicatesDetected || null,
      uniqueProducts: scanResult.uniqueProducts || allProductIds.length,
      scanError: scanResult.error || null,
      expectedTotal: '~2908', // Tu total real en MercadoLibre
      continueEndpoint: scanResult.hasMoreProducts ? '/api/products/continue-scan' : null
    };
    
    // Estadísticas por estado
    allProductDetails.forEach(p => {
      const status = p.status || 'unknown';
      stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;
      
      const linkType = p.linkType || 'unknown';
      stats.byLinkType[linkType] = (stats.byLinkType[linkType] || 0) + 1;
    });
    
    logger.info(`✅ Análisis completo: ${stats.successfullyLoaded}/${stats.totalIdsFound} productos cargados`);
    
    res.json({
      summary: stats,
      productIds: allProductIds,
      productDetails: allProductDetails,
      errors: errorProducts,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error(`Error en debug de todos los productos: ${error.message}`);
    res.status(500).json({ 
      error: 'Error al obtener todos los productos',
      message: error.message 
    });
  }
});

// NUEVO: API para continuar scan por lotes - OPTIMIZADO con lotes pequeños
app.post('/api/products/continue-scan', async (req, res) => {
  if (!auth.isAuthenticated()) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  try {
    const products = require('./api/products');
    const stockMonitor = require('./services/stockMonitor');
    
    logger.info('🔄 API: Continuando scan de productos...');
    
    const result = await products.continueProductScan();
    
    // CRÍTICO: Actualizar stockMonitor con información del scan (SIEMPRE, incluso si results=null)
    if (result.results === null) {
      logger.info('🏁 Scan completado sin productos nuevos - actualizando solo scanInfo en stockMonitor');
      // IMPORTANTE: Actualizar scanInfo incluso cuando no hay productos nuevos
      await stockMonitor.refreshProductList(result);
    } else {
      logger.info(`🔄 SINCRONIZANDO stockMonitor con ${result.results.length} productos acumulados...`);
      // Forzar actualización del stockMonitor con los nuevos productos
      await stockMonitor.refreshProductList(result);
    }
    
    // Forzar checkStock para actualizar contadores de stock bajo inmediatamente
    logger.info('🔄 Forzando verificación de stock para actualizar contadores...');
    await stockMonitor.checkStock(true); // skipRefresh = true, ya tenemos los datos actualizados
    
    const currentStatus = stockMonitor.getStatus();
    logger.info(`✅ stockMonitor actualizado - ahora tiene ${currentStatus.totalProducts} productos, ${currentStatus.lowStockProducts.length} con stock bajo`);
    
    // NUEVO: Incluir datos actualizados en la respuesta para verificación
    const message = result.results === null 
      ? 'Scan completado - no hay más productos disponibles'
      : `Scan continuado: ${result.newProducts} productos nuevos obtenidos (total: ${result.total})`;
      
    res.json({
      success: true,
      message: message,
      scanResult: result,
      stockMonitorUpdated: result.results !== null, // Flag para confirmar sincronización
      currentMonitorStatus: {
        totalProducts: currentStatus.totalProducts,
        lowStockProducts: currentStatus.lowStockProducts.length,
        scanInfo: currentStatus.scanInfo
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error(`Error continuando scan: ${error.message}`);
    res.status(500).json({ 
      error: 'Error continuando scan',
      message: error.message 
    });
  }
});

// NUEVO: API para obtener información de categorías
app.post('/api/categories/info', async (req, res) => {
  if (!auth.isAuthenticated()) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  try {
    const { categoryIds } = req.body;
    
    if (!categoryIds || !Array.isArray(categoryIds)) {
      return res.status(400).json({ error: 'Se requiere un array de categoryIds' });
    }

    logger.info(`🔍 Obteniendo información de ${categoryIds.length} categorías`);
    
    const mlApiClient = require('./api/ml-api-client');
    
    // Configurar token de acceso
    const accessToken = await auth.getAccessToken();
    mlApiClient.setAccessToken(accessToken);
    
    // Obtener información de categorías
    const categories = await mlApiClient.getMultipleCategories(categoryIds);
    
    // Procesar y formatear respuesta
    const categoriesInfo = categories.map(category => ({
      id: category.id,
      name: category.name,
      path_from_root: category.path_from_root || [],
      children_categories: category.children_categories || [],
      total_items_in_this_category: category.total_items_in_this_category || 0
    }));

    res.json({
      success: true,
      categories: categoriesInfo,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error(`Error obteniendo categorías: ${error.message}`);
    res.status(500).json({ 
      error: 'Error al obtener información de categorías',
      message: error.message 
    });
  }
});

// ==========================================
// ENDPOINTS DE ALERTAS DE STOCK
// ==========================================

// Obtener alertas de stock del usuario
app.get('/api/stock-alerts', async (req, res) => {
  try {
    // Validar autenticación usando el sistema de sesiones
    const cookieId = req.sessionCookie;
    if (!cookieId) {
      return res.status(401).json({ error: 'No hay sesión activa' });
    }

    const session = sessionManager.getSessionByCookie(cookieId);
    if (!session || !session.userId) {
      return res.status(401).json({ error: 'Sesión inválida' });
    }

    const userId = session.userId;
    const { limit = 50, offset = 0, alertType } = req.query;
    
    logger.info(`📋 Obteniendo alertas de stock para usuario: ${userId}`);
    
    const filters = { 
      limit: parseInt(limit), 
      offset: parseInt(offset) 
    };
    
    if (alertType) {
      filters.alertType = alertType;
    }
    
    const alerts = await databaseService.getStockAlerts(userId, filters);
    const alertsCount = await databaseService.getAlertsCount(userId);
    
    res.json({
      success: true,
      alerts,
      count: alertsCount,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: alertsCount.total
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error(`❌ Error obteniendo alertas de stock: ${error.message}`);
    res.status(500).json({ 
      error: 'Error al obtener alertas de stock',
      message: error.message 
    });
  }
});

// Obtener estadísticas de alertas
app.get('/api/stock-alerts/stats', async (req, res) => {
  try {
    // Validar autenticación usando el sistema de sesiones
    const cookieId = req.sessionCookie;
    if (!cookieId) {
      return res.status(401).json({ error: 'No hay sesión activa' });
    }

    const session = sessionManager.getSessionByCookie(cookieId);
    if (!session || !session.userId) {
      return res.status(401).json({ error: 'Sesión inválida' });
    }

    const userId = session.userId;
    
    logger.info(`📊 Obteniendo estadísticas de alertas para usuario: ${userId}`);
    
    const alertsCount = await databaseService.getAlertsCount(userId);
    
    res.json({
      success: true,
      stats: alertsCount,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error(`❌ Error obteniendo estadísticas de alertas: ${error.message}`);
    res.status(500).json({ 
      error: 'Error al obtener estadísticas de alertas',
      message: error.message 
    });
  }
});

// NUEVO: API para debug detallado del proceso de scan
app.get('/debug/scan-process', async (req, res) => {
  if (!auth.isAuthenticated()) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  try {
    const mlApiClient = require('./api/ml-api-client');
    const user = await mlApiClient.getUser();
    
    logger.info('🔍 DEBUG: Ejecutando scan paso a paso...');
    
    // Simular el proceso de scan con logging detallado
    const result = await mlApiClient.getAllUserProducts(user.id, {
      limit: 100,
      maxProducts: 500 // Límite más bajo para debugging rápido
    });
    
    res.json({
      message: 'Debug del proceso de scan',
      userId: user.id,
      userNickname: user.nickname,
      scanResult: {
        totalProductsFound: result.results.length,
        scanCompleted: result.scanCompleted,
        pagesProcessed: result.pagesProcessed,
        error: result.error,
        firstFewProducts: result.results.slice(0, 5),
        lastFewProducts: result.results.slice(-5)
      },
      rateLimitStats: mlApiClient.getRateLimitStats(),
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error(`Error en debug de scan: ${error.message}`);
    res.status(500).json({ 
      error: 'Error en debug de scan',
      message: error.message,
      stack: error.stack
    });
  }
});

// NUEVO: API para debug de producto específico con SKU y enlaces
app.get('/debug/product/:id', async (req, res) => {
  if (!auth.isAuthenticated()) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  try {
    const productId = req.params.id;
    const products = require('./api/products');
    
    logger.info(`🔍 Debug de producto específico: ${productId}`);
    
    const debugResult = await products.getProductWithDebugInfo(productId);
    
    res.json(debugResult);
  } catch (error) {
    logger.error(`Error en debug de producto ${req.params.id}: ${error.message}`);
    res.status(500).json({ 
      error: 'Error al debuggear producto',
      productId: req.params.id,
      message: error.message 
    });
  }
});

// NUEVO: API para comparar datos del dashboard vs API real
app.get('/debug/dashboard-consistency', async (req, res) => {
  if (!auth.isAuthenticated()) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  try {
    const stockMonitor = require('./services/stockMonitor');
    const products = require('./api/products');
    
    logger.info('🔍 Verificando consistencia entre dashboard y API...');
    
    // Obtener estado actual del monitor
    const monitorStatus = stockMonitor.getStatus();
    
    // Obtener productos con stock bajo del monitor
    const dashboardProducts = monitorStatus.lowStockProducts;
    
    // Verificar cada producto individualmente contra la API
    const consistencyCheck = [];
    
    for (const dashboardProduct of dashboardProducts.slice(0, 5)) { // Limitar a 5 para evitar rate limit
      try {
        const apiProduct = await products.getProduct(dashboardProduct.id);
        
        const isConsistent = {
          id: dashboardProduct.id === apiProduct.id,
          title: dashboardProduct.title === apiProduct.title,
          stock: dashboardProduct.stock === apiProduct.available_quantity,
          sku: (dashboardProduct.seller_sku || null) === (apiProduct.seller_sku || null),
          permalink: (dashboardProduct.permalink || null) === (apiProduct.permalink || null)
        };
        
        const allConsistent = Object.values(isConsistent).every(v => v === true);
        
        consistencyCheck.push({
          productId: dashboardProduct.id,
          consistent: allConsistent,
          dashboard: {
            title: dashboardProduct.title,
            stock: dashboardProduct.stock,
            sku: dashboardProduct.seller_sku,
            permalink: dashboardProduct.permalink
          },
          api: {
            title: apiProduct.title,
            stock: apiProduct.available_quantity,
            sku: apiProduct.seller_sku,
            permalink: apiProduct.permalink
          },
          fieldComparison: isConsistent,
          links: {
            dashboardUrl: dashboardProduct.productUrl || products.generateProductUrl(dashboardProduct.id),
            apiPermalink: apiProduct.permalink,
            generatedUrl: products.generateProductUrl(apiProduct.id),
            allLinksMatch: (dashboardProduct.permalink === apiProduct.permalink)
          }
        });
        
      } catch (productError) {
        consistencyCheck.push({
          productId: dashboardProduct.id,
          consistent: false,
          error: productError.message,
          dashboard: dashboardProduct
        });
      }
    }
    
    const totalChecked = consistencyCheck.length;
    const consistentCount = consistencyCheck.filter(c => c.consistent).length;
    const consistencyPercentage = totalChecked > 0 ? Math.round((consistentCount / totalChecked) * 100) : 0;
    
    const result = {
      summary: {
        totalProductsInDashboard: dashboardProducts.length,
        productsChecked: totalChecked,
        consistentProducts: consistentCount,
        inconsistentProducts: totalChecked - consistentCount,
        consistencyPercentage: consistencyPercentage
      },
      detailedCheck: consistencyCheck,
      recommendations: [],
      timestamp: new Date().toISOString()
    };
    
    // Generar recomendaciones
    if (consistencyPercentage < 100) {
      result.recommendations.push({
        type: 'warning',
        message: `${totalChecked - consistentCount} productos tienen inconsistencias`,
        action: 'Revisar sincronización de datos entre dashboard y API'
      });
    }
    
    const linkIssues = consistencyCheck.filter(c => c.links && !c.links.allLinksMatch).length;
    if (linkIssues > 0) {
      result.recommendations.push({
        type: 'error',
        message: `${linkIssues} productos tienen problemas con enlaces`,
        action: 'Verificar generación de URLs y permalinks'
      });
    }
    
    logger.info(`✅ Consistencia verificada: ${consistencyPercentage}% (${consistentCount}/${totalChecked})`);
    
    res.json(result);
    
  } catch (error) {
    logger.error(`Error verificando consistencia: ${error.message}`);
    res.status(500).json({ 
      error: 'Error al verificar consistencia',
      message: error.message 
    });
  }
});

// NUEVO: API para forzar sincronización completa
app.post('/debug/force-sync', async (req, res) => {
  if (!auth.isAuthenticated()) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  try {
    const stockMonitor = require('./services/stockMonitor');
    
    logger.info('🔄 Forzando sincronización completa...');
    
    // NUEVO: Limpiar completamente el estado interno
    stockMonitor.trackedProducts.clear();
    stockMonitor.lastKnownStockState.clear();
    stockMonitor.lowStockProducts = [];
    
    logger.info('🧹 Cache y estado interno limpiado');
    
    // Forzar actualización completa de la lista de productos
    await stockMonitor.refreshProductList();
    
    // Realizar verificación de stock
    const result = await stockMonitor.checkStock();
    
    // Debug del estado actual
    stockMonitor.debugCurrentState();
    
    res.json({
      success: true,
      message: 'Sincronización forzada completada con limpieza de cache',
      result: {
        totalProducts: result.totalProducts,
        lowStockProducts: result.lowStockProducts,
        timestamp: result.timestamp
      }
    });
    
  } catch (error) {
    logger.error(`Error en sincronización forzada: ${error.message}`);
    res.status(500).json({ 
      error: 'Error en sincronización forzada',
      message: error.message 
    });
  }
});

// NUEVO: API para limpiar cache específico de un producto fantasma
app.post('/debug/remove-phantom-product/:id', async (req, res) => {
  if (!auth.isAuthenticated()) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  try {
    const productId = req.params.id;
    const stockMonitor = require('./services/stockMonitor');
    
    logger.info(`🔍 Eliminando producto fantasma: ${productId}`);
    
    // Eliminar de todas las estructuras internas
    const wasInTracked = stockMonitor.trackedProducts.has(productId);
    const wasInState = stockMonitor.lastKnownStockState.has(productId);
    const lowStockIndex = stockMonitor.lowStockProducts.findIndex(p => p.id === productId);
    
    stockMonitor.trackedProducts.delete(productId);
    stockMonitor.lastKnownStockState.delete(productId);
    
    if (lowStockIndex >= 0) {
      stockMonitor.lowStockProducts.splice(lowStockIndex, 1);
    }
    
    logger.info(`✅ Producto ${productId} eliminado del cache interno`);
    
    res.json({
      success: true,
      message: `Producto fantasma ${productId} eliminado`,
      cleanupResults: {
        wasInTracked,
        wasInState,
        wasInLowStock: lowStockIndex >= 0,
        remainingTrackedProducts: stockMonitor.trackedProducts.size,
        remainingLowStockProducts: stockMonitor.lowStockProducts.length
      }
    });
    
  } catch (error) {
    logger.error(`Error eliminando producto fantasma: ${error.message}`);
    res.status(500).json({ 
      error: 'Error al eliminar producto fantasma',
      message: error.message 
    });
  }
});

// Debug del estado del monitor
app.get('/debug/monitor-state', (req, res) => {
  try {
    const stockMonitor = require('./services/stockMonitor');
    
    const status = stockMonitor.getStatus();
    
    // Información detallada de productos rastreados
    const trackedProducts = Array.from(stockMonitor.trackedProducts.entries()).map(([id, product]) => ({
      id,
      title: product.title,
      seller_sku: product.seller_sku,
      stock: product.available_quantity,
      hasLowStock: product.hasLowStock(5),
      permalink: product.permalink,
      productUrl: product.getProductUrl(),
      linksMatch: product.permalink === product.getProductUrl(),
      isValid: product.isValid()
    }));
    
    // Estadísticas de calidad de datos
    const total = trackedProducts.length;
    const withPermalink = trackedProducts.filter(p => p.permalink).length;
    const withSKU = trackedProducts.filter(p => p.seller_sku).length;
    const withValidLinks = trackedProducts.filter(p => p.linksMatch || p.permalink).length;
    
    res.json({
      message: 'Estado completo del monitor',
      timestamp: new Date().toISOString(),
      monitorStatus: status,
      trackedProducts,
      statistics: {
        totalProducts: total,
        withPermalink: withPermalink,
        withSKU: withSKU,
        withValidLinks: withValidLinks,
        dataQuality: {
          permalinkPercentage: total > 0 ? Math.round((withPermalink / total) * 100) : 0,
          skuPercentage: total > 0 ? Math.round((withSKU / total) * 100) : 0,
          linkValidityPercentage: total > 0 ? Math.round((withValidLinks / total) * 100) : 0
        }
      },
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

// ==========================================
// ENDPOINTS DE WEBHOOKS MERCADOLIBRE
// ==========================================

/**
 * Endpoint principal para recibir webhooks de MercadoLibre
 * CRÍTICO: Debe responder HTTP 200 en <500ms
 */
app.post('/api/webhooks/ml', async (req, res) => {
  const startTime = Date.now();
  
  try {
    // Obtener IP del cliente (considerando proxies de Vercel)
    const clientIP = req.headers['x-forwarded-for'] || 
                     req.headers['x-real-ip'] || 
                     req.connection.remoteAddress || 
                     req.socket.remoteAddress ||
                     (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
                     'unknown';

    const actualIP = typeof clientIP === 'string' ? clientIP.split(',')[0].trim() : 'unknown';
    
    logger.info(`🔔 Webhook recibido desde IP: ${actualIP}`);
    logger.debug(`📋 Headers: ${JSON.stringify(req.headers)}`);
    logger.debug(`📄 Body: ${JSON.stringify(req.body)}`);

    // Validar que tenemos un body
    if (!req.body || Object.keys(req.body).length === 0) {
      const processingTime = Date.now() - startTime;
      logger.warn(`⚠️ Webhook vacío recibido (${processingTime}ms)`);
      
      return res.status(400).json({
        error: 'Empty webhook body',
        processingTime
      });
    }

    // Procesar webhook
    const result = await webhookProcessor.handleWebhook(req.body, actualIP, req.headers);
    
    // CRÍTICO: Responder inmediatamente con el código apropiado
    res.status(result.httpCode).json({
      success: result.success,
      message: result.message || (result.success ? 'Webhook processed' : 'Webhook failed'),
      webhook_id: result.webhook_id,
      processingTime: result.processingTime
    });

    // Log del resultado
    if (result.success) {
      logger.info(`✅ Webhook ${result.webhook_id} procesado exitosamente (${result.processingTime}ms)`);
    } else {
      logger.error(`❌ Webhook falló: ${result.error} (${result.processingTime}ms)`);
    }

  } catch (error) {
    const processingTime = Date.now() - startTime;
    logger.error(`❌ Error crítico en webhook endpoint: ${error.message} (${processingTime}ms)`);
    
    // CRÍTICO: Siempre responder, nunca dejar colgado a ML
    res.status(500).json({
      error: 'Internal server error',
      processingTime
    });
  }
});

/**
 * Endpoint para verificar estado de configuración de webhooks
 */
app.get('/api/webhooks/status', async (req, res) => {
  try {
    const stats = await webhookProcessor.getWebhookStats();
    
    // Verificar configuración
    const config = {
      webhooksEnabled: await databaseService.getConfig('webhooks_enabled'),
      supportedTopics: webhookProcessor.supportedTopics,
      callbackUrl: `${req.protocol}://${req.get('host')}/api/webhooks/ml`,
      environment: process.env.NODE_ENV || 'production'
    };

    res.json({
      status: 'OK',
      config,
      stats,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error(`❌ Error obteniendo estado de webhooks: ${error.message}`);
    res.status(500).json({
      error: 'Failed to get webhook status',
      message: error.message
    });
  }
});

/**
 * Endpoint para configurar webhooks automáticamente (desarrollo)
 */
app.post('/api/webhooks/setup', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({
      error: 'Setup endpoint only available in development'
    });
  }

  try {
    // TODO: Implementar configuración automática de webhooks en ML
    // Esto requiere llamadas a ML API para configurar los topics
    
    res.json({
      message: 'Webhook setup endpoint - TODO: implementar configuración automática',
      callbackUrl: `${req.protocol}://${req.get('host')}/api/webhooks/ml`,
      topics: webhookProcessor.supportedTopics
    });

  } catch (error) {
    logger.error(`❌ Error en setup de webhooks: ${error.message}`);
    res.status(500).json({
      error: 'Failed to setup webhooks',
      message: error.message
    });
  }
});

/**
 * Endpoint para obtener webhooks pendientes (debugging)
 */
app.get('/api/webhooks/pending', async (req, res) => {
  if (!auth.isAuthenticated()) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  try {
    const limit = parseInt(req.query.limit) || 20;
    const pendingWebhooks = await databaseService.getPendingWebhooks(limit);
    
    res.json({
      webhooks: pendingWebhooks,
      count: pendingWebhooks.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error(`❌ Error obteniendo webhooks pendientes: ${error.message}`);
    res.status(500).json({
      error: 'Failed to get pending webhooks',
      message: error.message
    });
  }
});

/**
 * Endpoint para procesar webhooks pendientes manualmente
 */
app.post('/api/webhooks/process-pending', async (req, res) => {
  if (!auth.isAuthenticated()) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  try {
    const { webhookId } = req.body;
    
    if (webhookId) {
      // Procesar webhook específico
      await webhookProcessor.processWebhookAsync(webhookId);
      res.json({
        message: `Webhook ${webhookId} procesado`,
        webhook_id: webhookId
      });
    } else {
      // Procesar todos los pendientes
      const pendingWebhooks = await databaseService.getPendingWebhooks(10);
      
      for (const webhook of pendingWebhooks) {
        try {
          await webhookProcessor.processWebhookAsync(webhook.webhook_id);
        } catch (error) {
          logger.error(`❌ Error procesando webhook ${webhook.webhook_id}: ${error.message}`);
        }
      }
      
      res.json({
        message: `${pendingWebhooks.length} webhooks procesados`,
        processed: pendingWebhooks.length
      });
    }

  } catch (error) {
    logger.error(`❌ Error procesando webhooks pendientes: ${error.message}`);
    res.status(500).json({
      error: 'Failed to process pending webhooks',
      message: error.message
    });
  }
});

// ==========================================
// ENDPOINT LEGACY PARA WEBHOOKS EXISTENTES
// CRÍTICO: Mantener compatibilidad con URL configurada en ML
// ==========================================

/**
 * Endpoint legacy: /webhook/notifications
 * Para mantener compatibilidad con configuración actual en ML
 */
app.post('/webhook/notifications', async (req, res) => {
  const startTime = Date.now();
  
  try {
    logger.info('🔄 Webhook recibido en endpoint LEGACY (/webhook/notifications)');
    
    // Obtener IP del cliente
    const clientIP = req.headers['x-forwarded-for'] || 
                     req.headers['x-real-ip'] || 
                     req.connection.remoteAddress || 
                     'unknown';

    const actualIP = typeof clientIP === 'string' ? clientIP.split(',')[0].trim() : 'unknown';
    
    logger.info(`🔔 Webhook legacy desde IP: ${actualIP}`);
    logger.debug(`📋 Headers: ${JSON.stringify(req.headers)}`);
    logger.debug(`📄 Body: ${JSON.stringify(req.body)}`);

    // Validar body
    if (!req.body || Object.keys(req.body).length === 0) {
      const processingTime = Date.now() - startTime;
      logger.warn(`⚠️ Webhook legacy vacío (${processingTime}ms)`);
      
      return res.status(400).json({
        error: 'Empty webhook body',
        processingTime,
        endpoint: 'legacy'
      });
    }

    // Procesar con el mismo handler
    const result = await webhookProcessor.handleWebhook(req.body, actualIP, req.headers);
    
    // CRÍTICO: Responder inmediatamente
    res.status(result.httpCode).json({
      success: result.success,
      message: result.message || (result.success ? 'Webhook processed (legacy)' : 'Webhook failed'),
      webhook_id: result.webhook_id,
      processingTime: result.processingTime,
      endpoint: 'legacy'
    });

    // Log resultado
    if (result.success) {
      logger.info(`✅ Webhook legacy ${result.webhook_id} procesado (${result.processingTime}ms)`);
    } else {
      logger.error(`❌ Webhook legacy falló: ${result.error} (${result.processingTime}ms)`);
    }

  } catch (error) {
    const processingTime = Date.now() - startTime;
    logger.error(`❌ Error crítico en webhook legacy: ${error.message} (${processingTime}ms)`);
    
    // CRÍTICO: SIEMPRE responder, nunca dejar colgado
    res.status(500).json({
      error: 'Internal server error',
      processingTime,
      endpoint: 'legacy'
    });
  }
});

// Ruta principal
app.get('/', async (req, res) => {
  try {
    if (auth.isAuthenticated()) {
      // DESACTIVADO: No auto-iniciar sync en dashboard para evitar timeout
      // El usuario debe usar /api/sync-background manualmente
      logger.debug('📋 Dashboard cargado - usar /api/sync-background para sincronizar productos');
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

// Callback de autenticación para establecer cookie
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

    // Establecer cookie segura en el navegador
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

    // DESACTIVADO: No iniciar sync automático en callback para evitar timeout 504
    // El usuario debe usar /api/sync-background manualmente después de autenticarse
    logger.info('✅ Autenticación completada - usar /api/sync-background para sincronizar productos');
    logger.info('📋 La sincronización automática está desactivada para evitar timeouts en el callback');

    // Redirigir al dashboard
    res.redirect('/');
    
  } catch (error) {
    logger.error(`❌ Error en el callback de autenticación: ${error.message}`);
    
    // NUEVO: Manejar específicamente usuario no autorizado
    if (error.message.startsWith('UNAUTHORIZED_USER:')) {
      const [, userId, nickname] = error.message.split(':');
      logger.warn(`🚫 Acceso denegado en callback para usuario: ${userId} (${nickname})`);
      
      // Redirigir a página de acceso denegado
      return res.redirect(`/acceso-denegado?userId=${userId}&nickname=${encodeURIComponent(nickname)}`);
    }
    
    // Log adicional para debugging de otros errores
    if (error.response) {
      logger.error(`📄 Respuesta del servidor ML:`, {
        status: error.response.status,
        data: error.response.data,
        headers: error.response.headers
      });
    }
    
    // Respuesta más detallada para debugging de otros errores
    const errorMessage = `Error durante la autenticación: ${error.message}`;
    const debugInfo = process.env.NODE_ENV === 'development' ? 
      `\n\nDetalles técnicos:\n- Código recibido: ${code}\n- Error: ${error.stack}` : '';
    
    res.status(500).send(errorMessage + debugInfo);
  }
});

// NUEVO: Página de acceso denegado
app.get('/acceso-denegado', (req, res) => {
  const { userId, nickname } = req.query;
  
  res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Acceso No Autorizado - Monitor de Stock ML</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css" rel="stylesheet">
        <style>
            body { background-color: #f8f9fa; }
            .container { margin-top: 5rem; }
            .error-icon { font-size: 4rem; color: #dc3545; }
            .user-info { background-color: #fff3cd; border: 1px solid #ffeaa7; border-radius: 0.375rem; padding: 1rem; margin: 1rem 0; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="row justify-content-center">
                <div class="col-md-8 col-lg-6">
                    <div class="card shadow">
                        <div class="card-body text-center p-5">
                            <div class="error-icon mb-4">🚫</div>
                            <h2 class="card-title text-danger mb-4">Acceso No Autorizado</h2>
                            <p class="card-text mb-4">
                                Esta aplicación es para uso interno empresarial. Tu cuenta de MercadoLibre no está autorizada para acceder.
                            </p>
                            ${userId ? `
                            <div class="user-info text-start">
                                <h6>🆔 Información de tu cuenta:</h6>
                                <strong>Usuario ID:</strong> ${userId}<br>
                                <strong>Nickname:</strong> ${nickname || 'No disponible'}
                            </div>
                            ` : ''}
                            <p class="card-text text-muted mb-4">
                                Si necesitas acceso, contacta al administrador del sistema con tu <strong>Usuario ID</strong> mostrado arriba.
                            </p>
                            <div class="d-grid gap-2">
                                <a href="/" class="btn btn-primary">🔙 Volver al inicio</a>
                                <a href="/auth/logout" class="btn btn-outline-secondary">🚪 Cerrar sesión de ML</a>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </body>
    </html>
  `);
});

// TEMPORAL: Endpoint para obtener tu User ID (eliminar después de configurar ALLOWED_ML_USERS)
app.get('/debug/mi-user-id', async (req, res) => {
  try {
    if (!auth.isAuthenticated()) {
      return res.json({
        error: 'No autenticado',
        message: 'Debes loguearte primero para ver tu User ID',
        loginUrl: '/auth/login'
      });
    }

    const userId = await auth.getCurrentUserId();
    const userInfo = await auth.getUserInfo();
    
    res.json({
      success: true,
      userId: userId,
      nickname: userInfo.nickname,
      email: userInfo.email,
      message: 'Guarda este User ID para agregarlo a ALLOWED_ML_USERS en Vercel',
      instructions: [
        '1. Ve a tu dashboard de Vercel',
        '2. Selecciona tu proyecto',
        '3. Ve a Settings → Environment Variables', 
        '4. Agrega: ALLOWED_ML_USERS = ' + userId,
        '5. Redeploy la aplicación'
      ]
    });
    
  } catch (error) {
    logger.error(`Error obteniendo User ID: ${error.message}`);
    res.status(500).json({
      error: 'Error interno',
      message: error.message
    });
  }
});

// Logout para limpiar cookie
app.get('/auth/logout', (req, res) => {
  try {
    const currentUserId = auth.currentSessionId;
    if (currentUserId) {
      logger.info(`🚪 Cerrando sesión para usuario: ${currentUserId}`);
    }

    auth.logout(); // Esto ahora invalida la sesión automáticamente
    stockMonitor.stop();

    // Limpiar cookie del navegador
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

// API para verificar el estado de autenticación y monitoreo con validación de cookies
app.get('/api/auth/status', async (req, res) => {
  try {
    const isAuthenticated = auth.isAuthenticated();
    let userInfo = null;
    let sessionValid = true;
    
    if (isAuthenticated) {
      try {
        // Obtener información completa del usuario
        const userId = await auth.getCurrentUserId();
        const sessionInfo = auth.getCurrentSessionInfo();
        
        userInfo = {
          id: userId,
          sessionInfo: sessionInfo
        };
        
        // Intentar obtener el nickname y otros datos del usuario desde ML API
        try {
          const userDetails = await auth.getUserInfo();
          if (userDetails) {
            userInfo.nickname = userDetails.nickname;
            userInfo.email = userDetails.email;
          }
        } catch (userDetailsError) {
          // Si no se puede obtener detalles, continuar solo con ID
          logger.debug(`No se pudieron obtener detalles del usuario: ${userDetailsError.message}`);
        }
        
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

    // Debug logging para diagnosticar actualizaciones de dashboard
    logger.debug(`📊 /api/auth/status llamado - totalProducts: ${monitorStatus.totalProducts}, lowStock: ${monitorStatus.lowStockProducts?.length || 0}`);

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

// API para obtener estado de monitoreo (general)
app.get('/api/monitor/status', async (req, res) => {
  // La autenticación ya fue validada por el middleware

  try {
    const monitorStatus = stockMonitor.getStatus();
    
    res.json({
      success: true,
      monitoring: {
        ...monitorStatus,
        responseTime: Date.now(),
        source: 'general_status'
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error(`Error en /api/monitor/status: ${error.message}`);
    res.status(500).json({ 
      error: 'Error al obtener estado del monitor',
      monitoring: { active: false, error: error.message }
    });
  }
});

// API para obtener estado de monitoreo CON validación de sesión (filtrado por usuario)
app.get('/api/monitor/status-db', async (req, res) => {
  try {
    // Validar autenticación usando el sistema de sesiones
    const cookieId = req.sessionCookie; // Ya establecido por middleware
    if (!cookieId) {
      logger.warn('📊 Status-DB: No cookie - intentando devolver datos básicos');
      // En lugar de 401, devolver datos básicos sin filtrar por usuario
      return res.json({
        success: false,
        error: 'No hay sesión activa',
        monitoring: { 
          active: false, 
          totalProducts: 0,
          lowStockProducts: [],
          lowStockCount: 0,
          error: 'Sin autenticación' 
        },
        timestamp: new Date().toISOString()
      });
    }

    const session = sessionManager.getSessionByCookie(cookieId);
    if (!session || !session.userId) {
      logger.warn('📊 Status-DB: Sesión inválida - intentando devolver datos básicos');
      // En lugar de 401, devolver datos básicos
      return res.json({
        success: false,
        error: 'Sesión inválida',
        monitoring: { 
          active: false, 
          totalProducts: 0,
          lowStockProducts: [],
          lowStockCount: 0,
          error: 'Sesión expirada' 
        },
        timestamp: new Date().toISOString()
      });
    }

    const userId = session.userId;
    logger.debug(`📊 Status-DB para usuario: ${userId}`);

    // Obtener estado específico del usuario
    await stockMonitor.updateSessionCache(userId);
    const monitorStatus = stockMonitor.getStatus();
    
    res.json({
      monitoring: {
        ...monitorStatus,
        userId: userId,
        responseTime: Date.now(),
        source: 'database_filtered' // Indicar que viene filtrado por usuario
      },
      lastSyncTime: new Date().toISOString()
    });
  } catch (error) {
    logger.error(`Error en /api/monitor/status-db: ${error.message}`);
    // Devolver datos básicos en lugar de 500
    res.json({ 
      success: false,
      error: 'Error al obtener estado desde BD',
      monitoring: { 
        active: false, 
        totalProducts: 0,
        lowStockProducts: [],
        lowStockCount: 0,
        error: error.message 
      },
      timestamp: new Date().toISOString()
    });
  }
});

// API ligera para verificar SOLO estado de sesión ML (sin datos de productos)
app.get('/api/auth/session-status', async (req, res) => {
  try {
    const isAuthenticated = auth.isAuthenticated();
    let userInfo = null;
    
    if (isAuthenticated) {
      try {
        userInfo = await auth.getUserInfo();
      } catch (error) {
        logger.warn(`⚠️ Error obteniendo info de usuario: ${error.message}`);
      }
    }
    
    res.json({
      authenticated: isAuthenticated,
      user: userInfo,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error(`Error en /api/auth/session-status: ${error.message}`);
    res.json({
      authenticated: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// API para verificar stock de producto específico con debug completo
app.get('/api/products/:id/stock', async (req, res) => {
  if (!auth.isAuthenticated()) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  try {
    const productId = req.params.id;
    logger.info(`🔍 API: Verificación individual de producto ${productId}`);

    // Usar el método del monitor para mantener consistencia
    const stockMonitor = require('./services/stockMonitor');
    const product = await stockMonitor.checkProductStock(productId);

    // Información de debugging adicional
    const debugInfo = product.getDebugInfo();
    
    const responseData = {
      id: product.id,
      title: product.title,
      seller_sku: product.seller_sku, // Incluir SKU
      available_quantity: product.available_quantity,
      has_low_stock: product.hasLowStock(config.monitoring.stockThreshold),
      is_out_of_stock: product.isOutOfStock(),
      threshold: config.monitoring.stockThreshold,
      permalink: product.permalink,
      productUrl: product.getProductUrl(), // URL validada
      last_updated: Date.now(),
      last_updated_iso: new Date().toISOString(),
      debug: debugInfo // Información de debug
    };

    logger.info(`📊 API: Respuesta para ${productId}:`);
    logger.info(`   Título: ${product.title}`);
    logger.info(`   Stock: ${product.available_quantity} unidades`);
    logger.info(`   SKU: ${product.seller_sku || 'Sin SKU'}`);
    logger.info(`   Permalink: ${product.permalink || 'No disponible'}`);
    logger.info(`   URL usada: ${product.getProductUrl()}`);

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

// Sincronización simple y rápida (nuevo sistema)
app.get('/api/sync-next', async (req, res) => {
  const handleSyncNext = require('./api/sync-next');
  await handleSyncNext(req, res);
});

// API para debug (solo en desarrollo)
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

// API para controlar cambios automáticos de stock (solo desarrollo)
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

// API para configurar frecuencia de cambios (solo desarrollo)
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
      secureSessions: true,
      mercadoLibreLinks: true
    }
  });
});

// Ruta de verificación de estado para Vercel
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
      sessions: sessionStats,
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

// ========== ENDPOINTS PARA REACT FRONTEND ==========

// GET /api/products - Obtener todos los productos
app.get('/api/products', async (req, res) => {
  try {
    // DEBUG: Verificar estado de autenticación
    logger.info(`🔍 PRODUCTS ENDPOINT DEBUG:`);
    logger.info(`   - auth.currentSessionId: ${auth.currentSessionId}`);
    logger.info(`   - auth.isAuthenticated(): ${auth.isAuthenticated()}`);
    logger.info(`   - req.sessionCookie: ${req.sessionCookie ? req.sessionCookie.substring(0, 8) + '...' : 'null'}`);
    
    // La autenticación ya fue validada por el middleware
    // Obtener productos directamente de la base de datos (no de ML API)
    
    logger.info(`📦 Obteniendo productos para usuario: ${auth.currentSessionId}`);
    const products = await databaseService.getAllProducts(auth.currentSessionId);
    logger.info(`📦 Productos encontrados: ${products.length}`);
    
    // Formatear para el frontend
    const productDetails = products.map(product => ({
      id: product.id,
      title: product.title,
      seller_sku: product.seller_sku,
      available_quantity: product.available_quantity,
      status: product.status,
      permalink: product.permalink,
      thumbnail: null, // No tenemos thumbnails en BD
      updated_at: product.updated_at || product.last_webhook_sync
    }));

    res.json({
      products: productDetails,
      total: products.length,
      showing: productDetails.length
    });

  } catch (error) {
    logger.error(`Error en /api/products: ${error.message}`);
    res.status(500).json({ error: 'Error obteniendo productos' });
  }
});

// GET /api/products/stats - Estadísticas de productos
app.get('/api/products/stats', async (req, res) => {
  try {
    // La autenticación ya fue validada por el middleware

    const monitorStatus = stockMonitor.getStatus();
    
    res.json({
      totalProducts: monitorStatus.totalProducts || 0,
      lowStockProducts: monitorStatus.lowStockProducts?.length || 0,
      lastSync: monitorStatus.lastSyncTime,
      monitoring: monitorStatus.active
    });

  } catch (error) {
    logger.error(`Error en /api/products/stats: ${error.message}`);
    res.status(500).json({ error: 'Error obteniendo estadísticas' });
  }
});

// POST /api/monitor/sync - Sincronizar productos
app.post('/api/monitor/sync', async (req, res) => {
  try {
    // La autenticación ya fue validada por el middleware

    logger.info('🔄 Iniciando sincronización desde React frontend');
    
    const products = require('./api/products');
    // Usar el userId que estableció el middleware
    await products.ensureAuthentication(auth.currentSessionId);
    
    const result = await stockMonitor.forceSync();
    
    res.json({
      success: true,
      message: 'Sincronización completada',
      result: {
        totalProducts: result.totalProducts,
        lowStockProducts: result.lowStockProducts,
        timestamp: result.timestamp
      }
    });

  } catch (error) {
    logger.error(`Error en /api/monitor/sync: ${error.message}`);
    res.status(500).json({ error: 'Error en sincronización' });
  }
});

// POST /api/auth/logout - Cerrar sesión (formato JSON para React)
app.post('/api/auth/logout', async (req, res) => {
  try {
    // No necesita validación de autenticación para logout
    const currentUserId = auth.currentSessionId;
    if (currentUserId) {
      logger.info(`🚪 Cerrando sesión para usuario: ${currentUserId} (desde React)`);
    }
    
    auth.logout();
    stockMonitor.stop();
    
    // Limpiar cookie del navegador
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
    logger.error(`Error en /api/auth/logout: ${error.message}`);
    res.status(500).json({ error: 'Error cerrando sesión' });
  }
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