/**
 * Middleware CORS seguro y configurable
 * Implementa política restrictiva de orígenes permitidos
 */

const logger = require('../utils/logger');

/**
 * Configuración de CORS segura
 */
const corsConfig = {
  // Orígenes permitidos (whitelist)
  allowedOrigins: [
    'https://mercado-libre-stock-monitor-vercel.vercel.app',
    'https://mercado-libre-stock-monitor.vercel.app',
    // Solo en desarrollo
    ...(process.env.NODE_ENV === 'development' ? [
      'http://localhost:3000',
      'http://localhost:5173',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:5173'
    ] : [])
  ],
  
  // Métodos HTTP permitidos
  allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD'],
  
  // Headers permitidos
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'Cookie',
    'X-Requested-With',
    'Accept',
    'Origin'
  ],
  
  // Headers expuestos al cliente
  exposedHeaders: [
    'X-Total-Count',
    'X-Rate-Limit-Remaining'
  ],
  
  // Permitir credentials (cookies)
  credentials: true,
  
  // Cache preflight por 24 horas
  maxAge: 86400,
  
  // Políticas de seguridad adicionales
  securityHeaders: {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()'
  }
};

/**
 * Middleware CORS para Express
 */
function corsMiddleware(req, res, next) {
  const origin = req.headers.origin;
  
  // Verificar origen
  if (origin && corsConfig.allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (!origin && process.env.NODE_ENV === 'development') {
    // Permitir requests sin origin en desarrollo (ej: Postman)
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  
  // Configurar headers CORS
  res.setHeader('Access-Control-Allow-Methods', corsConfig.allowedMethods.join(', '));
  res.setHeader('Access-Control-Allow-Headers', corsConfig.allowedHeaders.join(', '));
  res.setHeader('Access-Control-Expose-Headers', corsConfig.exposedHeaders.join(', '));
  res.setHeader('Access-Control-Allow-Credentials', corsConfig.credentials);
  res.setHeader('Access-Control-Max-Age', corsConfig.maxAge);
  
  // Headers de seguridad adicionales
  Object.entries(corsConfig.securityHeaders).forEach(([header, value]) => {
    res.setHeader(header, value);
  });
  
  // Log en desarrollo para debugging
  if (process.env.NODE_ENV === 'development') {
    logger.debug(`CORS: ${req.method} ${req.path} from ${origin || 'no-origin'}`);
  }
  
  // Manejar preflight OPTIONS
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  
  next();
}

/**
 * Configurador CORS para funciones serverless
 */
function configureCorsHeaders(req, res) {
  const origin = req.headers.origin;
  
  // Verificar origen
  if (origin && corsConfig.allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (!origin && process.env.NODE_ENV === 'development') {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  
  // Configurar headers CORS
  res.setHeader('Access-Control-Allow-Methods', corsConfig.allowedMethods.join(', '));
  res.setHeader('Access-Control-Allow-Headers', corsConfig.allowedHeaders.join(', '));
  res.setHeader('Access-Control-Expose-Headers', corsConfig.exposedHeaders.join(', '));
  res.setHeader('Access-Control-Allow-Credentials', corsConfig.credentials);
  res.setHeader('Access-Control-Max-Age', corsConfig.maxAge);
  
  // Headers de seguridad
  Object.entries(corsConfig.securityHeaders).forEach(([header, value]) => {
    res.setHeader(header, value);
  });
}

/**
 * Verificar si un origen está permitido
 */
function isOriginAllowed(origin) {
  if (!origin) {
    return process.env.NODE_ENV === 'development';
  }
  return corsConfig.allowedOrigins.includes(origin);
}

/**
 * Wrapper para endpoints serverless con CORS automático
 */
function withCors(handler) {
  return async (req, res) => {
    // Configurar CORS
    configureCorsHeaders(req, res);
    
    // Manejar preflight
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
    
    // Verificar origen
    const origin = req.headers.origin;
    if (origin && !isOriginAllowed(origin)) {
      logger.warn(`🚫 CORS: Origen no permitido: ${origin}`);
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Origin not allowed'
      });
    }
    
    // Ejecutar handler
    return await handler(req, res);
  };
}

module.exports = {
  corsMiddleware,
  configureCorsHeaders,
  withCors,
  isOriginAllowed,
  corsConfig
};