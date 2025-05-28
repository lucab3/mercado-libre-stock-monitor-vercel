const axios = require('axios');
const fs = require('fs');
const path = require('path');
const config = require('../../config/config');
const logger = require('../utils/logger');
const storage = require('../utils/storage');

class MercadoLibreAuth {
  constructor() {
    this.clientId = config.mercadolibre.clientId;
    this.clientSecret = config.mercadolibre.clientSecret;
    this.redirectUri = config.mercadolibre.redirectUri;
    this.apiBaseUrl = config.mercadolibre.apiBaseUrl;
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
    }
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
   * @returns {string} URL de autorización
   */
  getAuthUrl() {
    if (this.mockMode) {
      // En modo mock, devolver una URL que simule el proceso
      return `/auth/callback?code=mock-auth-code-${Date.now()}`;
    }
    
    return `${this.apiBaseUrl}/authorization?response_type=code&client_id=${this.clientId}&redirect_uri=${encodeURIComponent(this.redirectUri)}`;
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

      // Modo real
      const response = await axios.post(`${this.apiBaseUrl}/oauth/token`, {
        grant_type: 'authorization_code',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        redirect_uri: this.redirectUri
      });

      const tokens = {
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token,
        expires_at: Date.now() + response.data.expires_in * 1000
      };

      this.tokens = tokens;
      this.saveTokens(tokens);
      return tokens;
    } catch (error) {
      logger.error(`Error al obtener tokens: ${error.message}`);
      throw error;
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

      // Modo real
      const response = await axios.post(`${this.apiBaseUrl}/oauth/token`, {
        grant_type: 'refresh_token',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: this.tokens.refresh_token
      });

      const tokens = {
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token,
        expires_at: Date.now() + response.data.expires_in * 1000
      };

      this.tokens = tokens;
      this.saveTokens(tokens);
      return tokens;
    } catch (error) {
      logger.error(`Error al refrescar token: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtiene un token de acceso válido, refrescándolo si es necesario
   * @returns {Promise<string>} Token de acceso válido
   */
  async getAccessToken() {
    if (!this.tokens) {
      throw new Error('No se ha autenticado con Mercado Libre');
    }

    // Si el token está a punto de expirar (menos de 5 minutos), refrescarlo
    if (this.tokens.expires_at - Date.now() < 300000) {
      logger.info('Token expirado o a punto de expirar, refrescando...');
      await this.refreshAccessToken();
    }

    return this.tokens.access_token;
  }

  /**
   * Verifica si el usuario está autenticado
   * @returns {boolean} true si está autenticado, false en caso contrario
   */
  isAuthenticated() {
    return this.tokens !== null && this.tokens.access_token !== undefined;
  }

  /**
   * Cierra la sesión y limpia los tokens
   */
  logout() {
    this.tokens = null;
    try {
      storage.clearTokens();
      if (this.mockMode) {
        this.mockAPI.reset();
      }
      logger.info('Sesión cerrada correctamente');
    } catch (error) {
      logger.error(`Error al cerrar sesión: ${error.message}`);
    }
  }
}

module.exports = new MercadoLibreAuth();