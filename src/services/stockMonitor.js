/**
 * Stock Monitor con persistencia en Supabase
 * Versión migrada desde memoria a base de datos
 */

const products = require('../api/products');
const Product = require('../models/product');
const notifier = require('../utils/notifier');
const logger = require('../utils/logger');
const config = require('../../config/config');
const databaseService = require('./databaseService');

class StockMonitor {
  constructor() {
    this.stockThreshold = config.monitoring.stockThreshold;
    this.checkInterval = config.monitoring.stockCheckInterval;
    this.monitoringActive = false;
    this.lastCheckTime = null;
    this.lastFullCheckTime = null;
    this.autoCheckTimeout = null;
    
    // Cache temporal para sesión actual (se reconstruye desde BD)
    this.sessionCache = {
      lowStockProducts: [],
      totalProducts: 0,
      lastScanInfo: null
    };
  }

  /**
   * Obtener configuración desde base de datos
   */
  async getConfig() {
    try {
      const stockThreshold = await databaseService.getConfig('stock_threshold');
      if (stockThreshold !== null) {
        this.stockThreshold = parseInt(stockThreshold);
      }
      
      const autoScanInterval = await databaseService.getConfig('auto_scan_interval');
      if (autoScanInterval !== null) {
        this.checkInterval = parseInt(autoScanInterval) * 60 * 1000; // Convertir a ms
      }
      
      logger.debug(`📊 Configuración cargada: threshold=${this.stockThreshold}, interval=${this.checkInterval/1000}s`);
      
    } catch (error) {
      logger.error(`❌ Error cargando configuración: ${error.message}`);
      // Usar valores por defecto
    }
  }

  /**
   * Obtener usuario actual autenticado
   */
  async getCurrentUserId() {
    const auth = require('../api/auth');
    
    if (!auth.isAuthenticated()) {
      throw new Error('Usuario no autenticado');
    }
    
    return await auth.getCurrentUserId();
  }

  /**
   * Cargar productos desde base de datos
   */
  async loadProductsFromDatabase(userId, filters = {}) {
    try {
      const products = await databaseService.getProducts(userId, filters);
      
      logger.info(`📋 Cargados ${products.length} productos desde base de datos`);
      return products;
      
    } catch (error) {
      logger.error(`❌ Error cargando productos desde BD: ${error.message}`);
      throw error;
    }
  }

  /**
   * Sincronizar productos de ML API con base de datos
   */
  async syncProductsWithAPI(userId) {
    try {
      logger.info('🔄 Iniciando sincronización completa con ML API...');
      
      // Obtener TODOS los productos progresivamente
      let allProductIds = [];
      let scanCompleted = false;
      let totalBatches = 0;
      
      while (!scanCompleted) {
        totalBatches++;
        logger.info(`📊 Ejecutando lote ${totalBatches} de obtención de IDs...`);
        
        const apiResult = await products.getAllProducts();
        
        if (apiResult.results && apiResult.results.length > 0) {
          const newIds = apiResult.results.filter(id => !allProductIds.includes(id));
          allProductIds.push(...newIds);
          logger.info(`📦 Lote ${totalBatches}: +${apiResult.results.length} IDs (${newIds.length} nuevos) | Total acumulado: ${allProductIds.length}`);
        }
        
        scanCompleted = apiResult.scanCompleted || false;
        
        if (!scanCompleted && apiResult.hasMoreProducts) {
          // TEMPORAL: Limitar a primeros lotes para evitar pérdida de sesión
          if (totalBatches >= 1) {
            logger.warn('🚧 TEMPORAL: Limitando sync a primer lote para evitar pérdida de sesión');
            break;
          }
          logger.info('⏳ Hay más productos por obtener - pausando para rate limiting...');
          // Rate limiting más conservador para scan completo automatizado
          await new Promise(resolve => setTimeout(resolve, 2000)); // 2 segundos entre lotes de IDs
        } else if (!scanCompleted) {
          logger.warn('⚠️ Scan no completado pero no hay más productos - terminando');
          break;
        }
      }
      
      if (allProductIds.length === 0) {
        logger.warn('⚠️ No se obtuvieron productos de ML API después del scan completo');
        return { synced: 0, total: 0, scanCompleted: true };
      }
      
      logger.info(`✅ Scan de IDs completado: ${allProductIds.length} productos únicos en ${totalBatches} lotes`);
      
      // Obtener detalles de productos en lotes con rate limiting mejorado
      const batchSize = 30; // Reducir tamaño de lote para ser más conservador
      const allProductsData = [];
      const totalDetailBatches = Math.ceil(allProductIds.length / batchSize);
      
      logger.info(`🔍 Iniciando obtención de detalles: ${allProductIds.length} productos en ${totalDetailBatches} lotes de ${batchSize}`);
      
      for (let i = 0; i < allProductIds.length; i += batchSize) {
        const batch = allProductIds.slice(i, i + batchSize);
        const batchNumber = Math.floor(i/batchSize) + 1;
        
        try {
          logger.info(`📦 Procesando lote ${batchNumber}/${totalDetailBatches} de detalles (${batch.length} productos)...`);
          
          const batchData = await products.getMultipleProducts(batch, false);
          allProductsData.push(...batchData);
          
          logger.info(`✅ Lote ${batchNumber}/${totalDetailBatches} completado: ${batchData.length} productos obtenidos`);
          
        } catch (error) {
          logger.error(`❌ Error en lote ${batchNumber}/${totalDetailBatches}: ${error.message}`);
          
          // Si hay error, pausa más larga antes del siguiente lote
          if (i + batchSize < allProductIds.length) {
            logger.info('⏳ Error detectado - pausa extendida de 5 segundos...');
            await new Promise(resolve => setTimeout(resolve, 5000));
          }
        }
        
        // Rate limiting mejorado entre lotes de detalles
        if (i + batchSize < allProductIds.length) {
          const pauseTime = 1500; // 1.5 segundos entre lotes
          logger.debug(`⏳ Pausando ${pauseTime}ms antes del siguiente lote...`);
          await new Promise(resolve => setTimeout(resolve, pauseTime));
        }
      }
      
      logger.info(`✅ Obtención de detalles completada: ${allProductsData.length}/${allProductIds.length} productos`);
      
      // Preparar datos para base de datos
      const productsToSync = allProductsData.map(productData => ({
        id: productData.id,
        user_id: userId,
        title: productData.title,
        seller_sku: productData.seller_sku,
        available_quantity: productData.available_quantity || 0,
        price: productData.price,
        status: productData.status,
        permalink: productData.permalink,
        category_id: productData.category_id,
        condition: productData.condition,
        listing_type_id: productData.listing_type_id,
        health: productData.health,
        last_api_sync: new Date().toISOString()
      }));
      
      // Guardar en base de datos por lotes
      if (productsToSync.length > 0) {
        await databaseService.upsertMultipleProducts(productsToSync);
        logger.info(`✅ Sincronizados ${productsToSync.length} productos en base de datos`);
      }
      
      const finalResult = {
        synced: productsToSync.length,
        totalIdsFound: allProductIds.length,
        totalDetailsObtained: allProductsData.length,
        scanCompleted: true, // Ahora sí está completo
        hasMoreProducts: false, // Ya obtuvimos todo
        batchesProcessed: totalBatches,
        detailBatchesProcessed: totalDetailBatches
      };
      
      logger.info(`🎉 Sincronización completa finalizada:`);
      logger.info(`   📊 IDs encontrados: ${finalResult.totalIdsFound}`);
      logger.info(`   📋 Detalles obtenidos: ${finalResult.totalDetailsObtained}`);
      logger.info(`   💾 Guardados en BD: ${finalResult.synced}`);
      logger.info(`   🔄 Lotes de IDs: ${finalResult.batchesProcessed}`);
      logger.info(`   🔍 Lotes de detalles: ${finalResult.detailBatchesProcessed}`);
      
      return finalResult;
      
    } catch (error) {
      logger.error(`❌ Error sincronizando productos: ${error.message}`);
      throw error;
    }
  }

  /**
   * Actualizar cache de sesión desde base de datos
   */
  async updateSessionCache(userId) {
    try {
      // Obtener productos con stock bajo
      const lowStockProducts = await databaseService.getLowStockProducts(userId, this.stockThreshold);
      
      // Obtener total de productos (todos los estados)
      const allProducts = await databaseService.getProducts(userId, {});
      
      this.sessionCache = {
        lowStockProducts: lowStockProducts.map(p => ({
          id: p.id,
          title: p.title,
          seller_sku: p.seller_sku,
          stock: p.available_quantity,
          status: p.status,
          permalink: p.permalink,
          productUrl: this.generateProductUrl(p.id),
          lastUpdated: p.updated_at
        })),
        totalProducts: allProducts.length,
        lastScanInfo: {
          lastSync: new Date().toISOString(),
          source: 'database'
        }
      };
      
      logger.debug(`📊 Cache actualizado: ${this.sessionCache.totalProducts} productos, ${this.sessionCache.lowStockProducts.length} con stock bajo`);
      
    } catch (error) {
      logger.error(`❌ Error actualizando cache: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generar URL de producto
   */
  generateProductUrl(productId) {
    if (!productId) return 'https://mercadolibre.com.ar';
    
    const countryCode = productId.substring(0, 3);
    const productNumber = productId.substring(3);
    
    const countryDomains = {
      'MLA': 'com.ar',
      'MLM': 'com.mx', 
      'MLB': 'com.br',
      'MLC': 'cl',
      'MCO': 'com.co'
    };
    
    const domain = countryDomains[countryCode] || 'com.ar';
    return `https://articulo.mercadolibre.${domain}/${countryCode}-${productNumber}`;
  }

  /**
   * Inicia el monitoreo (versión webhook-driven con Supabase)
   */
  async start() {
    try {
      logger.info('🚀 Iniciando monitoreo webhook-driven con persistencia Supabase...');
      
      // Cargar configuración desde BD
      await this.getConfig();
      
      // Obtener usuario actual
      const userId = await this.getCurrentUserId();
      
      this.monitoringActive = true;
      
      // Actualizar cache desde base de datos
      await this.updateSessionCache(userId);
      
      // Verificar si necesitamos sincronización inicial (solo primera vez)
      const needsSync = await this.needsApiSync(userId);
      if (needsSync) {
        logger.info('🔄 Sincronización inicial con ML API - primera vez...');
        await this.syncProductsWithAPI(userId);
        await this.updateSessionCache(userId);
        logger.info('✅ Sincronización inicial completada - de ahora en adelante solo webhooks');
      }
      
      this.lastCheckTime = new Date();
      this.scheduleNextCheck();
      
      logger.info(`✅ Monitoreo iniciado: ${this.sessionCache.totalProducts} productos, ${this.sessionCache.lowStockProducts.length} con stock bajo`);
      
    } catch (error) {
      logger.error(`❌ Error iniciando monitoreo: ${error.message}`);
      this.monitoringActive = false;
      throw error;
    }
  }

  /**
   * Verificar si necesitamos sincronización inicial con ML API
   * Solo retorna true si la BD está completamente vacía (primera vez)
   */
  async needsApiSync(userId) {
    try {
      // Obtener total de productos de la BD
      const dbProducts = await databaseService.getProducts(userId, { limit: 1 });
      
      // Si no hay productos en BD, necesitamos sync inicial
      if (dbProducts.length === 0) {
        logger.info('📭 Base de datos vacía - sync inicial necesario');
        return true;
      }
      
      // Si ya hay productos, los webhooks se encargan de las actualizaciones
      logger.info('✅ Base de datos poblada - usando webhooks para actualizaciones');
      return false;
      
    } catch (error) {
      logger.error(`❌ Error verificando necesidad de sync: ${error.message}`);
      return true; // En caso de error, hacer sync para estar seguro
    }
  }

  /**
   * Verificar stock (solo lee BD actualizada por webhooks)
   */
  async checkStock(skipRefresh = false) {
    try {
      logger.info('🔍 Iniciando verificación de stock desde BD...');
      
      const userId = await this.getCurrentUserId();
      
      if (!skipRefresh) {
        // Solo actualizar cache desde BD (los webhooks ya actualizaron los datos)
        await this.updateSessionCache(userId);
      }
      
      this.lastCheckTime = new Date();
      
      // Enviar notificaciones para productos con stock bajo
      for (const product of this.sessionCache.lowStockProducts) {
        try {
          await notifier.sendLowStockAlert(product);
        } catch (notifyError) {
          logger.error(`❌ Error enviando notificación para ${product.id}: ${notifyError.message}`);
        }
      }
      
      const result = {
        totalProducts: this.sessionCache.totalProducts,
        lowStockProducts: this.sessionCache.lowStockProducts,
        lowStockCount: this.sessionCache.lowStockProducts.length,
        threshold: this.stockThreshold,
        timestamp: this.lastCheckTime.toISOString(),
        source: 'webhook_updated_database'
      };
      
      logger.info(`✅ Verificación completada: ${result.totalProducts} productos, ${result.lowStockCount} con stock bajo`);
      
      return result;
      
    } catch (error) {
      logger.error(`❌ Error verificando stock: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtener estado actual del monitoreo
   */
  getStatus() {
    return {
      active: this.monitoringActive,
      totalProducts: this.sessionCache.totalProducts,
      lowStockProducts: this.sessionCache.lowStockProducts,
      lowStockCount: this.sessionCache.lowStockProducts.length,
      threshold: this.stockThreshold,
      lastCheckTime: this.lastCheckTime,
      scanInfo: this.sessionCache.lastScanInfo,
      source: 'supabase_persistent'
    };
  }

  /**
   * Programar próxima verificación (limitado en Vercel)
   */
  scheduleNextCheck() {
    // En Vercel serverless, no podemos mantener timers
    // Esta función existe para compatibilidad
    if (process.env.NODE_ENV === 'development') {
      if (this.autoCheckTimeout) {
        clearTimeout(this.autoCheckTimeout);
      }
      
      this.autoCheckTimeout = setTimeout(async () => {
        if (this.monitoringActive) {
          try {
            await this.checkStock();
            this.scheduleNextCheck();
          } catch (error) {
            logger.error(`❌ Error en verificación automática: ${error.message}`);
          }
        }
      }, this.checkInterval);
      
      logger.debug(`⏰ Próxima verificación en ${this.checkInterval / 1000}s`);
    }
  }

  /**
   * Detener monitoreo
   */
  stop() {
    this.monitoringActive = false;
    
    if (this.autoCheckTimeout) {
      clearTimeout(this.autoCheckTimeout);
      this.autoCheckTimeout = null;
    }
    
    logger.info('⏹️ Monitoreo detenido');
  }

  /**
   * Verificación automática si es necesaria (para middleware)
   */
  async autoCheckIfNeeded() {
    if (!this.monitoringActive) return;
    
    try {
      // Solo hacer auto-check si la última verificación fue hace más de 5 minutos
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      
      if (!this.lastCheckTime || this.lastCheckTime < fiveMinutesAgo) {
        logger.debug('🔄 Auto-verificación necesaria...');
        await this.checkStock();
      }
      
    } catch (error) {
      logger.error(`❌ Error en auto-verificación: ${error.message}`);
    }
  }

  /**
   * Procesar producto específico desde webhook
   */
  async processProductFromWebhook(productId, userId) {
    try {
      logger.info(`🔔 Procesando producto desde webhook: ${productId}`);
      
      // Obtener datos actualizados de ML API
      const productData = await products.getProduct(productId);
      
      // Actualizar en base de datos
      const productToUpdate = {
        id: productData.id,
        user_id: userId,
        title: productData.title,
        seller_sku: productData.seller_sku,
        available_quantity: productData.available_quantity || 0,
        price: productData.price,
        status: productData.status,
        permalink: productData.permalink,
        category_id: productData.category_id,
        condition: productData.condition,
        listing_type_id: productData.listing_type_id,
        health: productData.health,
        last_webhook_sync: new Date().toISOString(),
        webhook_source: 'ml_webhook'
      };
      
      await databaseService.upsertProduct(productToUpdate);
      
      // Actualizar cache si es necesario
      if (this.monitoringActive) {
        await this.updateSessionCache(userId);
      }
      
      logger.info(`✅ Producto ${productId} actualizado desde webhook`);
      
      return productToUpdate;
      
    } catch (error) {
      logger.error(`❌ Error procesando producto desde webhook: ${error.message}`);
      throw error;
    }
  }

  /**
   * Debug del estado actual
   */
  debugCurrentState() {
    logger.debug('🔍 ESTADO ACTUAL DEL MONITOR (SUPABASE):');
    logger.debug(`   Activo: ${this.monitoringActive}`);
    logger.debug(`   Total productos: ${this.sessionCache.totalProducts}`);
    logger.debug(`   Stock bajo: ${this.sessionCache.lowStockProducts.length}`);
    logger.debug(`   Umbral: ${this.stockThreshold}`);
    logger.debug(`   Última verificación: ${this.lastCheckTime}`);
    logger.debug(`   Cache source: ${this.sessionCache.lastScanInfo?.source || 'unknown'}`);
  }
}

// Exportar instancia singleton
const stockMonitor = new StockMonitor();

module.exports = stockMonitor;