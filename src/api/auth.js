const axios = require('axios');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const storage = require('../utils/storage');
const sessionManager = require('../utils/sessionManager');
const tokenManager = require('../utils/tokenManager');

class MercadoLibreAuth {
  constructor() {
    // Leer directamente desde variables de entorno
    this.clientId = process.env.ML_CLIENT_ID;
    this.clientSecret = process.env.ML_CLIENT_SECRET;
    this.redirectUri = process.env.ML_REDIRECT_URI;
    this.country = process.env.ML_COUNTRY || 'AR';
    
    // URLs base separadas para API y Auth según país
    this.baseUrls = this.getBaseUrlsByCountry(this.country);
    
    // MODIFICADO: En lugar de currentSessionId, usar cookieId del request
    this.currentCookieId = null; // Se establece en cada request
    
    // Detectar si estamos en modo mock
    this.mockMode = process.env.MOCK_ML_API === 'true' || 
                   !this.clientId || 
                   this.clientId === 'test_client_id' || 
                   this.clientId === '';
    
    if (this.mockMode) {
      logger.info('🎭 Auth en modo MOCK - usando API simulada');
      this.mockAPI = require('./mock-ml-api');
    } else {
      logger.info('🔐 Auth en modo REAL - usando API de Mercado Libre');
      logger.info(`🌍 País configurado: ${this.country}`);
      logger.info(`🔗 API Base URL: ${this.baseUrls.api}`);
      logger.info(`🔐 Auth Base URL: ${this.baseUrls.auth}`);
    }
  }

  /**
   * Obtener URLs base según país
   * @param {string} country - Código del país
   * @returns {Object} URLs base para API y Auth
   */
  getBaseUrlsByCountry(country) {
    const countryConfig = {
      'AR': { // Argentina
        api: 'https://api.mercadolibre.com',
        auth: 'https://auth.mercadolibre.com.ar',
        site: 'MLA'
      },
      'BR': { // Brasil
        api: 'https://api.mercadolibre.com',
        auth: 'https://auth.mercadolivre.com.br',
        site: 'MLB'
      },
      'MX': { // México
        api: 'https://api.mercadolibre.com',
        auth: 'https://auth.mercadolibre.com.mx',
        site: 'MLM'
      },
      'CO': { // Colombia
        api: 'https://api.mercadolibre.com',
        auth: 'https://auth.mercadolibre.com.co',
        site: 'MCO'
      },
      'CL': { // Chile
        api: 'https://api.mercadolibre.com',
        auth: 'https://auth.mercadolibre.cl',
        site: 'MLC'
      }
    };

    return countryConfig[country] || countryConfig['AR']; // Argentina por defecto
  }

  /**
   * NUEVO: Establecer cookieId para este request
   */
  setCurrentCookieId(cookieId) {
    this.currentCookieId = cookieId;
  }

  /**
   * MODIFICADO: Obtiene tokens desde la sesión del navegador actual
   */
  getCurrentTokens() {
    if (this.mockMode) {
      return { 
        access_token: 'mock-access-token',
        refresh_token: 'mock-refresh-token',
        expires_at: Date.now() + 6 * 60 * 60 * 1000
      };
    }

    if (!this.currentCookieId) {
      return null;
    }

    const session = sessionManager.getSessionByCookie(this.currentCookieId);
    if (!session || !session.userId) {
      return null;
    }

    // NUEVO: Intentar obtener desde tokenManager primero
    const tokenManagerTokens = tokenManager.getTokens(session.userId);
    if (tokenManagerTokens) {
      logger.debug(`🔑 Tokens obtenidos desde tokenManager para usuario ${session.userId}`);
      
      // Sincronizar con la sesión si están desactualizados
      if (!session.tokens || session.tokens.access_token !== tokenManagerTokens.access_token) {
        session.tokens = tokenManagerTokens;
        logger.debug('🔄 Tokens sincronizados con sesión');
      }
      
      return tokenManagerTokens;
    }

    // Fallback: usar tokens de la sesión
    if (session.tokens) {
      logger.debug(`🔄 Tokens obtenidos desde sesión para usuario ${session.userId} (fallback)`);
      
      // Guardar en tokenManager para próxima vez
      const metadata = {
        cookieId: this.currentCookieId,
        userAgent: session.userAgent || 'unknown',
        sessionCreated: session.createdAt
      };
      tokenManager.saveTokens(session.userId, session.tokens, metadata);
    }
    
    return session.tokens || null;
  }

  /**
   * Propiedad tokens para compatibilidad (getter)
   */
  get tokens() {
    return this.getCurrentTokens();
  }

  /**
   * NUEVO: Obtener el ID del usuario actual
   */
  getCurrentUserId() {
    if (this.mockMode) {
      return 'mock_user_123';
    }

    if (!this.currentCookieId) {
      return null;
    }

    const session = sessionManager.getSessionByCookie(this.currentCookieId);
    return session ? session.userId : null;
  }

  /**
   * MANTENIDO: Carga los tokens desde el almacenamiento
   */
  loadTokens() {
    try {
      return storage.loadTokens();
    } catch (error) {
      logger.error(`Error al cargar tokens: ${error.message}`);
    }
    return null;
  }

  /**
   * MODIFICADO: Guarda los tokens en el almacenamiento y actualiza la sesión
   */
  saveTokens(tokens) {
    try {
      // NUEVO: Guardar en tokenManager por usuario
      if (this.currentCookieId) {
        const session = sessionManager.getSessionByCookie(this.currentCookieId);
        if (session && session.userId) {
          // Guardar en tokenManager con metadata de la sesión
          const metadata = {
            cookieId: this.currentCookieId,
            userAgent: session.userAgent || 'unknown',
            sessionCreated: session.createdAt
          };
          
          const success = tokenManager.saveTokens(session.userId, tokens, metadata);
          if (success) {
            logger.info(`🔑 Tokens guardados para usuario ${session.userId} (tokenManager)`);
          }
          
          // También actualizar en la sesión para compatibilidad
          session.tokens = tokens;
          logger.info('🔄 Tokens actualizados en sesión activa');
        } else {
          logger.warn('⚠️ No se encontró sesión válida para guardar tokens');
        }
      } else {
        logger.warn('⚠️ No hay cookieId activo para guardar tokens');
      }
      
      // Mantener compatibilidad con storage legacy (deprecado)
      storage.saveTokens(tokens);
      
      logger.info('Tokens guardados correctamente');
    } catch (error) {
      logger.error(`Error al guardar tokens: ${error.message}`);
      throw error;
    }
  }

  /**
   * MANTENIDO: Obtiene la URL de autorización para iniciar el flujo OAuth
   */
  getAuthUrl() {
    if (this.mockMode) {
      logger.info('🎭 Generando URL de auth en modo mock');
      return `/auth/callback?code=mock-auth-code-${Date.now()}`;
    }

    if (!this.clientId || !this.redirectUri) {
      throw new Error('Client ID y Redirect URI son requeridos para generar URL de autorización');
    }

    const authUrl = `${this.baseUrls.auth}/authorization?response_type=code&client_id=${this.clientId}&redirect_uri=${encodeURIComponent(this.redirectUri)}`;
    
    logger.info('🔐 URL de autorización generada');
    logger.info(`🌍 País: ${this.country}`);
    logger.info(`🔗 Auth URL: ${this.baseUrls.auth}/authorization`);
    
    return authUrl;
  }

  /**
   * MODIFICADO: Crear sesión con cookie específica
   */
  async getTokensFromCode(code, cookieId = null) {
    try {
      if (this.mockMode) {
        logger.info('🎭 Obteniendo tokens en modo MOCK');
        const tokens = await this.mockAPI.getTokensFromCode(code);
        
        // Crear sesión mock con cookie
        const mockUserId = 'mock_user_123';
        const newCookieId = sessionManager.createSession(mockUserId, tokens, cookieId);
        this.currentCookieId = newCookieId;
        
        this.saveTokens(tokens);
        return { tokens, cookieId: newCookieId };
      }

      logger.info('🔄 Intercambiando código por tokens...');
      
      const params = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code: code,
        redirect_uri: this.redirectUri
      });

      const response = await axios.post(`${this.baseUrls.api}/oauth/token`, params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 10000
      });

      logger.info('✅ Tokens obtenidos exitosamente');

      const tokens = {
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token,
        expires_at: Date.now() + response.data.expires_in * 1000
      };

      // Obtener info del usuario para la sesión
      const userInfo = await this.getUserInfoWithToken(tokens.access_token);
      const userId = userInfo.id.toString();

      // NUEVO: Validar que el usuario esté autorizado para usar la app
      if (!this.isUserAuthorized(userId, userInfo)) {
        logger.warn(`🚫 Acceso denegado para usuario ML: ${userId} (${userInfo.nickname})`);
        throw new Error(`UNAUTHORIZED_USER:${userId}:${userInfo.nickname}`);
      }

      // Crear sesión segura vinculada al usuario Y al navegador
      const newCookieId = sessionManager.createSession(userId, tokens, cookieId);
      this.currentCookieId = newCookieId;

      logger.info(`🔐 Sesión autorizada y creada para usuario ML: ${userId} (${userInfo.nickname}) en navegador ${newCookieId.substring(0, 8)}...`);

      this.saveTokens(tokens);
      return { tokens, cookieId: newCookieId };
    } catch (error) {
      logger.error(`❌ Error al obtener tokens: ${error.message}`);
      
      if (error.response) {
        logger.error('📄 Respuesta del servidor:', error.response.data);
        logger.error('🔢 Status Code:', error.response.status);
      }
      
      throw new Error(`Error en intercambio de tokens: ${error.message}`);
    }
  }

  /**
   * MODIFICADO: Refresca el token de acceso y actualiza la sesión
   */
  async refreshAccessToken() {
    const currentTokens = this.getCurrentTokens();
    
    if (!currentTokens || !currentTokens.refresh_token) {
      throw new Error('No hay refresh token disponible');
    }

    try {
      if (this.mockMode) {
        logger.info('🎭 Refrescando tokens en modo MOCK');
        const tokens = await this.mockAPI.refreshAccessToken(currentTokens.refresh_token);
        
        // Actualizar sesión mock
        if (this.currentCookieId) {
          const session = sessionManager.getSessionByCookie(this.currentCookieId);
          if (session) {
            session.tokens = tokens;
          }
        }
        
        this.saveTokens(tokens);
        return tokens;
      }

      logger.info('🔄 Refrescando token de acceso...');

      const params = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: currentTokens.refresh_token
      });

      const response = await axios.post(`${this.baseUrls.api}/oauth/token`, params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 10000
      });

      const tokens = {
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token || currentTokens.refresh_token,
        expires_at: Date.now() + response.data.expires_in * 1000
      };

      // Actualizar tokens en la sesión actual
      if (this.currentCookieId) {
        const session = sessionManager.getSessionByCookie(this.currentCookieId);
        if (session) {
          session.tokens = tokens;
        }
      }
      
      this.saveTokens(tokens);
      
      logger.info('✅ Token refrescado exitosamente');
      return tokens;
    } catch (error) {
      logger.error(`❌ Error al refrescar token: ${error.message}`);
      
      if (error.response) {
        logger.error('📄 Respuesta del servidor:', error.response.data);
      }
      
      throw error;
    }
  }

  /**
   * MODIFICADO: Obtiene un token de acceso válido usando sesión actual
   */
  async getAccessToken() {
    if (this.mockMode) {
      return 'mock-access-token';
    }

    const tokens = this.getCurrentTokens();
    if (!tokens || !tokens.access_token) {
      throw new Error('No se ha autenticado con Mercado Libre');
    }

    // Si el token está a punto de expirar (menos de 5 minutos), refrescarlo
    if (tokens.expires_at - Date.now() < 300000) {
      logger.info('Token expirado o a punto de expirar, refrescando...');
      try {
        await this.refreshAccessToken();
        const refreshedTokens = this.getCurrentTokens();
        return refreshedTokens.access_token;
      } catch (error) {
        logger.error('Error al refrescar token:', error.message);
        throw new Error('Token expirado y no se pudo refrescar. Usuario debe autenticarse nuevamente.');
      }
    }

    return tokens.access_token;
  }

  /**
   * MODIFICADO: Verificar autenticación basada en cookie
   */
  isAuthenticated() {
    if (this.mockMode) {
      return true;
    }
    
    if (!this.currentCookieId) {
      return false;
    }

    const session = sessionManager.getSessionByCookie(this.currentCookieId);
    if (!session) {
      this.currentCookieId = null;
      return false;
    }

    return Date.now() < session.tokens.expires_at;
  }

  /**
   * NUEVO: Obtener info de usuario con token específico
   */
  async getUserInfoWithToken(accessToken) {
    if (this.mockMode) {
      return {
        id: 'mock_user_123',
        nickname: 'USUARIO_MOCK',
        email: 'mock@example.com'
      };
    }

    try {
      const response = await axios.get(`${this.baseUrls.api}/users/me`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        },
        timeout: 10000
      });

      return response.data;
    } catch (error) {
      logger.error('❌ Error al obtener información del usuario:', error.message);
      throw error;
    }
  }

  /**
   * MODIFICADO: Obtiene información del usuario usando sesión actual
   */
  async getUserInfo() {
    if (this.mockMode) {
      return this.mockAPI.getUserInfo();
    }

    try {
      const accessToken = await this.getAccessToken();
      return await this.getUserInfoWithToken(accessToken);
    } catch (error) {
      logger.error('❌ Error al obtener información del usuario:', error.message);
      throw error;
    }
  }

  /**
   * NUEVO: Validar que la sesión actual pertenece al usuario correcto
   * CORREGIDO: No hacer llamadas HTTP para evitar logout por timeout durante scans
   */
  async validateCurrentSession() {
    if (this.mockMode) {
      return true;
    }

    if (!this.currentCookieId) {
      return false;
    }

    try {
      // CORREGIDO: Validar primero si la sesión existe en sessionManager (no requiere HTTP)
      const session = sessionManager.getSessionByCookie(this.currentCookieId);
      if (!session) {
        logger.warn('⚠️ Sesión no encontrada en sessionManager');
        return false;
      }

      // CORREGIDO: Solo validar con HTTP si hace más de 5 minutos que no se valida
      const now = Date.now();
      const lastValidation = session.lastValidation || 0;
      const fiveMinutes = 5 * 60 * 1000;
      
      if (now - lastValidation < fiveMinutes) {
        logger.debug('✅ Sesión validada recientemente, saltando validación HTTP');
        return true;
      }

      // CORREGIDO: Intentar validación HTTP, pero NO fallar si hay error (para evitar logout durante scans)
      try {
        const userInfo = await this.getUserInfo();
        const userId = userInfo.id.toString();
        
        const isValid = sessionManager.validateUserSession(this.currentCookieId, userId);
        if (isValid) {
          // Marcar como validada recientemente
          session.lastValidation = now;
          logger.debug('✅ Sesión validada exitosamente con API ML');
        }
        return isValid;
      } catch (httpError) {
        logger.warn(`⚠️ Error validando con API ML (manteniendo sesión): ${httpError.message}`);
        // CRÍTICO: NO desloguear por errores HTTP durante scans
        return true; // Mantener sesión activa si hay problemas de conectividad
      }
      
    } catch (error) {
      logger.error(`Error validando sesión: ${error.message}`);
      return false;
    }
  }

  /**
   * NUEVO: Obtener ID del usuario actual
   */
  async getCurrentUserId() {
    if (this.mockMode) {
      return 'mock_user_123';
    }

    if (!this.currentCookieId) {
      return null;
    }

    const session = sessionManager.getSessionByCookie(this.currentCookieId);
    return session ? session.userId : null;
  }

  /**
   * NUEVO: Obtener tokens directamente por userId (para webhooks)
   */
  getTokensByUserId(userId) {
    if (this.mockMode) {
      return { 
        access_token: 'mock-access-token',
        refresh_token: 'mock-refresh-token',
        expires_at: Date.now() + 6 * 60 * 60 * 1000
      };
    }

    if (!userId) {
      return null;
    }

    // Obtener tokens directamente del tokenManager
    const tokens = tokenManager.getTokens(userId);
    if (tokens) {
      logger.debug(`🔑 Tokens obtenidos para webhook - Usuario: ${userId}`);
      return tokens;
    }

    logger.warn(`⚠️ No hay tokens válidos para usuario ${userId} en webhook`);
    return null;
  }

  /**
   * NUEVO: Obtener access token para webhooks (sin cookies)
   */
  async getAccessTokenForWebhook(userId) {
    if (this.mockMode) {
      return 'mock-access-token';
    }

    const tokens = this.getTokensByUserId(userId);
    if (!tokens || !tokens.access_token) {
      throw new Error(`No hay tokens válidos para el usuario ${userId}`);
    }

    // Si el token está a punto de expirar, intentar refrescar
    if (tokens.expires_at && tokens.expires_at - Date.now() < 300000) {
      logger.info(`Token expirado para usuario ${userId}, intentando refrescar...`);
      try {
        // Temporalmente establecer usuario para refresh
        const originalCookieId = this.currentCookieId;
        
        // Crear sesión temporal para refresh
        const tempSession = sessionManager.createTemporarySession(userId, tokens);
        this.currentCookieId = tempSession.cookieId;
        
        await this.refreshAccessToken();
        const refreshedTokens = this.getTokensByUserId(userId);
        
        // Limpiar sesión temporal
        sessionManager.invalidateSession(tempSession.cookieId);
        this.currentCookieId = originalCookieId;
        
        return refreshedTokens.access_token;
      } catch (error) {
        logger.error(`Error refrescando token para usuario ${userId}: ${error.message}`);
        throw new Error(`Token expirado para usuario ${userId} y no se pudo refrescar`);
      }
    }

    return tokens.access_token;
  }

  /**
   * NUEVO: Obtener información de la sesión actual
   */
  getCurrentSessionInfo() {
    if (!this.currentCookieId) {
      return null;
    }

    return sessionManager.getSessionInfo(this.currentCookieId);
  }

  /**
   * MODIFICADO: Logout que invalida la sesión del navegador actual
   */
  logout() {
    if (this.currentCookieId) {
      sessionManager.invalidateSession(this.currentCookieId);
      this.currentCookieId = null;
    }
    
    try {
      storage.clearTokens();
      if (this.mockMode && this.mockAPI && typeof this.mockAPI.reset === 'function') {
        this.mockAPI.reset();
      }
      logger.info('👋 Sesión cerrada correctamente para este navegador');
    } catch (error) {
      logger.error(`Error al cerrar sesión: ${error.message}`);
    }
  }

  /**
   * NUEVO: Logout de TODAS las sesiones del usuario
   */
  async logoutAllSessions() {
    if (this.mockMode) {
      this.logout();
      return;
    }

    try {
      const userId = await this.getCurrentUserId();
      if (userId) {
        const count = sessionManager.invalidateAllUserSessions(userId);
        logger.info(`👋 ${count} sesiones cerradas para usuario ${userId}`);
      }
      
      this.currentCookieId = null;
      storage.clearTokens();
    } catch (error) {
      logger.error(`Error al cerrar todas las sesiones: ${error.message}`);
    }
  }

  /**
   * MANTENIDO: Alias para compatibilidad con código existente
   */
  get currentSessionId() {
    return this.currentCookieId;
  }

  set currentSessionId(value) {
    this.currentCookieId = value;
  }

  /**
   * NUEVO: Verificar si un usuario está autorizado para usar la aplicación
   */
  isUserAuthorized(userId, userInfo = null) {
    // En modo mock, siempre autorizar
    if (this.mockMode) {
      return true;
    }

    try {
      // Obtener usuarios autorizados desde variable de entorno de Vercel
      const allowedUsers = process.env.ALLOWED_ML_USERS;
      
      if (!allowedUsers) {
        logger.warn('⚠️ ALLOWED_ML_USERS no configurado - permitiendo acceso a todos (configura en Vercel)');
        return true; // Si no está configurado, permitir por seguridad de desarrollo
      }

      // Lista de user IDs separados por comas
      const allowedUserList = allowedUsers.split(',').map(id => id.trim());
      const isAuthorized = allowedUserList.includes(userId);

      if (isAuthorized) {
        logger.info(`✅ Usuario autorizado: ${userId} ${userInfo?.nickname ? `(${userInfo.nickname})` : ''}`);
      } else {
        logger.warn(`🚫 Usuario NO autorizado: ${userId} ${userInfo?.nickname ? `(${userInfo.nickname})` : ''}`);
        logger.info(`📋 Usuarios autorizados: ${allowedUserList.join(', ')}`);
      }

      return isAuthorized;
    } catch (error) {
      logger.error(`Error verificando autorización: ${error.message}`);
      return false; // En caso de error, denegar acceso
    }
  }
}

module.exports = new MercadoLibreAuth();