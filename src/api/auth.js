const axios = require('axios');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const storage = require('../utils/storage');
const sessionManager = require('../utils/sessionManager');

class MercadoLibreAuth {
  constructor() {
    // Leer directamente desde variables de entorno
    this.clientId = process.env.ML_CLIENT_ID;
    this.clientSecret = process.env.ML_CLIENT_SECRET;
    this.redirectUri = process.env.ML_REDIRECT_URI;
    this.country = process.env.ML_COUNTRY || 'AR';
    
    // URLs base separadas para API y Auth según país
    this.baseUrls = this.getBaseUrlsByCountry(this.country);
    
    // MODIFICADO: No usar this.tokens, usar sesiones
    this.currentSessionId = null; // Solo el ID de sesión actual
    
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
   * NUEVO: Obtiene tokens desde la sesión actual
   */
  getCurrentTokens() {
    if (this.mockMode) {
      return { 
        access_token: 'mock-access-token',
        refresh_token: 'mock-refresh-token',
        expires_at: Date.now() + 6 * 60 * 60 * 1000
      };
    }

    if (!this.currentSessionId) {
      return null;
    }

    const session = sessionManager.getSession(this.currentSessionId);
    return session ? session.tokens : null;
  }

  /**
   * NUEVO: Propiedad tokens para compatibilidad (getter)
   */
  get tokens() {
    return this.getCurrentTokens();
  }

  /**
   * Carga los tokens desde el almacenamiento
   * MODIFICADO: Intenta cargar sesión existente
   * @returns {Object|null} Objeto con tokens o null si no existe
   */
  loadTokens() {
    try {
      // En el nuevo sistema, esto no se usa directamente
      // pero mantenemos compatibilidad
      return storage.loadTokens();
    } catch (error) {
      logger.error(`Error al cargar tokens: ${error.message}`);
    }
    return null;
  }

  /**
   * Guarda los tokens en el almacenamiento
   * MODIFICADO: Actualiza la sesión actual
   * @param {Object} tokens - Objeto con los tokens
   */
  saveTokens(tokens) {
    try {
      // Mantener compatibilidad con storage
      storage.saveTokens(tokens);
      
      // Si hay sesión activa, actualizar tokens en la sesión
      if (this.currentSessionId) {
        const session = sessionManager.getSession(this.currentSessionId);
        if (session) {
          session.tokens = tokens;
          logger.info('🔄 Tokens actualizados en sesión activa');
        }
      }
      
      logger.info('Tokens guardados correctamente');
    } catch (error) {
      logger.error(`Error al guardar tokens: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtiene la URL de autorización para iniciar el flujo OAuth
   * @returns {string} URL de autorización
   */
  getAuthUrl() {
    if (this.mockMode) {
      // En modo mock, devolver una URL que simule el proceso
      logger.info('🎭 Generando URL de auth en modo mock');
      return `/auth/callback?code=mock-auth-code-${Date.now()}`;
    }

    if (!this.clientId || !this.redirectUri) {
      throw new Error('Client ID y Redirect URI son requeridos para generar URL de autorización');
    }

    // URL de autorización sin PKCE
    const authUrl = `${this.baseUrls.auth}/authorization?response_type=code&client_id=${this.clientId}&redirect_uri=${encodeURIComponent(this.redirectUri)}`;
    
    logger.info('🔐 URL de autorización generada');
    logger.info(`🌍 País: ${this.country}`);
    logger.info(`🔗 Auth URL: ${this.baseUrls.auth}/authorization`);
    
    return authUrl;
  }

  /**
   * Obtiene tokens a partir del código de autorización
   * MODIFICADO: Crea sesión segura después del OAuth
   * @param {string} code - Código de autorización
   * @returns {Promise<Object>} Objeto con los tokens
   */
  async getTokensFromCode(code) {
    try {
      if (this.mockMode) {
        logger.info('🎭 Obteniendo tokens en modo MOCK');
        const tokens = await this.mockAPI.getTokensFromCode(code);
        
        // Crear sesión mock
        const mockUserId = 'mock_user_123';
        this.currentSessionId = sessionManager.createSession(mockUserId, tokens);
        
        // Mantener compatibilidad
        this.saveTokens(tokens);
        return tokens;
      }

      logger.info('🔄 Intercambiando código por tokens...');
      
      // Crear datos como URLSearchParams (form data)
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

      // NUEVO: Obtener info del usuario para la sesión
      const userInfo = await this.getUserInfoWithToken(tokens.access_token);
      const userId = userInfo.id.toString();

      // NUEVO: Crear sesión segura vinculada al usuario
      this.currentSessionId = sessionManager.createSession(userId, tokens);

      logger.info(`🔐 Sesión creada para usuario ML: ${userId}`);

      // Mantener compatibilidad
      this.saveTokens(tokens);
      return tokens;
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
   * Refresca el token de acceso usando el refresh token
   * MODIFICADO: Actualiza la sesión actual
   * @returns {Promise<Object>} Objeto con los nuevos tokens
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
        if (this.currentSessionId) {
          const session = sessionManager.getSession(this.currentSessionId);
          if (session) {
            session.tokens = tokens;
          }
        }
        
        this.saveTokens(tokens);
        return tokens;
      }

      logger.info('🔄 Refrescando token de acceso...');

      // Crear datos como URLSearchParams (form data)
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

      // Actualizar tokens
      const tokens = {
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token || currentTokens.refresh_token,
        expires_at: Date.now() + response.data.expires_in * 1000
      };

      // Actualizar tokens en la sesión actual
      if (this.currentSessionId) {
        const session = sessionManager.getSession(this.currentSessionId);
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
   * Obtiene un token de acceso válido, refrescándolo si es necesario
   * MODIFICADO: Usa sesión actual
   * @returns {Promise<string>} Token de acceso válido
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
   * Verifica si el usuario está autenticado
   * MODIFICADO: Usa sesión actual
   * @returns {boolean} true si está autenticado, false en caso contrario
   */
  isAuthenticated() {
    if (this.mockMode) {
      return true; // En modo mock siempre está autenticado
    }
    
    if (!this.currentSessionId) {
      return false;
    }

    const session = sessionManager.getSession(this.currentSessionId);
    if (!session) {
      this.currentSessionId = null;
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
   * Obtiene información del usuario autenticado
   * MODIFICADO: Usa sesión actual
   * @returns {Promise<Object>} Información del usuario
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
   */
  async validateCurrentSession() {
    if (this.mockMode) {
      return true;
    }

    if (!this.currentSessionId) {
      return false;
    }

    try {
      const userInfo = await this.getUserInfo();
      const userId = userInfo.id.toString();
      
      return sessionManager.validateUserSession(this.currentSessionId, userId);
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

    if (!this.currentSessionId) {
      return null;
    }

    const session = sessionManager.getSession(this.currentSessionId);
    return session ? session.userId : null;
  }

  /**
   * NUEVO: Obtener información de la sesión actual
   */
  getCurrentSessionInfo() {
    if (!this.currentSessionId) {
      return null;
    }

    return sessionManager.getSessionInfo(this.currentSessionId);
  }

  /**
   * Cierra la sesión y limpia los tokens
   * MODIFICADO: Invalida la sesión
   */
  logout() {
    if (this.currentSessionId) {
      sessionManager.invalidateSession(this.currentSessionId);
      this.currentSessionId = null;
    }
    
    try {
      storage.clearTokens();
      if (this.mockMode && this.mockAPI && typeof this.mockAPI.reset === 'function') {
        this.mockAPI.reset();
      }
      logger.info('👋 Sesión cerrada correctamente');
    } catch (error) {
      logger.error(`Error al cerrar sesión: ${error.message}`);
    }
  }
}

module.exports = new MercadoLibreAuth();