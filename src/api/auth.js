const axios = require('axios');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const storage = require('../utils/storage');

class MercadoLibreAuth {
  constructor() {
    // Leer directamente desde variables de entorno
    this.clientId = process.env.ML_CLIENT_ID;
    this.clientSecret = process.env.ML_CLIENT_SECRET;
    this.redirectUri = process.env.ML_REDIRECT_URI;
    this.country = process.env.ML_COUNTRY || 'AR';
    
    // NUEVO: URLs base separadas para API y Auth según país
    this.baseUrls = this.getBaseUrlsByCountry(this.country);
    
    this.tokens = this.loadTokens();
    
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
   * NUEVO: Obtener URLs base según país
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
      },
      'UY': { // Uruguay
        api: 'https://api.mercadolibre.com',
        auth: 'https://auth.mercadolibre.com.uy',
        site: 'MLU'
      },
      'PE': { // Perú
        api: 'https://api.mercadolibre.com',
        auth: 'https://auth.mercadolibre.com.pe',
        site: 'MPE'
      },
      'VE': { // Venezuela
        api: 'https://api.mercadolibre.com',
        auth: 'https://auth.mercadolibre.com.ve',
        site: 'MLV'
      },
      'EC': { // Ecuador
        api: 'https://api.mercadolibre.com',
        auth: 'https://auth.mercadolibre.com.ec',
        site: 'MEC'
      }
    };

    return countryConfig[country] || countryConfig['AR']; // Argentina por defecto
  }

  /**
   * Carga los tokens desde el almacenamiento
   * @returns {Object|null} Objeto con tokens o null si no existe
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
   * Guarda los tokens en el almacenamiento
   * @param {Object} tokens - Objeto con los tokens
   */
  saveTokens(tokens) {
    try {
      storage.saveTokens(tokens);
      logger.info('Tokens guardados correctamente');
    } catch (error) {
      logger.error(`Error al guardar tokens: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtiene la URL de autorización para iniciar el flujo OAuth
   * CORREGIDO: Usa URL de auth correcta según país
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

    // CORREGIDO: Usar URL de auth correcta según país
    const authUrl = `${this.baseUrls.auth}/authorization?response_type=code&client_id=${this.clientId}&redirect_uri=${encodeURIComponent(this.redirectUri)}`;
    
    logger.info('🔐 URL de autorización generada');
    logger.info(`🌍 País: ${this.country}`);
    logger.info(`🔗 Auth URL: ${this.baseUrls.auth}/authorization`);
    
    return authUrl;
  }

  /**
   * Obtiene tokens a partir del código de autorización
   * @param {string} code - Código de autorización
   * @returns {Promise<Object>} Objeto con los tokens
   */
  async getTokensFromCode(code) {
    try {
      if (this.mockMode) {
        logger.info('🎭 Obteniendo tokens en modo MOCK');
        const tokens = await this.mockAPI.getTokensFromCode(code);
        this.tokens = tokens;
        this.saveTokens(tokens);
        return tokens;
      }

      logger.info('🔄 Intercambiando código por tokens...');
      
      // CORREGIDO: Usar URL de API (no auth) para token exchange
      const response = await axios.post(`${this.baseUrls.api}/oauth/token`, {
        grant_type: 'authorization_code',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        redirect_uri: this.redirectUri
      }, {
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

      this.tokens = tokens;
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
   * @returns {Promise<Object>} Objeto con los nuevos tokens
   */
  async refreshAccessToken() {
    if (!this.tokens || !this.tokens.refresh_token) {
      throw new Error('No hay refresh token disponible');
    }

    try {
      if (this.mockMode) {
        logger.info('🎭 Refrescando tokens en modo MOCK');
        const tokens = await this.mockAPI.refreshAccessToken(this.tokens.refresh_token);
        this.tokens = tokens;
        this.saveTokens(tokens);
        return tokens;
      }

      logger.info('🔄 Refrescando token de acceso...');

      // CORREGIDO: Usar URL de API para refresh token
      const response = await axios.post(`${this.baseUrls.api}/oauth/token`, {
        grant_type: 'refresh_token',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: this.tokens.refresh_token
      }, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 10000
      });

      // Actualizar tokens
      const tokens = {
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token || this.tokens.refresh_token,
        expires_at: Date.now() + response.data.expires_in * 1000
      };

      this.tokens = tokens;
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
   * @returns {Promise<string>} Token de acceso válido
   */
  async getAccessToken() {
    if (this.mockMode) {
      return 'mock-access-token';
    }

    if (!this.tokens || !this.tokens.access_token) {
      throw new Error('No se ha autenticado con Mercado Libre');
    }

    // Si el token está a punto de expirar (menos de 5 minutos), refrescarlo
    if (this.tokens.expires_at - Date.now() < 300000) {
      logger.info('Token expirado o a punto de expirar, refrescando...');
      try {
        await this.refreshAccessToken();
      } catch (error) {
        logger.error('Error al refrescar token:', error.message);
        throw new Error('Token expirado y no se pudo refrescar. Usuario debe autenticarse nuevamente.');
      }
    }

    return this.tokens.access_token;
  }

  /**
   * Verifica si el usuario está autenticado
   * @returns {boolean} true si está autenticado, false en caso contrario
   */
  isAuthenticated() {
    if (this.mockMode) {
      return true; // En modo mock siempre está autenticado
    }
    
    return this.tokens !== null && 
           this.tokens.access_token !== undefined && 
           Date.now() < this.tokens.expires_at;
  }

  /**
   * Obtiene información del usuario autenticado
   * @returns {Promise<Object>} Información del usuario
   */
  async getUserInfo() {
    if (this.mockMode) {
      return this.mockAPI.getUserInfo();
    }

    try {
      const accessToken = await this.getAccessToken();
      
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
   * Cierra la sesión y limpia los tokens
   */
  logout() {
    this.tokens = null;
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