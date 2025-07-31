/**
 * Middleware de autenticación para administradores
 */

const adminService = require('../services/adminService');
const logger = require('../utils/logger');

/**
 * Middleware para verificar autenticación de administrador
 */
function requireAdminAuth(req, res, next) {
  // Verificar si el sistema admin está habilitado
  if (!adminService.isAdminEnabled()) {
    return res.status(404).json({
      success: false,
      error: 'Sistema de administración no disponible'
    });
  }

  // Extraer token de administrador de cookies o header
  const adminToken = req.cookies?.['admin-session'] || 
                     req.headers['x-admin-session'] ||
                     req.headers.authorization?.replace('Bearer ', '');

  if (!adminToken) {
    return res.status(401).json({
      success: false,
      error: 'Token de administrador requerido',
      needsAuth: true
    });
  }

  // Validar sesión
  const session = adminService.validateAdminSession(adminToken);
  if (!session) {
    return res.status(401).json({
      success: false,
      error: 'Sesión de administrador inválida o expirada',
      needsAuth: true
    });
  }

  // Agregar información de admin a request
  req.admin = {
    sessionId: session.sessionId,
    username: session.username,
    session: session
  };

  logger.debug(`✅ Admin autenticado: ${session.username}`);
  next();
}

/**
 * Middleware opcional - solo verificar si hay sesión admin válida
 */
function optionalAdminAuth(req, res, next) {
  if (!adminService.isAdminEnabled()) {
    req.admin = null;
    return next();
  }

  const adminToken = req.cookies?.['admin-session'] || 
                     req.headers['x-admin-session'];

  if (adminToken) {
    const session = adminService.validateAdminSession(adminToken);
    if (session) {
      req.admin = {
        sessionId: session.sessionId,
        username: session.username,
        session: session
      };
    }
  }

  req.admin = req.admin || null;
  next();
}

module.exports = {
  requireAdminAuth,
  optionalAdminAuth
};