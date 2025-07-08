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
   * NUEVO: Obtener información de una categoría específica
   */
  async getCategory(categoryId) {
    logger.debug(`🔍 Obteniendo información de categoría ${categoryId}`);
    return await this.get(`/categories/${categoryId}`);
  }

  /**
   * NUEVO: Obtener múltiples categorías en lote
   */
  async getMultipleCategories(categoryIds) {
    if (categoryIds.length === 0) return [];
    
    logger.info(`🔍 Obteniendo ${categoryIds.length} categorías`);
    const results = [];
    
    // Procesar en lotes para evitar rate limit
    const chunks = this.chunkArray(categoryIds, 5); // 5 categorías por lote
    
    for (const chunk of chunks) {
      try {
        const categoryPromises = chunk.map(categoryId => this.getCategory(categoryId));
        const categoryResults = await Promise.all(categoryPromises);
        results.push(...categoryResults);
        
        // Pequeña pausa entre lotes
        if (chunks.length > 1) {
          await this.sleep(200);
        }
      } catch (error) {
        logger.error(`Error obteniendo lote de categorías: ${error.message}`);
      }
    }
    
    logger.info(`✅ Obtenidas ${results.length}/${categoryIds.length} categorías exitosamente`);
    return results;
  }

  /**
   * NUEVO: Función auxiliar para pausas
   */
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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
   * CORREGIDO: Obtener productos del usuario usando scan por lotes (compatible con Vercel serverless)
   * Implementa scan progresivo para evitar timeouts
   */
  async getAllUserProducts(userId, options = {}) {
    const { 
      limit = 50, // REDUCIDO de 100 a 50 para evitar timeout
      maxProductsPerBatch = 200, // REDUCIDO de 1000 a 200 para evitar timeout en Vercel
      continueFromCache = false,
      sessionId = null
    } = options;
    
    const scanCache = require('../utils/scanCache');
    let scrollId = null;
    let allProducts = [];
    let seenProductIds = new Set();
    let pageCount = 0;
    let duplicatesDetected = 0;
    let totalProcessed = 0;
    let exitReason = null; // Para rastrear por qué salió del loop
    
    // Intentar continuar desde cache si se solicita
    let previousProductsCount = 0;
    let totalPagesProcessed = 0;
    
    if (continueFromCache && sessionId) {
      const cachedState = scanCache.getScanState(userId, sessionId);
      if (cachedState) {
        scrollId = cachedState.scrollId;
        allProducts = cachedState.products || [];
        seenProductIds = new Set(cachedState.seenIds || []);
        duplicatesDetected = cachedState.duplicatesDetected || 0;
        totalPagesProcessed = cachedState.pageCount || 0;
        previousProductsCount = allProducts.length;
        
        // CORREGIDO: Resetear pageCount para el nuevo lote, pero mantener totalPagesProcessed
        pageCount = 0; // Empezar nuevo lote desde 0
        
        logger.info(`🔄 Continuando scan desde cache: ${previousProductsCount} productos ya obtenidos, páginas totales procesadas: ${totalPagesProcessed}`);
        logger.info(`🔄 Iniciando nuevo lote desde scroll_id: ${scrollId ? scrollId.substring(0, 30) + '...' : 'NO_SCROLL_ID'}`);
        
        // CORREGIDO: Si no hay scroll_id O está marcado como completado, significa que el scan YA se completó
        if (!scrollId || cachedState.completed) {
          logger.info('🏁 DETECCIÓN TEMPRANA: SCAN YA COMPLETADO - no hay scroll_id o marcado como completado en cache');
          return {
            results: null, // null = no cambios, preservar productos existentes
            total: allProducts.length,
            newProductsCount: 0,
            scanCompleted: true,
            batchCompleted: true,
            hasMoreProducts: false,
            pagesProcessed: totalPagesProcessed,
            duplicatesDetected: duplicatesDetected,
            uniqueProducts: allProducts.length,
            scrollId: null,
            message: 'Scan ya completado anteriormente - no hay más productos disponibles'
          };
        }
      }
    }
    
    const maxPages = Math.ceil(maxProductsPerBatch / limit); // Límite de páginas por lote ACTUAL
    logger.info(`🔍 Scan por lotes: máximo ${maxProductsPerBatch} productos por lote (${maxPages} páginas en este lote)`);
    
    try {
      let consecutiveDuplicatePages = 0;
      
      while (pageCount < maxPages) {
        pageCount++;
        
        // Preparar parámetros según documentación ML: SIEMPRE search_type=scan
        const params = {
          search_type: 'scan',
          limit: limit
        };
        
        if (!scrollId) {
          // Primera llamada: solo search_type=scan + limit
          logger.info(`📦 [Página ${pageCount}] Primera llamada con search_type=scan, limit=${limit}`);
        } else {
          // Llamadas subsiguientes: search_type=scan + scroll_id (según documentación ML)
          params.scroll_id = scrollId;
          logger.info(`📦 [Página ${pageCount}] Usando search_type=scan + scroll_id: ${scrollId.substring(0, 30)}...`);
        }
        
        let response;
        try {
          if (rateLimiter.isNearLimit()) {
            logger.warn('⚠️ Cerca del rate limit - usando cola de requests');
            response = await rateLimiter.queueRequest(
              () => this.get(`/users/${userId}/items/search`, { params })
            );
          } else {
            response = await this.get(`/users/${userId}/items/search`, { params });
          }
        } catch (apiError) {
          logger.error(`❌ Error en API call página ${pageCount}: ${apiError.message}`);
          
          // Si es error de autenticación (401), intentar renovar token
          if (apiError.response && apiError.response.status === 401) {
            logger.warn('🔄 Token expirado durante scan, intentando renovar...');
            try {
              const auth = require('./auth');
              
              // Intentar renovar token
              const newTokens = await auth.refreshAccessToken();
              if (newTokens) {
                logger.info('✅ Token renovado exitosamente durante scan');
                this.setAccessToken(newTokens.access_token);
                
                // Reintentar la misma página
                pageCount--;
                continue;
              }
            } catch (refreshError) {
              logger.error(`❌ Error renovando token durante scan: ${refreshError.message}`);
              throw new Error(`Token expirado y no se pudo renovar: ${refreshError.message}`);
            }
          }
          
          // Si es error de scroll_id expirado, reintentar sin scroll_id
          if (apiError.message.includes('scroll_id') || apiError.message.includes('expired')) {
            logger.warn('🔄 scroll_id expirado, reiniciando scan...');
            scrollId = null;
            pageCount--; // Reintentar esta página
            continue;
          }
          
          throw apiError;
        }
        
        // Verificar respuesta válida
        if (!response || !response.results) {
          logger.warn(`⚠️ Respuesta inválida en página ${pageCount}:`, response);
          break;
        }
        
        // Si no hay productos en esta página, terminamos
        if (response.results.length === 0) {
          logger.info(`📦 [Página ${pageCount}] Sin productos, finalizando scan`);
          exitReason = 'NO_PRODUCTS';
          break;
        }
        
        // Agregar productos obtenidos, evitando duplicados
        const newProducts = [];
        for (const productId of response.results) {
          if (!seenProductIds.has(productId)) {
            seenProductIds.add(productId);
            newProducts.push(productId);
          } else {
            duplicatesDetected++;
            logger.warn(`⚠️ Producto duplicado detectado: ${productId} (total duplicados: ${duplicatesDetected})`);
          }
        }
        
        allProducts.push(...newProducts);
        logger.info(`📦 [Página ${pageCount}] Obtenidos ${response.results.length} productos (${newProducts.length} nuevos, ${response.results.length - newProducts.length} duplicados). Total acumulado: ${allProducts.length}`);
        
        // Si no hay productos nuevos únicos, contar páginas consecutivas con duplicados
        if (newProducts.length === 0) {
          consecutiveDuplicatePages = (consecutiveDuplicatePages || 0) + 1;
          logger.info(`📦 [Página ${pageCount}] Solo productos duplicados (${consecutiveDuplicatePages} páginas consecutivas)`);
          
          // Solo terminar después de varias páginas consecutivas con duplicados
          if (consecutiveDuplicatePages >= 3) {
            logger.info(`📦 [Página ${pageCount}] Terminando scan: ${consecutiveDuplicatePages} páginas consecutivas con solo duplicados`);
            exitReason = 'ONLY_DUPLICATES';
            break;
          }
        } else {
          // Reset contador si encontramos productos nuevos
          consecutiveDuplicatePages = 0;
        }
        
        // Obtener scroll_id para la siguiente página
        const newScrollId = response.scroll_id;
        
        if (!newScrollId) {
          logger.info(`📦 [Página ${pageCount}] Sin scroll_id, finalizando scan (última página)`);
          exitReason = 'NO_SCROLL_ID';
          break;
        }
        
        scrollId = newScrollId;
        logger.debug(`🔄 Nuevo scroll_id para siguiente página: ${scrollId.substring(0, 30)}...`);
        
        // Pausa estratégica entre requests
        const pauseTime = rateLimiter.isNearLimit() ? 3000 : 1000;
        logger.debug(`⏳ Pausa de ${pauseTime}ms antes de siguiente página...`);
        await new Promise(resolve => setTimeout(resolve, pauseTime));
      }
      
      const batchCompleted = pageCount >= maxPages;
      if (batchCompleted) {
        exitReason = 'MAX_PAGES_REACHED';
      }
      
      // CORREGIDO: Determinar si el scan está realmente completo basado en la razón de salida
      const naturallyCompleted = exitReason === 'NO_PRODUCTS' || exitReason === 'ONLY_DUPLICATES' || exitReason === 'NO_SCROLL_ID';
      const hasMoreProducts = !naturallyCompleted && !!scrollId; // Solo si no terminó naturalmente Y hay scroll_id
      const scanCompleted = naturallyCompleted || (batchCompleted && !hasMoreProducts);
      
      logger.info(`🔍 EXIT_REASON: ${exitReason} → naturallyCompleted=${naturallyCompleted}, hasMoreProducts=${hasMoreProducts}, scanCompleted=${scanCompleted}`);
      
      if (batchCompleted && hasMoreProducts) {
        logger.warn(`⚠️ Alcanzado límite de lote (${maxPages} páginas) para evitar timeout en Vercel`);
        logger.info(`📊 Productos obtenidos en este lote: ${allProducts.length - previousProductsCount}`);
        
        // Guardar estado en cache para continuar después
        if (sessionId && hasMoreProducts) {
          const updatedTotalPages = totalPagesProcessed + pageCount;
          scanCache.setScanState(userId, sessionId, {
            scrollId: scrollId,
            products: allProducts,
            seenIds: Array.from(seenProductIds),
            pageCount: updatedTotalPages, // Total de páginas procesadas
            duplicatesDetected: duplicatesDetected,
            batchNumber: Math.floor(allProducts.length / maxProductsPerBatch) + 1
          });
          logger.info(`💾 Estado guardado en cache: ${allProducts.length} productos, ${updatedTotalPages} páginas totales`);
        }
      } else if (scanCompleted) {
        // Scan completado naturalmente - guardar estado final con scrollId=null para indicar completado
        if (sessionId) {
          const updatedTotalPages = totalPagesProcessed + pageCount;
          scanCache.setScanState(userId, sessionId, {
            scrollId: null, // IMPORTANTE: null indica que el scan está completo
            products: allProducts,
            seenIds: Array.from(seenProductIds),
            pageCount: updatedTotalPages,
            duplicatesDetected: duplicatesDetected,
            completed: true // Flag adicional para indicar completado
          });
          logger.info(`💾 Scan completado - estado final guardado en cache: ${allProducts.length} productos`);
        }
        logger.info('🏁 Scan completo - se obtuvieron todos los productos disponibles');
      }
      
      logger.info(`✅ Lote completado: ${allProducts.length} productos únicos en ${pageCount} páginas`);
      logger.info(`🔢 Estadísticas: ${duplicatesDetected} productos duplicados detectados y filtrados`);
      
      const newProductsInThisBatch = allProducts.length - previousProductsCount;
      
      // DEBUGGING: Log detallado del estado del scan
      logger.info(`🔍 ESTADO DEL SCAN: naturallyCompleted=${naturallyCompleted}, batchCompleted=${batchCompleted}, hasMoreProducts=${hasMoreProducts}, scanCompleted=${scanCompleted}`);
      logger.info(`📊 PRODUCTOS: newInBatch=${newProductsInThisBatch}, total=${allProducts.length}, previous=${previousProductsCount}`);
      
      // CORREGIDO: Si no hay productos nuevos y el scan está completo, devolver null
      if (newProductsInThisBatch === 0 && scanCompleted) {
        logger.info('🏁 FLUJO NORMAL: Scan completado sin productos nuevos - devolviendo null para preservar estado');
        return {
          results: null, // null = no cambios, preservar productos existentes
          total: allProducts.length,
          newProductsCount: 0,
          scanCompleted: true,
          batchCompleted: true,
          hasMoreProducts: false,
          pagesProcessed: totalPagesProcessed + pageCount,
          duplicatesDetected: duplicatesDetected,
          uniqueProducts: allProducts.length,
          scrollId: null,
          message: 'Scan completado - no hay más productos'
        };
      }
      
      logger.info(`🏁 FLUJO NORMAL: Devolviendo resultado - scanCompleted=${scanCompleted}, hasMoreProducts=${hasMoreProducts}, newProducts=${newProductsInThisBatch}`);
      
      return {
        results: allProducts,
        total: allProducts.length,
        newProductsCount: newProductsInThisBatch, // NUEVO: Productos nuevos del lote actual
        scanCompleted: scanCompleted, // Verdadero si no hay más productos
        batchCompleted: batchCompleted,
        hasMoreProducts: hasMoreProducts,
        pagesProcessed: totalPagesProcessed + pageCount, // Total de páginas procesadas
        duplicatesDetected: duplicatesDetected,
        uniqueProducts: allProducts.length,
        scrollId: scrollId, // Para debug
        paging: {
          total: allProducts.length,
          offset: 0,
          limit: allProducts.length
        }
      };
      
    } catch (error) {
      logger.error(`❌ Error obteniendo productos con scan después de ${pageCount} páginas: ${error.message}`);
      logger.error(`📊 Productos obtenidos antes del error: ${allProducts.length}`);
      
      // Devolver lo que tenemos hasta ahora en caso de error
      const newProductsInThisBatch = allProducts.length - previousProductsCount;
      
      return {
        results: allProducts,
        total: allProducts.length,
        newProductsCount: newProductsInThisBatch,
        scanCompleted: false,
        batchCompleted: false,
        hasMoreProducts: !!scrollId,
        pagesProcessed: totalPagesProcessed + pageCount,
        duplicatesDetected: duplicatesDetected,
        uniqueProducts: allProducts.length,
        error: error.message,
        scrollId: scrollId,
        paging: {
          total: allProducts.length,
          offset: 0,
          limit: allProducts.length
        }
      };
    }
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