/**
 * Controlador de autenticación
 * Maneja toda la lógica de negocio relacionada con auth
 */

const auth = require('../api/auth');
const sessionManager = require('../utils/sessionManager');
const databaseService = require('../services/databaseService');
const logger = require('../utils/logger');
const path = require('path');

class AuthController {
  
  /**
   * Mostrar página de login (redirigir a React)
   */
  async showLogin(req, res) {
    try {
      // Redirigir al React frontend en lugar del HTML viejo
      res.redirect('/login');
    } catch (error) {
      logger.error(`Error redirigiendo a login: ${error.message}`);
      res.status(500).send('Error cargando página de login');
    }
  }

  /**
   * Redirigir a autorización de ML
   */
  async redirectToAuth(req, res) {
    try {
      logger.info('🚀 INICIANDO AUTORIZACIÓN - /auth/authorize llamado');
      
      if (auth.mockMode) {
        logger.info('🎭 Modo MOCK: Simulando autorización exitosa');
        
        // En modo mock, crear sesión directamente
        const mockUserId = '123456789';
        const cookieId = sessionManager.createSession(mockUserId, {
          access_token: 'mock_token_123',
          expires_at: Date.now() + (6 * 60 * 60 * 1000)
        });
        
        // Establecer cookie
        res.cookie('ml-session', cookieId, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          maxAge: 6 * 60 * 60 * 1000, // 6 horas
          sameSite: 'lax'
        });
        
        return res.redirect('/');
      }
      
      // Modo real: redirigir a ML
      const authUrl = auth.getAuthUrl();
      logger.info(`🔐 REDIRIGIENDO A ML: ${authUrl}`);
      res.redirect(authUrl);
      
    } catch (error) {
      logger.error(`❌ Error en redirección auth: ${error.message}`);
      res.status(500).json({ 
        error: 'Error iniciando autorización',
        message: error.message 
      });
    }
  }

  /**
   * Manejar callback de autorización de ML
   */
  async handleCallback(req, res) {
    try {
      logger.info('🔄 CALLBACK RECIBIDO - /auth/callback llamado');
      logger.info(`🔍 Query params: ${JSON.stringify(req.query)}`);
      
      const { code, error } = req.query;
      
      if (error) {
        logger.error(`❌ Error en callback OAuth: ${error}`);
        return res.redirect('/acceso-denegado');
      }
      
      if (!code) {
        logger.error('❌ No se recibió código de autorización');
        return res.redirect('/acceso-denegado');
      }
      
      logger.info(`🔄 Procesando callback con código: ${code.substring(0, 10)}...`);
      
      // Intercambiar código por tokens
      const tokens = await auth.getTokensFromCode(code);
      
      if (!tokens || !tokens.access_token) {
        logger.error('❌ No se pudieron obtener tokens válidos');
        return res.redirect('/acceso-denegado');
      }
      
      // Obtener información del usuario
      const userInfo = await auth.getUserInfoWithToken(tokens.access_token);
      
      if (!userInfo) {
        logger.error('❌ No se pudo obtener información del usuario');
        return res.redirect('/acceso-denegado');
      }
      
      const result = {
        success: true,
        tokens: tokens,
        user: userInfo
      };
      
      if (!result.success) {
        logger.error(`❌ Error en callback: ${result.error}`);
        return res.redirect('/acceso-denegado');
      }
      
      logger.info(`✅ Callback exitoso para usuario: ${result.user.id}`);
      
      // Crear sesión y cookie
      const cookieId = sessionManager.createSession(result.user.id, result.tokens, {
        userInfo: result.user
      });
      
      // Guardar sesión en BD para compatibilidad serverless
      await databaseService.createUserSession(
        cookieId, 
        result.user.id,
        req.ip,
        req.get('User-Agent')
      );
      
      // Establecer cookie
      res.cookie('ml-session', cookieId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 6 * 60 * 60 * 1000, // 6 horas
        sameSite: 'lax'
      });
      
      logger.info(`🔐 Sesión creada: ${cookieId.substring(0, 8)}... para usuario ${result.user.id}`);
      res.redirect('/');
      
    } catch (error) {
      logger.error(`❌ Error procesando callback: ${error.message}`);
      res.redirect('/acceso-denegado');
    }
  }

  /**
   * Cerrar sesión
   */
  async logout(req, res) {
    try {
      const sessionCookie = req.cookies['ml-session'];
      
      if (sessionCookie) {
        // Limpiar de memoria
        sessionManager.clearSession(sessionCookie);
        
        // Revocar en BD
        await databaseService.revokeUserSession(sessionCookie);
        
        logger.info(`🔓 Sesión cerrada: ${sessionCookie.substring(0, 8)}...`);
      }
      
      // Limpiar cookie
      res.clearCookie('ml-session', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/'
      });
      
      res.redirect('/auth/login');
      
    } catch (error) {
      logger.error(`Error en logout: ${error.message}`);
      res.status(500).json({ 
        error: 'Error cerrando sesión',
        message: error.message 
      });
    }
  }

  /**
   * Obtener estado de autenticación (API)
   */
  async getAuthStatus(req, res) {
    try {
      const isAuthenticated = !!req.user;
      
      if (isAuthenticated) {
        const session = sessionManager.getSession(req.user.sessionId);
        
        res.json({
          authenticated: true,
          user: {
            id: req.user.userId,
            sessionId: req.user.sessionId.substring(0, 8) + '...'
          },
          session: {
            createdAt: session?.createdAt,
            lastActivity: session?.lastActivity
          }
        });
      } else {
        res.json({
          authenticated: false,
          needsAuth: true
        });
      }
      
    } catch (error) {
      logger.error(`Error obteniendo estado auth: ${error.message}`);
      res.status(500).json({ 
        error: 'Error obteniendo estado',
        message: error.message 
      });
    }
  }

  /**
   * Mostrar página de acceso denegado
   */
  async showAccessDenied(req, res) {
    res.status(403).send(`
      <html>
        <head><title>Acceso Denegado</title></head>
        <body style="font-family: Arial; text-align: center; padding: 50px;">
          <h1>🚫 Acceso Denegado</h1>
          <p>No tienes permisos para acceder a esta aplicación.</p>
          <p>Contacta al administrador si crees que esto es un error.</p>
          <a href="/auth/login">Intentar de nuevo</a>
        </body>
      </html>
    `);
  }
}

module.exports = new AuthController();