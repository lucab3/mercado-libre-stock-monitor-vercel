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
        
        try {
          // Usar getAllProducts() solo para el primer lote, continueProductScan() para los siguientes
          logger.info(`🔧 Llamando ${totalBatches === 1 ? 'getAllProducts()' : 'continueProductScan()'} para lote ${totalBatches} con userId: ${userId}`);
          const apiResult = totalBatches === 1 
            ? await products.getAllProducts(userId)
            : await products.continueProductScan(userId);
          
          logger.info(`📊 Resultado lote ${totalBatches}:`, {
            productsInBatch: apiResult.results?.length || 0,
            scanCompleted: apiResult.scanCompleted,
            hasMoreProducts: apiResult.hasMoreProducts,
            batchCompleted: apiResult.batchCompleted
          });
          
          if (apiResult.results && apiResult.results.length > 0) {
            const newIds = apiResult.results.filter(id => !allProductIds.includes(id));
            allProductIds.push(...newIds);
            logger.info(`📦 Lote ${totalBatches}: +${apiResult.results.length} IDs (${newIds.length} nuevos) | Total acumulado: ${allProductIds.length}`);
          }
          
          scanCompleted = apiResult.scanCompleted || false;
          
          if (!scanCompleted && apiResult.hasMoreProducts) {
            logger.info('⏳ Hay más productos por obtener - pausando para rate limiting...');
            // Rate limiting más conservador para scan completo automatizado
            await new Promise(resolve => setTimeout(resolve, 2000)); // 2 segundos entre lotes de IDs
          } else if (!scanCompleted) {
            logger.warn('⚠️ Scan no completado pero no hay más productos - terminando');
            break;
          }
          
        } catch (error) {
          logger.error(`❌ Error en lote ${totalBatches} de IDs: ${error.message}`);
          
          // Si tenemos IDs recolectados, procesar lo que tenemos
          if (allProductIds.length > 0) {
            logger.warn(`⚠️ Error de autenticación en lote ${totalBatches}, pero tenemos ${allProductIds.length} IDs recolectados`);
            logger.info('🔄 Procesando productos recolectados antes del fallo...');
            break; // Salir del loop y procesar lo que tenemos
          } else {
            // Si no tenemos IDs, re-lanzar el error
            throw error;
          }
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
          logger.info(`📦 Procesando lote ${batchNumber}/${totalDetailBatches} de detalles (${batch.length} productos) para userId: ${userId}...`);
          
          const batchData = await products.getMultipleProducts(batch, false, userId);
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
   * NUEVO: Sincronizar una lista específica de productos (para background processing)
   */
  async syncProducts(productIds, userId, options = {}) {
    const {
      maxRetries = 3,
      retryDelay = 1000,
      batchSize = 20 // Lotes pequeños para background
    } = options;

    try {
      logger.info(`🔄 Sincronizando ${productIds.length} productos específicos para usuario ${userId}`);
      
      if (!productIds || productIds.length === 0) {
        return { processed: 0, errors: 0, message: 'No hay productos para sincronizar' };
      }

      let processed = 0;
      let errors = 0;
      const errorDetails = [];

      // Procesar en lotes pequeños
      const chunks = this.chunkArray(productIds, batchSize);
      logger.info(`📦 Procesando ${chunks.length} lotes de hasta ${batchSize} productos`);

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        logger.info(`📋 Procesando lote ${i + 1}/${chunks.length}: ${chunk.length} productos`);

        let retryCount = 0;
        let chunkSuccess = false;

        while (retryCount < maxRetries && !chunkSuccess) {
          try {
            // Obtener detalles del lote
            const productsData = await products.getMultipleProducts(chunk, false, userId);
            
            if (productsData && productsData.length > 0) {
              // Preparar productos para base de datos
              const productsToSync = productsData.map(productData => ({
                id: productData.id,
                user_id: userId,
                title: productData.title,
                seller_sku: productData.seller_sku,
                available_quantity: productData.available_quantity,
                price: productData.price,
                currency_id: productData.currency_id,
                status: productData.status,
                permalink: productData.permalink,
                category_id: productData.category_id,
                condition: productData.condition,
                listing_type_id: productData.listing_type_id,
                health: productData.health,
                last_api_sync: new Date().toISOString()
              }));

              // Guardar en base de datos
              await databaseService.upsertMultipleProducts(productsToSync);
              processed += productsToSync.length;
              
              logger.info(`✅ Lote ${i + 1} completado: ${productsToSync.length} productos sincronizados`);
              chunkSuccess = true;
            } else {
              logger.warn(`⚠️ Lote ${i + 1}: Sin datos de productos obtenidos`);
              chunkSuccess = true; // No reintentar si no hay datos
            }

          } catch (chunkError) {
            retryCount++;
            logger.error(`❌ Error en lote ${i + 1}, intento ${retryCount}/${maxRetries}: ${chunkError.message}`);
            
            if (retryCount < maxRetries) {
              logger.info(`⏳ Reintentando lote ${i + 1} en ${retryDelay}ms...`);
              await new Promise(resolve => setTimeout(resolve, retryDelay));
            } else {
              logger.error(`💀 Lote ${i + 1} falló después de ${maxRetries} intentos`);
              errors += chunk.length;
              errorDetails.push({
                lote: i + 1,
                productos: chunk.length,
                error: chunkError.message
              });
            }
          }
        }

        // Pequeña pausa entre lotes
        if (i < chunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      const result = {
        processed,
        errors,
        total: productIds.length,
        successRate: ((processed / productIds.length) * 100).toFixed(1),
        errorDetails: errorDetails.length > 0 ? errorDetails : undefined
      };

      logger.info(`🎯 Sincronización específica completada: ${processed}/${productIds.length} productos (${result.successRate}%)`);
      
      if (errors > 0) {
        logger.warn(`⚠️ ${errors} productos fallaron durante la sincronización`);
      }

      return result;

    } catch (error) {
      logger.error(`❌ Error en sincronización específica: ${error.message}`);
      throw error;
    }
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
          lastUpdated: p.updated_at,
          category_id: p.category_id
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
      const dbProducts = await databaseService.getProducts(userId, {});
      const currentProductCount = dbProducts.length;
      
      // Si no hay productos en BD, necesitamos sync inicial
      if (currentProductCount === 0) {
        logger.info('📭 Base de datos vacía - sync inicial necesario');
        return true;
      }
      
      // Si hay pocos productos (menos de 1000), probablemente el sync está incompleto
      if (currentProductCount < 1000) {
        logger.info(`🔄 Sync incompleto detectado - solo ${currentProductCount} productos en BD, esperamos ~2908`);
        logger.info('🔄 Ejecutando sync para completar productos faltantes...');
        return true;
      }
      
      // Si ya hay productos suficientes, los webhooks se encargan de las actualizaciones
      logger.info(`✅ Base de datos completa - ${currentProductCount} productos - usando webhooks para actualizaciones`);
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
      logger.info(`🔔 Procesando producto desde webhook: ${productId} para usuario ${userId}`);
      
      // 1. Obtener datos ANTERIORES de la BD para comparación
      let previousData = null;
      try {
        const existingProducts = await databaseService.getProducts(userId, {});
        previousData = existingProducts.find(p => p.id === productId);
        if (previousData) {
          logger.info(`📋 Datos anteriores - Stock: ${previousData.available_quantity}, Precio: ${previousData.price}, Estado: ${previousData.status}`);
        } else {
          logger.info(`🆕 Producto nuevo - no existe en BD`);
        }
      } catch (dbError) {
        logger.warn(`⚠️ No se pudieron obtener datos anteriores: ${dbError.message}`);
      }
      
      // 2. Obtener datos NUEVOS de ML API
      logger.info(`🌐 Consultando ML API para producto ${productId} con userId: ${userId}...`);
      const productData = await products.getProduct(productId, userId);
      
      logger.info(`📦 Datos recibidos de ML API:`, {
        id: productData.id,
        title: productData.title?.substring(0, 50) + '...',
        stock: productData.available_quantity,
        price: productData.price,
        status: productData.status,
        seller_sku: productData.seller_sku,
        health: productData.health
      });
      
      // 3. Detectar y mostrar CAMBIOS específicos
      if (previousData) {
        const changes = [];
        if (previousData.available_quantity !== productData.available_quantity) {
          changes.push(`Stock: ${previousData.available_quantity} → ${productData.available_quantity || 0} (${(productData.available_quantity || 0) - previousData.available_quantity >= 0 ? '+' : ''}${(productData.available_quantity || 0) - previousData.available_quantity})`);
        }
        if (previousData.price !== productData.price) {
          changes.push(`Precio: $${previousData.price} → $${productData.price}`);
        }
        if (previousData.status !== productData.status) {
          changes.push(`Estado: ${previousData.status} → ${productData.status}`);
        }
        
        if (changes.length > 0) {
          logger.info(`🔄 CAMBIOS DETECTADOS en ${productId}:`);
          changes.forEach(change => logger.info(`   • ${change}`));
          
          // 3.1. Generar alertas de cambio de stock
          await this.generateStockAlerts(userId, productId, previousData, productData);
        } else {
          logger.info(`📊 Sin cambios detectados en ${productId} (webhook duplicado o interno)`);
        }
      }
      
      // 4. Preparar datos para actualizar en BD
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
      
      // 5. Actualizar en base de datos
      logger.info(`💾 Actualizando producto ${productId} en base de datos...`);
      await databaseService.upsertProduct(productToUpdate);
      logger.info(`✅ Producto ${productId} guardado en BD exitosamente`);
      
      // 6. Actualizar cache si es necesario
      if (this.monitoringActive) {
        logger.info(`🔄 Actualizando cache de sesión...`);
        await this.updateSessionCache(userId);
        logger.info(`✅ Cache actualizado`);
      }
      
      // 7. Log final con resumen
      const finalStock = productData.available_quantity || 0;
      const stockStatus = finalStock <= this.stockThreshold ? '🔴 STOCK BAJO' : '✅ Stock OK';
      logger.info(`🎉 WEBHOOK PROCESADO EXITOSAMENTE: ${productId} | Stock: ${finalStock} ${stockStatus}`);
      
      return productToUpdate;
      
    } catch (error) {
      logger.error(`❌ Error procesando producto desde webhook: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generar alertas basadas en cambios de stock detectados
   */
  async generateStockAlerts(userId, productId, previousData, currentData) {
    try {
      const previousStock = previousData?.available_quantity || 0;
      const currentStock = currentData?.available_quantity || 0;
      
      // Solo procesar si hay cambio de stock
      if (previousStock === currentStock) {
        return;
      }
      
      let alertType = null;
      
      // Determinar tipo de alerta
      if (currentStock < previousStock) {
        // Stock disminuyó
        if (currentStock <= this.stockThreshold) {
          alertType = 'LOW_STOCK'; // Stock bajo (crítico)
        } else {
          alertType = 'STOCK_DECREASE'; // Solo disminución
        }
      } else if (currentStock > previousStock) {
        // Stock aumentó
        alertType = 'STOCK_INCREASE';
      }
      
      if (alertType) {
        const alert = {
          user_id: userId,
          product_id: productId,
          alert_type: alertType,
          previous_stock: previousStock,
          new_stock: currentStock,
          product_title: currentData.title,
          seller_sku: currentData.seller_sku,
          created_at: new Date().toISOString()
        };
        
        // Guardar en base de datos
        await databaseService.saveStockAlert(alert);
        
        // Log de la alerta generada
        const alertEmoji = alertType === 'LOW_STOCK' ? '🚨' : 
                          alertType === 'STOCK_DECREASE' ? '📉' : '📈';
        
        logger.info(`${alertEmoji} ALERTA GENERADA: ${alertType} - ${productId}`);
        logger.info(`   Stock: ${previousStock} → ${currentStock}`);
        logger.info(`   Producto: ${currentData.title?.substring(0, 50) || 'Sin título'}`);
        
        // TODO: Aquí se podrían agregar notificaciones inmediatas (email, telegram, etc.)
        // await this.sendImmediateNotification(alert);
      }
      
    } catch (error) {
      logger.error(`❌ Error generando alertas para ${productId}: ${error.message}`);
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