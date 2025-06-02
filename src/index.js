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
const config = require('../config/config');
const logger = require('./utils/logger');
const auth = require('./api/auth');
const stockMonitor = require('./services/stockMonitor');

// Inicialización de la aplicación Express
const app = express();
const port = process.env.PORT || config.app.port;

logger.info('🚀 Iniciando aplicación Monitor de Stock ML...');
logger.info(`📊 Puerto configurado: ${port}`);
logger.info(`🌍 Entorno: ${process.env.NODE_ENV || 'development'}`);
logger.info(`🎭 Mock API: ${process.env.MOCK_ML_API === 'true' ? 'ACTIVADO' : 'DESACTIVADO'}`);

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

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

// Callback de autenticación
app.get('/auth/callback', async (req, res) => {
const { code } = req.query;

if (!code) {
return res.status(400).send('Error: No se recibió el código de autorización');
}

try {
await auth.getTokensFromCode(code);

// Iniciar el monitoreo automáticamente después de la autenticación
try {
await stockMonitor.start();
logger.info('✅ Monitoreo iniciado después de autenticación exitosa');
} catch (monitorError) {
logger.error(`❌ Error al iniciar monitoreo: ${monitorError.message}`);
}

res.redirect('/');
} catch (error) {
logger.error(`❌ Error en el callback de autenticación: ${error.message}`);
res.status(500).send('Error durante la autenticación: ' + error.message);
}
});

// Ruta para cerrar sesión
app.get('/auth/logout', (req, res) => {
try {
auth.logout();
stockMonitor.stop();
logger.info('🚪 Sesión cerrada correctamente');
res.redirect('/');
} catch (error) {
logger.error(`Error al cerrar sesión: ${error.message}`);
res.status(500).send('Error al cerrar sesión: ' + error.message);
}
});

// API para verificar el estado de autenticación y monitoreo
// MEJORADO: Incluye datos sincronizados en tiempo real
app.get('/api/auth/status', async (req, res) => {
try {
const monitorStatus = stockMonitor.getStatus();

// NUEVO: Si hay actividad reciente, incluir debug info
if (process.env.NODE_ENV === 'development') {
stockMonitor.debugCurrentState();
}

res.json({ 
authenticated: auth.isAuthenticated(),
monitoring: {
...monitorStatus,
// Incluir timestamp de respuesta para debug
responseTime: Date.now()
},
mockMode: process.env.MOCK_ML_API === 'true',
lastSyncTime: new Date().toISOString()
});
} catch (error) {
logger.error(`Error en /api/auth/status: ${error.message}`);
res.status(500).json({ 
error: 'Error al obtener estado',
authenticated: auth.isAuthenticated(),
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
// MEJORADO: Respuesta más detallada
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
// COMPLETAMENTE RENOVADO: Datos consistentes y sincronizados
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
dynamicStock: true
}
});
});

// Ruta de verificación de estado para Vercel
app.get('/health', (req, res) => {
try {
const status = stockMonitor.getStatus();
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
// Agregar estos endpoints a tu src/index.js

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
// Agregar este middleware ANTES de tus rutas de API

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
// En Vercel, la aplicación se ejecuta como una función serverless
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
  // AGREGAR ESTO: En Vercel, solo logear que está ejecutando
logger.info('🔧 Ejecutando en modo Vercel serverless');
  logger.info(`🎭 Modo Mock API: ${process.env.MOCK_ML_API === 'true' ? 'ACTIVADO' : 'DESACTIVADO'}`);
}

// Exportar la aplicación para Vercel
module.exports = app;

// Manejo de errores no capturados
process.on('uncaughtException', (error) => {
logger.error(`❌ Error no capturado: ${error.message}`, { stack: error.stack });
  process.exit(1);
  if (!process.env.VERCEL) {
    process.exit(1);
  }
});

process.on('unhandledRejection', (reason, promise) => {
logger.error('❌ Rechazo de promesa no manejado', { reason });
  process.exit(1);
});
  if (!process.env.VERCEL) {
    process.exit(1);
  }
});
// Debug de configuración ML
app.get('/debug/ml-config', (req, res) => {
  const config = {
    mockMode: process.env.MOCK_ML_API === 'true',
    clientId: process.env.ML_CLIENT_ID ? '***' + process.env.ML_CLIENT_ID.slice(-4) : 'NO_CONFIGURADO',
    clientSecret: process.env.ML_CLIENT_SECRET ? '***' + process.env.ML_CLIENT_SECRET.slice(-4) : 'NO_CONFIGURADO',
    redirectUri: process.env.ML_REDIRECT_URI,
    country: process.env.ML_COUNTRY || 'AR'
  };
  
  res.json({
    message: 'Configuración actual de ML',
    config,
    timestamp: new Date().toISOString()
  });
});

// Webhook endpoint básico (para ML)
app.post('/webhook/notifications', express.raw({ type: 'application/json' }), (req, res) => {
  console.log('🔔 Webhook recibido de ML');
  res.status(200).json({ status: 'received' });
});

// Estado del webhook
app.get('/webhook/status', (req, res) => {
  res.json({
    message: 'Webhook endpoint funcionando',
    url: `${req.protocol}://${req.get('host')}/webhook/notifications`,
    timestamp: new Date().toISOString()
  });
});
