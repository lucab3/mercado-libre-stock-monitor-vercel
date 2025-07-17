/**
 * Middleware de autenticación para Express (no serverless)
 * Utiliza el servicio de base de datos para validar sesiones
 */

const databaseService = require('../services/databaseService');
const logger = require('../utils/logger');

/**
 * Middleware de autenticación para rutas de Express
 */
async function expressAuth(req, res, next) {
  try {
    // Extraer cookie de sesión
    const sessionCookie = req.cookies['ml-session'];
    
    logger.info(`🔐 EXPRESS AUTH:`, {
      path: req.path,
      method: req.method,
      hasCookie: !!sessionCookie,
      sessionCookie: sessionCookie ? sessionCookie.substring(0, 8) + '...' : null
    });
    
    if (!sessionCookie) {
      return res.status(401).json({
        error: 'No autenticado',
        message: 'Se requiere iniciar sesión para acceder a este recurso.',
        needsAuth: true
      });
    }

    // Validar sesión en base de datos
    const session = await databaseService.getUserSession(sessionCookie);
    
    if (!session) {
      // Limpiar cookie inválida
      res.clearCookie('ml-session', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/'
      });
      
      return res.status(401).json({
        error: 'Sesión inválida',
        message: 'Tu sesión ha expirado. Por favor, inicia sesión nuevamente.',
        needsAuth: true
      });
    }

    // Agregar datos de usuario al request
    req.user = {
      userId: session.userId,
      sessionId: sessionCookie,
      session: session
    };
    
    logger.info(`✅ EXPRESS AUTH SUCCESS: Usuario ${session.userId}`);
    next();

  } catch (error) {
    logger.error(`❌ ERROR en middleware Express auth: ${error.message}`);
    res.status(500).json({
      error: 'Error de autenticación',
      message: 'Error interno validando sesión. Inténtalo de nuevo.'
    });
  }
}

/**
 * Middleware condicional - solo aplica auth si está autenticado
 */
async function optionalAuth(req, res, next) {
  const sessionCookie = req.cookies['ml-session'];
  
  if (!sessionCookie) {
    // No hay cookie, continuar sin autenticación
    req.user = null;
    return next();
  }
  
  try {
    const session = await databaseService.getUserSession(sessionCookie);
    req.user = session ? {
      userId: session.userId,
      sessionId: sessionCookie,
      session: session
    } : null;
  } catch (error) {
    logger.error(`⚠️ Error en auth opcional: ${error.message}`);
    req.user = null;
  }
  
  next();
}

module.exports = {
  expressAuth,
  optionalAuth
};