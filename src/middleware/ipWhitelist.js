const { getRealClientIP, isIPAllowed, getAllowedIPs } = require('../utils/ipHelper');
const logger = require('../utils/logger');

/**
 * Middleware para validar IPs permitidas
 */
function ipWhitelistMiddleware(req, res, next) {
  try {
    const clientIP = getRealClientIP(req);
    const allowedIPs = getAllowedIPs();
    
    // Si no hay restricciones de IP, continuar
    if (allowedIPs.length === 0) {
      return next();
    }

    // Validar si la IP está permitida
    if (isIPAllowed(clientIP, allowedIPs)) {
      logger.info(`✅ IP permitida: ${clientIP}`);
      return next();
    }

    // IP no permitida
    logger.warn(`🚫 IP bloqueada: ${clientIP} - No está en la lista de IPs permitidas`);
    
    return res.status(403).json({
      success: false,
      error: 'Acceso denegado: IP no autorizada',
      blocked: true,
      clientIP: clientIP
    });

  } catch (error) {
    logger.error(`❌ Error en middleware IP whitelist: ${error.message}`);
    // En caso de error, permitir el acceso
    return next();
  }
}

module.exports = {
  ipWhitelistMiddleware
};