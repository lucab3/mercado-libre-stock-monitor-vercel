/**
 * API Routes para administración
 * Rutas protegidas para funcionalidades administrativas
 */

const adminController = require('../controllers/adminController');
const { requireAdminAuth } = require('../middleware/adminAuth');
const logger = require('../utils/logger');

/**
 * Manejador principal de rutas de administración
 */
async function handleAdminRoutes(req, res) {
  const { method, url } = req;
  
  try {
    // Parsear la URL para obtener la ruta específica
    const urlPath = url.replace('/admin', '').split('?')[0] || '/';
    
    logger.debug(`🔐 Admin route: ${method} ${urlPath}`);

    // Rutas públicas (no requieren autenticación)
    if (method === 'GET' && urlPath === '/login') {
      return await adminController.showLoginPage(req, res);
    }
    
    if (method === 'POST' && urlPath === '/login') {
      return await adminController.processLogin(req, res);
    }

    // Aplicar middleware de autenticación para rutas protegidas
    requireAdminAuth(req, res, async () => {
      try {
        // Rutas protegidas
        switch (method) {
          case 'GET':
            switch (urlPath) {
              case '/':
              case '/dashboard':
                return await adminController.showDashboard(req, res);
              
              case '/logout':
                return await adminController.logout(req, res);
              
              case '/api/stats':
                return await adminController.getStats(req, res);
              
              case '/api/debug-sessions':
                return await adminController.debugSessions(req, res);
              
              case '/api/debug-revocation':
                return await adminController.debugRevocation(req, res);
              
              case '/api/test-session-validation':
                return await adminController.testSessionValidation(req, res);
              
              case '/api/debug-ip':
                const debugIP = require('./debug-ip');
                return debugIP(req, res);
              
              case '/api/sessions-with-ip':
                return await adminController.getActiveSessionsWithIP(req, res);
              
              case '/api/get-ips':
                // Endpoint temporal simplificado para obtener IPs
                try {
                  const databaseService = require('../services/databaseService');
                  const sessions = await databaseService.getAllActiveSessions();
                  
                  const ips = sessions.map(session => ({
                    ip: session.ip_address || 'No disponible',
                    userId: session.user_id,
                    createdAt: session.created_at
                  }));
                  
                  return res.json({
                    success: true,
                    ips: ips,
                    uniqueIPs: [...new Set(ips.map(s => s.ip))].filter(ip => ip !== 'No disponible')
                  });
                } catch (error) {
                  return res.json({ success: false, error: error.message });
                }
              
              case '/api/sessions-detailed':
                // Endpoint temporal con información detallada SIN validación admin
                try {
                  const databaseService = require('../services/databaseService');
                  const sessions = await databaseService.getAllActiveSessions();
                  
                  // Formatear datos igual que en adminController pero sin validación
                  const formattedSessions = sessions.map(session => {
                    const now = new Date();
                    const expiresAt = new Date(session.expires_at);
                    const lastUsed = new Date(session.last_used);
                    const timeSinceLastUse = Math.floor((now - lastUsed) / 1000 / 60);
                    
                    return {
                      sessionId: session.session_id,
                      sessionIdShort: session.session_id.substring(0, 8) + '...',
                      userId: session.user_id,
                      ipAddress: session.ip_address || 'No disponible',
                      userAgent: session.user_agent || 'No disponible',
                      userAgentShort: session.user_agent ? session.user_agent.substring(0, 50) + '...' : 'No disponible',
                      createdAt: session.created_at,
                      lastUsed: session.last_used,
                      lastUsedMinutes: timeSinceLastUse,
                      expiresAt: session.expires_at,
                      isExpiring: timeSinceLastUse > 25,
                      timeLeft: Math.max(0, Math.floor((expiresAt - now) / 1000 / 60))
                    };
                  });

                  // Estadísticas
                  const stats = {
                    totalSessions: formattedSessions.length,
                    uniqueUsers: [...new Set(formattedSessions.map(s => s.userId))].length,
                    uniqueIPs: [...new Set(formattedSessions.map(s => s.ipAddress).filter(ip => ip !== 'No disponible'))].length,
                    expiringSoon: formattedSessions.filter(s => s.isExpiring).length
                  };

                  // Agrupar por usuario
                  const sessionsByUser = {};
                  formattedSessions.forEach(session => {
                    if (!sessionsByUser[session.userId]) {
                      sessionsByUser[session.userId] = [];
                    }
                    sessionsByUser[session.userId].push(session);
                  });

                  return res.json({  
                    success: true,
                    sessions: formattedSessions,
                    sessionsByUser,
                    stats
                  });
                } catch (error) {
                  return res.json({ success: false, error: error.message });
                }
              
              default:
                return res.status(404).json({
                  success: false,
                  error: 'Ruta de administración no encontrada'
                });
            }
          
          case 'POST':
            switch (urlPath) {
              case '/api/revoke-sessions':
                return await adminController.revokeUserSessions(req, res);
              
              default:
                return res.status(404).json({
                  success: false,
                  error: 'Endpoint de administración no encontrado'
                });
            }
          
          default:
            return res.status(405).json({
              success: false,
              error: 'Método no permitido',
              allowedMethods: ['GET', 'POST']
            });
        }
      } catch (protectedError) {
        logger.error(`❌ Error en ruta protegida de admin: ${protectedError.message}`);
        res.status(500).json({
          success: false,
          error: 'Error interno del servidor'
        });
      }
    });

  } catch (error) {
    logger.error(`❌ Error en rutas de admin: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
}

module.exports = handleAdminRoutes;