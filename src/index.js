/**
 * Aplicación principal - Monitor de Stock de Mercado Libre
 * Versión completa con soporte para webhooks
 */

const express = require('express');
const path = require('path');
const fs = require('fs');

// Configurar variables de entorno
const envPath = path.join(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
} else {
  require('dotenv').config();
}

const logger = require('./utils/logger');
const auth = require('./api/auth');
const stockMonitor = require('./services/stockMonitor');

const app = express();
const port = process.env.PORT || 3000;

// Middleware para parsing JSON (con raw para webhooks)
app.use('/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir archivos estáticos
app.use(express.static(path.join(__dirname, '../public')));

// ==============================================
// RUTAS PRINCIPALES
// ==============================================

// Página principal
app.get('/', (req, res) => {
  try {
    // Si está autenticado, mostrar dashboard
    if (auth.isAuthenticated()) {
      res.sendFile(path.join(__dirname, '../public/dashboard.html'));
    } else {
      // Si no está autenticado, mostrar página de login
      res.sendFile(path.join(__dirname, '../public/index.html'));
    }
  } catch (error) {
    logger.error('Error en ruta principal:', error.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Ruta de health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Monitor de Stock ML funcionando correctamente',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    mode: process.env.MOCK_ML_API === 'true' ? 'Mock' : 'Production'
  });
});

// ==============================================
// RUTAS DE AUTENTICACIÓN
// ==============================================

// Iniciar proceso de autenticación
app.get('/auth/login', (req, res) => {
  try {
    const authUrl = auth.getAuthUrl();
    logger.info('🔐 Redirigiendo a URL de autorización');
    res.redirect(authUrl);
  } catch (error) {
    logger.error('Error al generar URL de autorización:', error.message);
    res.status(500).json({ 
      error: 'Error al iniciar autenticación',
      message: error.message 
    });
  }
});

// Callback de autenticación
app.get('/auth/callback', async (req, res) => {
  try {
    const { code, error } = req.query;
    
    if (error) {
      logger.error('Error en callback de autenticación:', error);
      return res.redirect('/?error=auth_denied');
    }
    
    if (!code) {
      logger.error('No se recibió código de autorización');
      return res.redirect('/?error=no_code');
    }
    
    logger.info('✅ Código de autorización recibido, intercambiando por tokens...');
    
    // Intercambiar código por tokens
    const tokens = await auth.exchangeCodeForTokens(code);
    
    logger.info('🎉 Autenticación completada exitosamente');
    
    // Iniciar monitoreo automático
    if (process.env.MOCK_ML_API !== 'true') {
      try {
        await stockMonitor.start();
        logger.info('🔄 Monitoreo de stock iniciado automáticamente');
      } catch (monitorError) {
        logger.error('Error al iniciar monitoreo:', monitorError.message);
      }
    }
    
    // Redirigir al dashboard
    res.redirect('/');
    
  } catch (error) {
    logger.error('❌ Error durante la autenticación:', error.message);
    res.redirect('/?error=auth_failed');
  }
});

// Estado de autenticación
app.get('/api/auth/status', (req, res) => {
  try {
    const isAuthenticated = auth.isAuthenticated();
    
    res.json({
      authenticated: isAuthenticated,
      user: isAuthenticated ? 'Usuario autenticado' : null,
      timestamp: new Date().toISOString(),
      mode: process.env.MOCK_ML_API === 'true' ? 'Mock' : 'Production'
    });
  } catch (error) {
    logger.error('Error al verificar estado de autenticación:', error.message);
    res.status(500).json({ error: 'Error al verificar autenticación' });
  }
});

// Cerrar sesión
app.post('/api/auth/logout', (req, res) => {
  try {
    auth.logout();
    stockMonitor.stop();
    logger.info('👋 Usuario deslogueado y monitoreo detenido');
    res.json({ success: true, message: 'Sesión cerrada correctamente' });
  } catch (error) {
    logger.error('Error al cerrar sesión:', error.message);
    res.status(500).json({ error: 'Error al cerrar sesión' });
  }
});

// ==============================================
// RUTAS DE API - STOCK MONITOR
// ==============================================

// Obtener estado del stock
app.get('/api/stock', async (req, res) => {
  try {
    if (!auth.isAuthenticated()) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }
    
    const products = await stockMonitor.getCurrentStock();
    const statistics = stockMonitor.getStatistics();
    
    res.json({
      products,
      statistics,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error al obtener stock:', error.message);
    res.status(500).json({ error: 'Error al obtener información de stock' });
  }
});

// Verificar stock manualmente
app.post('/api/stock/check', async (req, res) => {
  try {
    if (!auth.isAuthenticated()) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }
    
    logger.info('🔍 Verificación manual de stock solicitada');
    await stockMonitor.checkStock();
    
    const products = await stockMonitor.getCurrentStock();
    const statistics = stockMonitor.getStatistics();
    
    res.json({
      success: true,
      message: 'Stock verificado correctamente',
      products,
      statistics,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error en verificación manual:', error.message);
    res.status(500).json({ error: 'Error al verificar stock' });
  }
});

// Forzar cambios en stock (solo modo mock)
app.post('/api/stock/force-changes', async (req, res) => {
  try {
    if (process.env.MOCK_ML_API !== 'true') {
      return res.status(403).json({ 
        error: 'Función no disponible en modo producción',
        message: 'Esta función solo está disponible en modo de prueba'
      });
    }
    
    if (!auth.isAuthenticated()) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }
    
    logger.info('🎭 Forzando cambios de stock en modo mock');
    const mockAPI = require('./api/mock-ml-api');
    await mockAPI.forceStockChanges();
    
    // Verificar stock después de los cambios
    await stockMonitor.checkStock();
    const products = await stockMonitor.getCurrentStock();
    
    res.json({
      success: true,
      message: 'Cambios de stock simulados correctamente',
      products,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error al forzar cambios:', error.message);
    res.status(500).json({ error: 'Error al simular cambios de stock' });
  }
});

// Verificar producto específico
app.post('/api/stock/check/:itemId', async (req, res) => {
  try {
    if (!auth.isAuthenticated()) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }
    
    const { itemId } = req.params;
    logger.info(`🔍 Verificación manual solicitada para producto: ${itemId}`);
    
    await stockMonitor.checkSpecificItem(itemId);
    const products = await stockMonitor.getCurrentStock();
    
    res.json({
      success: true,
      message: `Producto ${itemId} verificado correctamente`,
      products,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error al verificar producto específico:', error.message);
    res.status(500).json({ error: 'Error al verificar producto' });
  }
});

// Estadísticas del monitoreo
app.get('/api/stock/statistics', (req, res) => {
  try {
    if (!auth.isAuthenticated()) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }
    
    const statistics = stockMonitor.getStatistics();
    
    res.json({
      statistics,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error al obtener estadísticas:', error.message);
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
});

// ==============================================
// WEBHOOKS DE MERCADO LIBRE
// ==============================================

// Webhook endpoint para recibir notificaciones de Mercado Libre
app.post('/webhook/notifications', async (req, res) => {
  try {
    logger.info('🔔 Webhook recibido de Mercado Libre');
    
    // Parsear el body
    let notification;
    try {
      notification = JSON.parse(req.body);
    } catch (parseError) {
      logger.error('❌ Error al parsear webhook:', parseError.message);
      return res.status(400).json({ error: 'Invalid JSON' });
    }

    logger.info('📦 Notificación recibida:', {
      topic: notification.topic,
      resource: notification.resource,
      user_id: notification.user_id,
      application_id: notification.application_id
    });

    // Procesar según el tipo de notificación
    await processWebhookNotification(notification);
    
    // Responder inmediatamente a ML
    res.status(200).json({ status: 'received' });
    
  } catch (error) {
    logger.error('❌ Error procesando webhook:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Función para procesar notificaciones webhook
async function processWebhookNotification(notification) {
  try {
    const { topic, resource, user_id } = notification;
    
    logger.info(`🔄 Procesando notificación: ${topic} - ${resource}`);
    
    switch (topic) {
      case 'items':
        await handleItemNotification(resource);
        break;
        
      case 'orders_v2':
        await handleOrderNotification(resource);
        break;
        
      case 'questions':
        await handleQuestionNotification(resource);
        break;
        
      case 'stock_locations':
        await handleStockLocationNotification(resource);
        break;
        
      case 'items_prices':
        await handleItemPriceNotification(resource);
        break;
        
      case 'fbm_stock_operations':
        await handleFbmStockNotification(resource);
        break;
        
      default:
        logger.info(`ℹ️ Tópico no manejado: ${topic}`);
    }
    
  } catch (error) {
    logger.error('❌ Error procesando notificación webhook:', error.message);
  }
}

// Manejar notificaciones de items (productos)
async function handleItemNotification(resource) {
  try {
    logger.info('📦 Procesando notificación de item:', resource);
    
    // Extraer item ID del resource
    const itemId = resource.split('/').pop();
    
    // Si estamos en modo mock, simular
    if (process.env.MOCK_ML_API === 'true') {
      logger.info('🎭 Modo mock: simulando procesamiento de item');
      return;
    }
    
    // Verificar si es uno de nuestros productos monitoreados
    const isMonitored = await stockMonitor.isItemMonitored(itemId);
    
    if (isMonitored) {
      logger.info(`✅ Item ${itemId} está siendo monitoreado, verificando cambios...`);
      
      // Forzar verificación inmediata de este producto específico
      await stockMonitor.checkSpecificItem(itemId);
      
      logger.info(`🔍 Verificación completada para item ${itemId}`);
    } else {
      logger.info(`ℹ️ Item ${itemId} no está en la lista de monitoreo`);
    }
    
  } catch (error) {
    logger.error('❌ Error manejando notificación de item:', error.message);
  }
}

// Manejar notificaciones de órdenes (ventas)
async function handleOrderNotification(resource) {
  try {
    logger.info('🛒 Procesando notificación de orden:', resource);
    
    if (process.env.MOCK_ML_API === 'true') {
      logger.info('🎭 Modo mock: simulando procesamiento de orden');
      return;
    }
    
    // Obtener detalles de la orden para ver qué productos fueron vendidos
    const accessToken = await auth.getAccessToken();
    
    const axios = require('axios');
    const response = await axios.get(`https://api.mercadolibre.com${resource}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    const order = response.data;
    
    // Verificar stock de items vendidos
    if (order.order_items && order.order_items.length > 0) {
      logger.info(`📦 Orden contiene ${order.order_items.length} items`);
      
      for (const item of order.order_items) {
        const itemId = item.item.id;
        const isMonitored = await stockMonitor.isItemMonitored(itemId);
        
        if (isMonitored) {
          logger.info(`🔍 Verificando stock post-venta para item ${itemId}`);
          await stockMonitor.checkSpecificItem(itemId);
        }
      }
    }
    
  } catch (error) {
    logger.error('❌ Error manejando notificación de orden:', error.message);
  }
}

// Manejar notificaciones de preguntas
async function handleQuestionNotification(resource) {
  try {
    logger.info('❓ Nueva pregunta recibida:', resource);
    
    // Log para debugging - en el futuro podrías responder automáticamente
    logger.info('💡 Funcionalidad futura: respuesta automática a preguntas');
    
  } catch (error) {
    logger.error('❌ Error manejando notificación de pregunta:', error.message);
  }
}

// Manejar notificaciones de stock locations
async function handleStockLocationNotification(resource) {
  try {
    logger.info('📍 Procesando notificación de stock location:', resource);
    
    if (process.env.MOCK_ML_API === 'true') {
      logger.info('🎭 Modo mock: simulando procesamiento de stock location');
      return;
    }
    
    // Forzar verificación completa ya que cambió el stock
    logger.info('🔄 Cambio en stock detectado, verificando todos los productos...');
    await stockMonitor.checkAllStock();
    
  } catch (error) {
    logger.error('❌ Error manejando notificación de stock location:', error.message);
  }
}

// Manejar notificaciones de precios
async function handleItemPriceNotification(resource) {
  try {
    logger.info('💰 Procesando notificación de cambio de precio:', resource);
    
    const itemId = resource.split('/').pop();
    logger.info(`💡 Precio cambiado para item ${itemId}`);
    
    // En el futuro podrías agregar lógica de alertas de precios
    
  } catch (error) {
    logger.error('❌ Error manejando notificación de precio:', error.message);
  }
}

// Manejar notificaciones de FBM stock operations
async function handleFbmStockNotification(resource) {
  try {
    logger.info('📦 Procesando notificación de FBM stock:', resource);
    
    if (process.env.MOCK_ML_API === 'true') {
      logger.info('🎭 Modo mock: simulando procesamiento de FBM stock');
      return;
    }
    
    // Verificar todos los productos ya que hubo operación de stock
    await stockMonitor.checkAllStock();
    
  } catch (error) {
    logger.error('❌ Error manejando notificación de FBM stock:', error.message);
  }
}

// Endpoint para verificar estado del webhook (útil para debugging)
app.get('/webhook/status', (req, res) => {
  res.json({
    message: 'Webhook endpoint funcionando',
    url: `${req.protocol}://${req.get('host')}/webhook/notifications`,
    timestamp: new Date().toISOString(),
    supported_topics: [
      'items',
      'orders_v2', 
      'questions',
      'stock_locations',
      'items_prices',
      'fbm_stock_operations'
    ]
  });
});

// ==============================================
// RUTAS DE DEBUG (para troubleshooting)
// ==============================================

// Debug de configuración ML
app.get('/debug/ml-config', (req, res) => {
  const config = {
    mockMode: process.env.MOCK_ML_API === 'true',
    clientId: process.env.ML_CLIENT_ID ? '***' + process.env.ML_CLIENT_ID.slice(-4) : 'NO_CONFIGURADO',
    clientSecret: process.env.ML_CLIENT_SECRET ? '***' + process.env.ML_CLIENT_SECRET.slice(-4) : 'NO_CONFIGURADO',
    redirectUri: process.env.ML_REDIRECT_URI,
    country: process.env.ML_COUNTRY || 'AR',
    apiBaseUrl: process.env.ML_API_BASE_URL || 'https://api.mercadolibre.com',
    authBaseUrl: process.env.ML_AUTH_BASE_URL || 'https://auth.mercadolibre.com.ar'
  };
  
  res.json({
    message: 'Configuración actual de ML',
    config,
    timestamp: new Date().toISOString()
  });
});

// Debug de autenticación
app.get('/debug/auth-status', (req, res) => {
  try {
    const isAuth = auth.isAuthenticated();
    const tokens = auth.tokens ? {
      hasAccessToken: !!auth.tokens.access_token,
      hasRefreshToken: !!auth.tokens.refresh_token,
      expiresAt: auth.tokens.expires_at,
      timeToExpiry: auth.tokens.expires_at ? auth.tokens.expires_at - Date.now() : null
    } : null;
    
    res.json({
      message: 'Estado de autenticación',
      authenticated: isAuth,
      tokens,
      mockMode: process.env.MOCK_ML_API === 'true',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      error: 'Error al verificar autenticación',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// ==============================================
// ERROR HANDLERS
// ==============================================

// Error handler
app.use((error, req, res, next) => {
  logger.error('Error no manejado:', error);
  res.status(500).json({
    error: 'Error interno del servidor',
    message: error.message,
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Ruta no encontrada',
    path: req.path,
    timestamp: new Date().toISOString()
  });
});

// ==============================================
// INICIALIZACIÓN DEL SERVIDOR
// ==============================================

// Solo iniciar el servidor si no estamos en Vercel
if (!process.env.VERCEL) {
  try {
    const server = app.listen(port, () => {
      const baseUrl = `http://localhost:${port}`;
      logger.info(`🚀 Servidor iniciado en ${baseUrl}`);
      logger.info(`🔗 URL para redirección OAuth: ${baseUrl}/auth/callback`);
      logger.info(`🎭 Modo Mock API: ${process.env.MOCK_ML_API === 'true' ? 'ACTIVADO' : 'DESACTIVADO'}`);
      
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
