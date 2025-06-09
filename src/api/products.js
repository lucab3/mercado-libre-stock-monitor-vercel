/**
 * Servicio de productos con Rate Limiting integrado
 * VERSIÓN CORREGIDA - Arregla inconsistencias de datos y permalinks
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
    } else {
      logger.info('🔐 Products Service en modo REAL con Mercado Libre API');
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
   * Método auxiliar para verificar y configurar autenticación
   */
  async ensureAuthentication() {
    if (this.mockMode) {
      return true; // En modo mock siempre está "autenticado"
    }

    // Verificar que estamos autenticados
    if (!auth.isAuthenticated()) {
      throw new Error('No autenticado - necesitas iniciar sesión primero con Mercado Libre');
    }

    try {
      // CORREGIDO: Usar auth.tokens en lugar de auth.getTokens()
      if (auth.tokens && auth.tokens.access_token) {
        logger.debug('🔑 Configurando access token desde auth.tokens');
        this.setAccessToken(auth.tokens.access_token);
        return true;
      } else {
        // Intentar obtener token válido
        logger.debug('🔄 Obteniendo access token válido...');
        const accessToken = await auth.getAccessToken();
        this.setAccessToken(accessToken);
        return true;
      }
    } catch (error) {
      logger.error(`❌ Error configurando autenticación: ${error.message}`);
      throw new Error(`Error de autenticación: ${error.message}`);
    }
  }

  /**
   * CORREGIDO: Obtiene TODOS los productos del usuario (activos, pausados, cerrados) usando scan
   */
  async getAllProducts() {
    if (this.mockMode) {
      logger.info('🎭 Obteniendo productos en modo MOCK');
      try {
        const response = await this.mockAPI.getUserProducts('mock_user');
        return response.results || [];
      } catch (error) {
        logger.error(`❌ Error en modo mock: ${error.message}`);
        return [];
      }
    }

    try {
      await this.ensureAuthentication();

      const user = await mlApiClient.getUser();
      logger.info(`👤 Obteniendo TODOS los productos para usuario: ${user.nickname} (${user.id})`);
      
      // Verificar rate limit antes de comenzar
      const stats = mlApiClient.getRateLimitStats();
      logger.info(`📊 Rate Limit Status: ${stats.currentRequests}/${stats.maxRequests} (${stats.utilizationPercent}%)`);
      
      // NUEVO: Usar el método scan para obtener TODOS los productos (sin filtro de status)
      const response = await mlApiClient.getAllUserProducts(user.id, {
        limit: 100 // Máximo para scan
      });
      
      const allProductIds = response.results || [];
      
      logger.info(`✅ Total IDs de productos obtenidos con scan: ${allProductIds.length}`);
      logger.info(`📊 Esto incluye productos activos, pausados y cerrados`);
      
      return allProductIds;
      
    } catch (error) {
      logger.error(`❌ Error obteniendo productos: ${error.message}`);
      throw error;
    }
  }

  /**
   * CORREGIDO: Obtiene un producto específico con validación completa de datos
   */
  async getProduct(productId) {
    if (this.mockMode) {
      logger.debug(`🎭 Obteniendo producto ${productId} en modo MOCK`);
      try {
        return await this.mockAPI.getProduct(productId);
      } catch (error) {
        logger.error(`❌ Error obteniendo producto mock ${productId}: ${error.message}`);
        throw error;
      }
    }

    try {
      await this.ensureAuthentication();

      logger.debug(`🔍 Obteniendo producto ${productId} con rate limiting`);
      const productData = await mlApiClient.getProduct(productId);
      
      // NUEVO: Validación y logging detallado de datos
      this.validateAndLogProductData(productData);
      
      return productData;
      
    } catch (error) {
      logger.error(`❌ Error obteniendo producto ${productId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * MEJORADO: Valida y registra datos del producto para debugging completo
   */
  validateAndLogProductData(productData) {
    if (!productData) {
      logger.error('❌ Producto devuelto es null o undefined');
      return;
    }

    // NUEVO: Intentar extraer SKU de múltiples fuentes
    const extractedSKU = this.extractSKUFromProduct(productData);

    // Log detallado para debugging
    logger.info(`🔍 VALIDACIÓN PRODUCTO:`);
    logger.info(`   ID: ${productData.id || 'MISSING'}`);
    logger.info(`   Título: ${productData.title ? productData.title.substring(0, 50) + '...' : 'MISSING'}`);
    logger.info(`   Stock: ${productData.available_quantity ?? 'MISSING'}`);
    logger.info(`   Status: ${productData.status || 'MISSING'}`);
    logger.info(`   SKU (seller_sku): ${productData.seller_sku || 'Sin SKU'}`);
    logger.info(`   SKU (extraído): ${extractedSKU || 'Sin SKU extraído'}`);
    logger.info(`   Permalink: ${productData.permalink || 'MISSING'}`);
    logger.info(`   Health: ${productData.health || 'N/A'}`);
    logger.info(`   Listing Type: ${productData.listing_type_id || 'N/A'}`);
    logger.info(`   Condition: ${productData.condition || 'N/A'}`);

    // NUEVO: Análisis del tipo de permalink
    if (productData.permalink) {
      if (productData.permalink.includes('internal-shop.mercadoshops.com.ar')) {
        logger.warn(`⚠️ ENLACE MERCADOSHOPS: ${productData.permalink}`);
      } else if (productData.permalink.includes('articulo.mercadolibre.com.ar')) {
        logger.info(`✅ ENLACE ESTÁNDAR: ${productData.permalink}`);
      } else {
        logger.warn(`❓ ENLACE DESCONOCIDO: ${productData.permalink}`);
      }
    }

    // Validaciones críticas
    const issues = [];
    
    if (!productData.id) {
      issues.push('ID faltante');
    }
    
    if (!productData.title) {
      issues.push('Título faltante');
    }
    
    if (typeof productData.available_quantity !== 'number') {
      issues.push('Stock no es número');
    }
    
    if (!productData.permalink) {
      issues.push('Permalink faltante');
    }

    if (productData.status !== 'active') {
      issues.push(`Estado no activo: ${productData.status}`);
    }

    if (issues.length > 0) {
      logger.error(`❌ PROBLEMAS EN PRODUCTO ${productData.id}: ${issues.join(', ')}`);
    } else {
      logger.info(`✅ Producto ${productData.id} validado correctamente`);
    }

    // Log del enlace generado vs real
    if (productData.permalink) {
      logger.info(`🔗 ENLACE REAL: ${productData.permalink}`);
    }
    
    const generatedLink = this.generateProductUrl(productData.id);
    logger.info(`🔗 ENLACE GENERADO: ${generatedLink}`);
    
    if (productData.permalink && productData.permalink !== generatedLink) {
      logger.warn(`⚠️ DIFERENCIA EN ENLACES para ${productData.id}`);
    }
  }

  /**
   * NUEVO: Extrae SKU de múltiples fuentes en los datos del producto
   */
  extractSKUFromProduct(productData) {
    // 1. Verificar seller_sku directo
    if (productData.seller_sku) {
      return productData.seller_sku;
    }

    // 2. Buscar en attributes si existe
    if (productData.attributes && Array.isArray(productData.attributes)) {
      const skuAttribute = productData.attributes.find(attr => 
        attr.id === 'SELLER_SKU' || 
        attr.id === 'SKU' || 
        (attr.name && attr.name.toLowerCase().includes('sku'))
      );
      
      if (skuAttribute && skuAttribute.value_name) {
        return skuAttribute.value_name;
      }
    }

    // 3. Si no se encuentra, retornar null
    return null;
  }

  /**
   * CORREGIDO: Genera URL de producto correcta basada en ID
   */
  generateProductUrl(productId) {
    if (!productId) {
      return 'https://mercadolibre.com.ar';
    }

    // Extraer código de país y número de producto
    const countryCode = productId.substring(0, 3);
    const productNumber = productId.substring(3); // Todo después de MLA/MLM etc.
    
    const countryDomains = {
      'MLA': 'com.ar',
      'MLM': 'com.mx', 
      'MLB': 'com.br',
      'MLC': 'cl',
      'MCO': 'com.co'
    };
    
    const domain = countryDomains[countryCode] || 'com.ar';
    
    // CORREGIDO: Formato correcto de URL con guión
    return `https://articulo.mercadolibre.${domain}/${countryCode}-${productNumber}`;
  }

  /**
   * NUEVO: Obtiene información completa de producto con debugging
   */
  async getProductWithDebugInfo(productId) {
    try {
      const productData = await this.getProduct(productId);
      
      // Información de debugging extendida
      const debugInfo = {
        originalData: {
          id: productData.id,
          title: productData.title,
          seller_sku: productData.seller_sku,
          available_quantity: productData.available_quantity,
          permalink: productData.permalink,
          status: productData.status,
          price: productData.price,
          currency_id: productData.currency_id
        },
        validation: {
          hasId: !!productData.id,
          hasTitle: !!productData.title,
          hasSku: !!productData.seller_sku,
          hasStock: typeof productData.available_quantity === 'number',
          hasPermalink: !!productData.permalink,
          isActive: productData.status === 'active'
        },
        links: {
          originalPermalink: productData.permalink,
          generatedUrl: this.generateProductUrl(productData.id),
          matches: productData.permalink === this.generateProductUrl(productData.id)
        },
        retrievalTime: new Date().toISOString()
      };

      return {
        product: productData,
        debug: debugInfo
      };

    } catch (error) {
      logger.error(`❌ Error en getProductWithDebugInfo para ${productId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtiene múltiples productos de forma eficiente con rate limiting
   */
  async getMultipleProducts(productIds, includeFullDetails = false) {
    if (this.mockMode) {
      logger.info(`🎭 Obteniendo ${productIds.length} productos en modo MOCK`);
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
      await this.ensureAuthentication();

      // MEJORADO: Incluir más atributos para debugging completo
      const attributes = includeFullDetails 
        ? null 
        : [
            'id', 
            'title', 
            'available_quantity', 
            'price', 
            'currency_id', 
            'status',           // Estado: active, paused, closed, etc
            'permalink', 
            'seller_sku',       // SKU del vendedor
            'last_updated',
            'listing_type_id',  // Tipo de publicación 
            'condition',        // Condición del producto
            'date_created',     // Fecha de creación
            'stop_time',        // Fecha de finalización si está pausada
            'health',          // Estado de salud de la publicación
            'catalog_listing', // Si es catálogo
            'attributes'       // Atributos adicionales que pueden incluir SKU
          ];

      logger.info(`🔍 Obteniendo ${productIds.length} productos con multiget optimizado (incluye SKU)`);
      
      // Verificar rate limit
      const stats = mlApiClient.getRateLimitStats();
      if (stats.isNearLimit) {
        logger.warn('⚠️ Cerca del rate limit - usando cola para multiget');
      }
      
      const products = await mlApiClient.getMultipleProducts(productIds, attributes);
      
      // NUEVO: Validar cada producto obtenido
      products.forEach(product => {
        this.validateAndLogProductData(product);
      });
      
      return products;
      
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
      logger.info(`🎭 Actualizando stock de ${productId} a ${quantity} unidades (MOCK)`);
      try {
        return await this.mockAPI.updateProductStock(productId, quantity);
      } catch (error) {
        logger.error(`❌ Error actualizando stock mock ${productId}: ${error.message}`);
        throw error;
      }
    }

    try {
      await this.ensureAuthentication();

      logger.info(`📝 Actualizando stock de ${productId} a ${quantity} unidades`);
      return await mlApiClient.updateProductStock(productId, quantity);
      
    } catch (error) {
      logger.error(`❌ Error actualizando stock de ${productId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * NUEVO: Debugging completo de datos de productos
   */
  async debugProductsData() {
    try {
      logger.info('🐛 Iniciando debugging completo de productos...');
      
      // Obtener lista de IDs
      const productIds = await this.getAllProducts();
      
      if (productIds.length === 0) {
        return {
          error: 'No se encontraron productos para debuggear',
          timestamp: new Date().toISOString()
        };
      }

      // Analizar una muestra de productos
      const sampleSize = Math.min(5, productIds.length);
      const sampleIds = productIds.slice(0, sampleSize);
      
      logger.info(`🎯 Analizando muestra de ${sampleSize} productos de ${productIds.length} total`);

      const sampleProductData = [];
      const issues = [];
      let dataQuality = {
        withPermalink: 0,
        withoutPermalink: 0,
        withSKU: 0,
        withoutSKU: 0,
        withErrors: 0
      };

      for (const id of sampleIds) {
        try {
          const productData = await this.getProduct(id);
          
          // Análisis de calidad de datos
          if (productData.permalink) {
            dataQuality.withPermalink++;
          } else {
            dataQuality.withoutPermalink++;
          }
          
          if (productData.seller_sku) {
            dataQuality.withSKU++;
          } else {
            dataQuality.withoutSKU++;
          }

          sampleProductData.push({
            id: productData.id,
            title: productData.title ? productData.title.substring(0, 50) + '...' : null,
            seller_sku: productData.seller_sku || null,
            available_quantity: productData.available_quantity,
            permalink: productData.permalink,
            generated_url: this.generateProductUrl(productData.id),
            links_match: productData.permalink === this.generateProductUrl(productData.id),
            status: productData.status,
            has_issues: !productData.id || !productData.title || typeof productData.available_quantity !== 'number'
          });

        } catch (error) {
          dataQuality.withErrors++;
          sampleProductData.push({
            id,
            error: error.message,
            generated_url: this.generateProductUrl(id)
          });
        }
      }

      // Generar recomendaciones
      const recommendations = [];
      
      if (dataQuality.withoutPermalink > 0) {
        recommendations.push({
          type: 'warning',
          message: `${dataQuality.withoutPermalink} productos sin permalink`,
          action: 'Verificar configuración de API o permisos'
        });
      }
      
      if (dataQuality.withoutSKU > 0) {
        recommendations.push({
          type: 'info',
          message: `${dataQuality.withoutSKU} productos sin SKU`,
          action: 'Agregar SKU a productos en Mercado Libre'
        });
      }
      
      if (dataQuality.withErrors > 0) {
        recommendations.push({
          type: 'error',
          message: `${dataQuality.withErrors} productos con errores`,
          action: 'Revisar logs para detalles específicos'
        });
      }

      const debugResult = {
        analysis: {
          totalProducts: productIds.length,
          sampleAnalyzed: sampleSize,
          dataQuality,
          timestamp: new Date().toISOString()
        },
        sampleProductData,
        recommendations,
        mockMode: this.mockMode
      };

      logger.info('✅ Debugging de productos completado');
      return debugResult;

    } catch (error) {
      logger.error(`❌ Error en debugging de productos: ${error.message}`);
      throw error;
    }
  }

  /**
   * Procesa productos en lotes con control de rate limiting
   */
  async processProductsBatch(productIds, processor, options = {}) {
    if (this.mockMode) {
      logger.info(`🎭 Procesando ${productIds.length} productos en lote (MOCK)`);
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
      await this.ensureAuthentication();

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
        utilizationPercent: Math.floor(Math.random() * 50),
        isNearLimit: Math.random() > 0.8,
        queueLength: 0,
        averageWaitTime: 0
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
      await this.ensureAuthentication();

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
    
    if (!this.mockMode) {
      await this.ensureAuthentication();
    }
    
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

  /**
   * Método para verificar el estado de autenticación
   */
  getAuthenticationStatus() {
    return {
      mockMode: this.mockMode,
      isAuthenticated: this.mockMode ? true : auth.isAuthenticated(),
      hasTokens: this.mockMode ? true : !!(auth.tokens && auth.tokens.access_token),
      tokenPreview: this.mockMode ? 'MOCK_TOKEN' : 
        (auth.tokens && auth.tokens.access_token ? 
          auth.tokens.access_token.substring(0, 20) + '...' : 'NO_TOKEN')
    };
  }
}

// Exportar instancia singleton
const productsService = new ProductsService();

module.exports = productsService;