/**
 * Endpoint temporal para debug de IPs
 */

const logger = require('../utils/logger');

module.exports = (req, res) => {
  try {
    const debugInfo = {
      // Request IP methods
      reqIp: req.ip,
      connectionRemoteAddress: req.connection?.remoteAddress,
      socketRemoteAddress: req.socket?.remoteAddress,
      
      // Headers relacionados con IP
      headers: {
        'x-forwarded-for': req.headers['x-forwarded-for'],
        'x-real-ip': req.headers['x-real-ip'],
        'x-client-ip': req.headers['x-client-ip'],
        'cf-connecting-ip': req.headers['cf-connecting-ip'],
        'x-cluster-client-ip': req.headers['x-cluster-client-ip'],
        'x-forwarded': req.headers['x-forwarded'],
        'forwarded-for': req.headers['forwarded-for'],
        'forwarded': req.headers['forwarded']
      },
      
      // Información adicional
      userAgent: req.get('User-Agent'),
      host: req.get('Host'),
      protocol: req.protocol,
      secure: req.secure,
      originalUrl: req.originalUrl
    };

    logger.info(`🔍 Debug IP info: ${JSON.stringify(debugInfo, null, 2)}`);

    res.json({
      success: true,
      debugInfo,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error(`❌ Error en debug-ip: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};