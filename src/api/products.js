/**
 * Servicio de productos con Rate Limiting integrado
 */

const mlApiClient = require('./ml-api-client');
const auth = require('./auth');
const logger = require('../utils/logger');
const config = require('../../config/config');

class ProductsService {
  constructor() {
    this.mockMode = process.env.MOCK_ML_API === 'true';
    this.mockAPI = null;
    
    if (this.mockMode) {
      this.mockAPI = require('./mock-ml-api');
      logger.info('🎭 Products Service en modo MOCK con rate limiting simulado');
    }
  }

  /**
   * Configura el token de acceso en el cliente API
   */
  setAccessToken(token) {
    if (!this.mockMode) {
      mlApiClient.setAccessToken(token);
    }
  }

  /**
   * Obtiene todos los productos del usuario con rate limiting inteligente
   */
  async getAllProducts() {
    if (this.mockMode) {
      return this.mockAPI.getUserProducts('mock_user').then(response => response.results);
    }

    try {
      // Configurar token automáticamente
      const tokens = auth.getTokens();
      if (tokens) {
        this.setAccessToken(tokens.access_token);
      }

      const user = await mlApiClient.getUser();
      logger.info(`👤 Obteniendo productos para usuario: ${user.nickname}`);
      
      const allProducts = [];
      let offset = 0;
      const limit = 50; // Lotes de 50 productos
      
      // Verificar rate limit antes de comenzar
      const stats = mlApiClient.getRateLimitStats();
      logger.info(`📊 Rate Limit Status: ${stats.currentRequests}/${stats.maxRequests} (${stats.utilizationPercent}%)`);
      
      while (true) {
        // Obtener lote de productos con rate limiting
        const response = await mlApiClient.getUserProducts(user.id, {
          offset,
          limit,
          status: 'active'
        });
        
        if (!response.results || response.results.length === 0) {
          break;
        }
        
        allProducts.push(...response.results);
        logger.info(`📦 Obtenidos ${allProducts.length}/${response.paging.total} productos`);
        
        // Si obtuvimos menos productos de los solicitados, es el último lote
        if (response.results.length < limit) {
          break;
        }
        
        offset += limit;
        
        // Pausa entre lotes si estamos cerca del rate limit
        if (mlApiClient.isNearRateLimit()) {
          logger.info('⏳ Pausando entre lotes para evitar rate limit');
          await mlApiClient.pauseRequests(2);
        }
      }
      
      logger.info(`✅ Total productos obtenidos: ${allProducts.length}`);
      return allProducts;
      
    } catch (error) {
      logger.error(`❌ Error obteniendo productos: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtiene un producto específico con rate limiting
   */
  async getProduct(productId) {
    if (this.mockMode) {
      return this.mockAPI.getProduct(productId);
    }

    try {
      const tokens = auth.getTokens();
      if (tokens) {
        this.setAccessToken(tokens.access_token);
      }

      logger.debug(`🔍 Obteniendo producto ${productId} con rate limiting`);
      return await mlApiClient.getProduct(productId);
      
    } catch (error) {
      logger.error(`❌ Error obteniendo producto ${productId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtiene múltiples productos de forma eficiente con rate limiting
   */
  async getMultipleProducts(productIds, includeFullDetails = false) {
    if (this.mockMode) {
      const results = [];
      for (const id of productIds) {
        try {
          const product = await this.mockAPI.getProduct(id);
          results.push(product);
        } catch (error) {
          logger.error(`Error obteniendo producto mock ${id}: ${error.message}`);
        }
      }
      return results;
    }

    if (!productIds || productIds.length === 0) {
      return [];
    }

    try {
      const tokens = auth.getTokens();
      if (tokens) {
        this.setAccessToken(tokens.access_token);
      }

      // Definir atributos para optimizar la respuesta
      const attributes = includeFullDetails 
        ? null 
        : ['id', 'title', 'available_quantity', 'price', 'currency_id', 'status', 'last_updated'];

      logger.info(`🔍 Obteniendo ${productIds.length} productos con multiget optimizado`);
      
      // Verificar rate limit
      const stats = mlApiClient.getRateLimitStats();
      if (stats.isNearLimit) {
        logger.warn('⚠️ Cerca del rate limit - usando cola para multiget');
      }
      
      return await mlApiClient.getMultipleProducts(productIds, attributes);
      
    } catch (error) {
      logger.error(`❌ Error obteniendo múltiples productos: ${error.message}`);
      throw error;
    }
  }

  /**
   * Actualiza el stock de un producto con rate limiting
   */
  async updateProductStock(productId, quantity) {
    if (this.mockMode) {
      return this.mockAPI.updateProductStock(productId, quantity);
    }

    try {
      const tokens = auth.getTokens();
      if (tokens) {
        this.setAccessToken(tokens.access_token);
      }

      logger.info(`📝 Actualizando stock de ${productId} a ${quantity} unidades`);
      return await mlApiClient.updateProductStock(productId, quantity);
      
    } catch (error) {
      logger.error(`❌ Error actualizando stock de ${productId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Procesa productos en lotes con control de rate limiting
   */
  async processProductsBatch(productIds, processor, options = {}) {
    if (this.mockMode) {
      // Simular rate limiting en modo mock
      const results = [];
      for (const id of productIds) {
        try {
          const result = await processor(id);
          results.push(result);
          // Simular pausa
          await new Promise(resolve => setTimeout(resolve, 50));
        } catch (error) {
          logger.error(`Error procesando producto mock ${id}: ${error.message}`);
        }
      }
      return results;
    }

    const { batchSize = 10, pauseBetweenBatches = 1000 } = options;

    try {
      const tokens = auth.getTokens();
      if (tokens) {
        this.setAccessToken(tokens.access_token);
      }

      return await mlApiClient.processBatch(
        productIds,
        async (productId) => {
          try {
            return await processor(productId);
          } catch (error) {
            logger.error(`Error procesando producto ${productId}: ${error.message}`);
            return null;
          }
        },
        batchSize
      );
      
    } catch (error) {
      logger.error(`❌ Error procesando lote de productos: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtiene estadísticas del rate limiting
   */
  getRateLimitStats() {
    if (this.mockMode) {
      return {
        mockMode: true,
        message: 'Rate limiting simulado en modo mock',
        currentRequests: Math.floor(Math.random() * 100),
        maxRequests: 1400,
        utilizationPercent: Math.floor(Math.random() * 50)
      };
    }

    return mlApiClient.getRateLimitStats();
  }

  /**
   * Verifica si está cerca del rate limit
   */
  isNearRateLimit() {
    if (this.mockMode) {
      return Math.random() > 0.8; // 20% probabilidad en mock
    }

    return mlApiClient.isNearRateLimit();
  }

  /**
   * Health check del servicio
   */
  async healthCheck() {
    if (this.mockMode) {
      return {
        status: 'OK',
        mockMode: true,
        message: 'Servicio funcionando en modo mock',
        rateLimitStats: this.getRateLimitStats(),
        timestamp: new Date().toISOString()
      };
    }

    try {
      const tokens = auth.getTokens();
      if (tokens) {
        this.setAccessToken(tokens.access_token);
      }

      return await mlApiClient.healthCheck();
    } catch (error) {
      return {
        status: 'ERROR',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Verifica y optimiza el uso del rate limit
   */
  async optimizeRateLimit() {
    const stats = this.getRateLimitStats();
    
    logger.info('🔧 Optimizando uso del rate limit...');
    logger.info(`📊 Estado actual: ${stats.currentRequests}/${stats.maxRequests} requests`);
    
    const recommendations = [];
    
    if (stats.utilizationPercent > 80) {
      recommendations.push('Reducir frecuencia de verificaciones');
      recommendations.push('Usar más multiget en lugar de requests individuales');
    }
    
    if (stats.queueLength > 10) {
      recommendations.push('Cola de requests muy larga - considerar pausar nuevas verificaciones');
    }
    
    if (stats.rejectedRequests > 0) {
      recommendations.push('Se han rechazado requests - ajustar límites internos');
    }
    
    return {
      currentStats: stats,
      recommendations,
      optimizationApplied: recommendations.length > 0
    };
  }

  /**
   * Estrategia inteligente para monitoreo masivo
   */
  async smartBulkMonitoring(productIds, options = {}) {
    const { 
      priorityProducts = [], 
      maxConcurrency = 5,
      adaptiveDelay = true 
    } = options;

    logger.info(`🧠 Iniciando monitoreo inteligente de ${productIds.length} productos`);
    
    // Separar productos por prioridad
    const priority = productIds.filter(id => priorityProducts.includes(id));
    const regular = productIds.filter(id => !priorityProducts.includes(id));
    
    const results = [];
    
    // Procesar productos prioritarios primero
    if (priority.length > 0) {
      logger.info(`⭐ Procesando ${priority.length} productos prioritarios`);
      const priorityResults = await this.getMultipleProducts(priority, true);
      results.push(...priorityResults);
    }
    
    // Procesar productos regulares en lotes adaptativos
    if (regular.length > 0) {
      logger.info(`📦 Procesando ${regular.length} productos regulares`);
      
      // Ajustar tamaño de lote basado en rate limit
      const stats = this.getRateLimitStats();
      let batchSize = stats.utilizationPercent > 50 ? 10 : 20;
      
      const regularResults = await this.processProductsBatch(
        regular,
        async (productId) => await this.getProduct(productId),
        { batchSize }
      );
      
      results.push(...regularResults.filter(r => r !== null));
    }
    
    logger.info(`✅ Monitoreo inteligente completado: ${results.length}/${productIds.length} productos`);
    return results;
  }

  /**
   * Pausa inteligente basada en el estado del rate limit
   */
  async smartPause() {
    const stats = this.getRateLimitStats();
    
    if (stats.utilizationPercent > 90) {
      const pauseTime = 30; // 30 segundos si está muy saturado
      logger.warn(`⏸️ Rate limit muy alto (${stats.utilizationPercent}%) - pausando ${pauseTime}s`);
      await new Promise(resolve => setTimeout(resolve, pauseTime * 1000));
    } else if (stats.utilizationPercent > 70) {
      const pauseTime = 5; // 5 segundos si está algo saturado
      logger.info(`⏳ Rate limit moderado (${stats.utilizationPercent}%) - pausando ${pauseTime}s`);
      await new Promise(resolve => setTimeout(resolve, pauseTime * 1000));
    }
    // Si está por debajo del 70%, no pausar
  }
}

// Exportar instancia singleton
const productsService = new ProductsService();

module.exports = productsService;