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