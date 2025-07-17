/**
 * Middleware de autenticación centralizado para archivos serverless de Vercel
 * Basado en la lógica que funciona en alerts.js pero centralizada
 * Compatible con funciones serverless independientes
 */

const databaseService = require('../services/databaseService');
const logger = require('../utils/logger');

/**
 * Parse cookies manually desde headers HTTP
 */
function parseCookies(cookieHeader) {
  const cookies = {};
  if (cookieHeader) {
    cookieHeader.split(';').forEach(cookie => {
      const [name, value] = cookie.trim().split('=');
      if (name && value) {
        cookies[name] = decodeURIComponent(value);
      }
    });
  }
  return cookies;
}

/**
 * Validar autenticación usando base de datos (compatible serverless)
 * Retorna objeto con resultado de validación
 */
async function validateAuth(req) {
  try {
    // 1. Extraer cookie de sesión
    const cookies = parseCookies(req.headers.cookie);
    const sessionCookie = cookies['ml-session'];
    
    logger.info(`🔐 SERVERLESS AUTH:`, {
      endpoint: req.url,
      method: req.method,
      hasCookie: !!req.headers.cookie,
      sessionCookie: sessionCookie ? sessionCookie.substring(0, 8) + '...' : null
    });
    
    if (!sessionCookie) {
      return {
        success: false,
        status: 401,
        response: {
          success: false,
          error: 'No hay sesión activa',
          message: 'Se requiere autenticación para acceder a este recurso.',
          needsAuth: true
        }
      };
    }

    // 2. Validar sesión en base de datos (compatible serverless)
    const session = await databaseService.getUserSession(sessionCookie);
    
    logger.info(`🔍 SESSION CHECK:`, {
      sessionCookie: sessionCookie.substring(0, 8) + '...',
      sessionFound: !!session,
      userId: session?.userId
    });
    
    if (!session) {
      return {
        success: false,
        status: 401,
        response: {
          success: false,
          error: 'Sesión inválida',
          message: 'Tu sesión ha expirado. Por favor, inicia sesión nuevamente.',
          needsAuth: true
        }
      };
    }

    // 3. Retornar resultado exitoso
    logger.info(`✅ AUTH SUCCESS: Usuario ${session.userId} autenticado`);
    return {
      success: true,
      userId: session.userId,
      sessionCookie: sessionCookie,
      sessionData: session
    };

  } catch (error) {
    logger.error(`❌ ERROR en autenticación serverless: ${error.message}`);
    return {
      success: false,
      status: 500,
      response: {
        success: false,
        error: 'Error de autenticación',
        message: 'Error interno validando sesión. Inténtalo de nuevo.'
      }
    };
  }
}

/**
 * Wrapper para archivos serverless de Vercel
 * Maneja la autenticación y ejecuta el handler si es válida
 */
async function withAuth(handler) {
  return async (req, res) => {
    // Configurar CORS para todos los endpoints
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cookie');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    // Manejar OPTIONS request
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    // Validar autenticación
    const authResult = await validateAuth(req);
    
    if (!authResult.success) {
      return res.status(authResult.status).json(authResult.response);
    }
    
    // Agregar datos de autenticación al request
    req.auth = {
      userId: authResult.userId,
      sessionCookie: authResult.sessionCookie,
      session: authResult.sessionData
    };
    
    // Ejecutar el handler original con autenticación válida
    return await handler(req, res);
  };
}

/**
 * Función directa para validar auth sin wrapper (para casos especiales)
 */
async function requireAuth(req, res) {
  const authResult = await validateAuth(req);
  
  if (!authResult.success) {
    res.status(authResult.status).json(authResult.response);
    return null;
  }
  
  return {
    userId: authResult.userId,
    sessionCookie: authResult.sessionCookie,
    session: authResult.sessionData
  };
}

module.exports = {
  validateAuth,
  withAuth,
  requireAuth,
  parseCookies
};