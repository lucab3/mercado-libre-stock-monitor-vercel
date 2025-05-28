/**
 * Cliente de API de Mercado Libre con Rate Limiting integrado
 */

const axios = require('axios');
const rateLimiter = require('../utils/rateLimiter');
const logger = require('../utils/logger');

class MLAPIClient {
  constructor() {
    this.baseURL = 'https://api.mercadolibre.com';
    this.accessToken = null;
    
    // Configurar axios con interceptors
    this.axiosInstance = axios.create({
      baseURL: this.baseURL,
      timeout: 30000, // 30 segundos timeout
    });
    
    // Interceptor de requests
    this.axiosInstance.interceptors.request.use(
      (config) => {
        if (this.accessToken) {
          config.headers.Authorization = `Bearer ${this.accessToken}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );
    
    // Interceptor de responses para rate limiting
    this.axiosInstance.interceptors.response.use(
      (response) => {
        // Ajustar límites basado en headers de respuesta
        rateLimiter.adjustLimitsBasedOnResponse(response);
        return response;
      },
      (error) => {
        // Manejo especial de errores 429
        if (error.response && error.response.status === 429) {
          logger.error('🚨 Rate limit excedido por ML API');
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Configura el token de acceso
   */
  setAccessToken(token) {
    this.accessToken = token;
  }

  /**
   * Wrapper genérico para requests con rate limiting
   */
  async makeRequest(method, url, data = null, config = {}) {
    const requestFunction = async () => {
      const response = await this.axiosInstance({
        method,
        url,
        data,
        ...config
      });
      return response.data;
    };

    return await rateLimiter.safeRequest(requestFunction);
  }

  /**
   * GET con rate limiting
   */
  async get(url, config = {}) {
    return await this.makeRequest('GET', url, null, config);
  }

  /**
   * POST con rate limiting
   */
  async post(url, data, config = {}) {
    return await this.makeRequest('POST', url, data, config);
  }

  /**
   * PUT con rate limiting
   */
  async put(url, data, config = {}) {
    return await this.makeRequest('PUT', url, data, config);
  }

  /**
   * DELETE con rate limiting
   */
  async delete(url, config = {}) {
    return await this.makeRequest('DELETE', url, null, config);
  }

  /**
   * Obtener información del usuario
   */
  async getUser() {
    logger.info('🔍 Obteniendo información del usuario');
    return await this.get('/users/me');
  }

  /**
   * Obtener productos del usuario con rate limiting inteligente
   */
  async getUserProducts(userId, options = {}) {
    const { offset = 0, limit = 50, status = 'active' } = options;
    
    logger.info(`🔍 Obteniendo productos del usuario ${userId} (offset: ${offset}, limit: ${limit})`);
    
    // Verificar si está cerca del límite antes de hacer múltiples requests
    if (rateLimiter.isNearLimit()) {
      logger.warn('⚠️ Cerca del rate limit - usando cola de requests');
      return await rateLimiter.queueRequest(
        () => this.get(`/users/${userId}/items/search`, {
          params: { offset, limit, status }
        })
      );
    }
    
    return await this.get(`/users/${userId}/items/search`, {
      params: { offset, limit, status }
    });
  }

  /**
   * Obtener detalles de un producto
   */
  async getProduct(productId) {
    logger.debug(`🔍 Obteniendo producto ${productId}`);
    return await this.get(`/items/${productId}`);
  }

  /**
   * Obtener múltiples productos en lote (más eficiente)
   */
  async getMultipleProducts(productIds, attributes = null) {
    if (productIds.length === 0) return [];
    
    // ML permite hasta 20 IDs por multiget
    const chunks = this.chunkArray(productIds, 20);
    const results = [];
    
    logger.info(`🔍 Obteniendo ${productIds.length} productos en ${chunks.length} lotes`);
    
    for (const chunk of chunks) {
      const params = { ids: chunk.join(',') };
      if (attributes) {
        params.attributes = attributes.join(',');
      }
      
      try {
        const response = await this.get('/items', { params });
        
        // Procesar respuesta de multiget
        if (Array.isArray(response)) {
          const validProducts = response
            .filter(item => item.code === 200)
            .map(item => item.body);
          results.push(...validProducts);
        }
      } catch (error) {
        logger.error(`Error obteniendo lote de productos: ${error.message}`);
        // Continuar con el siguiente lote
      }
      
      // Pausa entre lotes para no saturar
      if (chunks.length > 1) {
        await rateLimiter.sleep(100);
      }
    }
    
    logger.info(`✅ Obtenidos ${results.length}/${productIds.length} productos exitosamente`);
    return results;
  }

  /**
   * Actualizar stock de un producto
   */
  async updateProductStock(productId, quantity) {
    logger.info(`📝 Actualizando stock de ${productId} a ${quantity} unidades`);
    
    return await this.put(`/items/${productId}`, {
      available_quantity: quantity
    });
  }

  /**
   * Búsqueda con rate limiting
   */
  async search(params = {}) {
    logger.info(`🔍 Realizando búsqueda con parámetros:`, params);
    
    const siteId = params.site_id || 'MLM';
    delete params.site_id;
    
    return await this.get(`/sites/${siteId}/search`, { params });
  }

  /**
   * Obtener estadísticas del rate limiter
   */
  getRateLimitStats() {
    return rateLimiter.getStats();
  }

  /**
   * Verificar estado del rate limiter
   */
  isNearRateLimit() {
    return rateLimiter.isNearLimit();
  }

  /**
   * Pausar requests temporalmente
   */
  async pauseRequests(seconds) {
    logger.info(`⏸️ Pausando requests por ${seconds} segundos`);
    await rateLimiter.sleep(seconds * 1000);
  }

  /**
   * Procesar requests en lotes con control de velocidad
   */
  async processBatch(items, processor, batchSize = 10) {
    const batches = this.chunkArray(items, batchSize);
    const results = [];
    
    logger.info(`🔄 Procesando ${items.length} items en ${batches.length} lotes de ${batchSize}`);
    
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      
      logger.info(`📦 Procesando lote ${i + 1}/${batches.length} (${batch.length} items)`);
      
      // Verificar rate limit antes de cada lote
      const stats = rateLimiter.getStats();
      if (stats.isNearLimit) {
        logger.warn('⚠️ Cerca del rate limit - esperando antes del siguiente lote');
        await rateLimiter.sleep(2000);
      }
      
      try {
        // Procesar lote actual
        const batchResults = await Promise.all(
          batch.map(item => processor(item))
        );
        results.push(...batchResults.filter(r => r !== null));
        
        // Pausa entre lotes
        if (i < batches.length - 1) {
          await rateLimiter.sleep(200);
        }
        
      } catch (error) {
        logger.error(`Error en lote ${i + 1}: ${error.message}`);
        // Continuar con el siguiente lote
      }
    }
    
    logger.info(`✅ Procesamiento completado: ${results.length}/${items.length} exitosos`);
    return results;
  }

  /**
   * Función auxiliar para dividir arrays en chunks
   */
  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Health check del cliente API
   */
  async healthCheck() {
    try {
      const stats = this.getRateLimitStats();
      const response = await this.get('/sites/MLM');
      
      return {
        status: 'OK',
        apiResponse: !!response,
        rateLimitStats: stats,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'ERROR',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

// Exportar instancia singleton
const mlApiClient = new MLAPIClient();

module.exports = mlApiClient;