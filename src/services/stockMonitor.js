const products = require('../api/products');
const Product = require('../models/product');
const notifier = require('../utils/notifier');
const logger = require('../utils/logger');
const config = require('../../config/config');

class StockMonitor {
  constructor() {
    this.stockThreshold = config.monitoring.stockThreshold;
    this.checkInterval = config.monitoring.stockCheckInterval;
    this.trackedProducts = new Map();
    this.monitoringActive = false;
    this.lastCheckTime = null;
    this.lastFullCheckTime = null;
    this.autoCheckTimeout = null;
    this.lowStockProducts = [];
    
    // Cache de último estado conocido para consistencia
    this.lastKnownStockState = new Map();
    
    // NUEVO: Información del scan por lotes
    this.lastScanInfo = null;
  }

  /**
   * Inicia el monitoreo de stock (versión para Vercel serverless)
   */
  async start() {
    logger.info(`Iniciando monitoreo de stock. Umbral: ${this.stockThreshold} unidades`);
    
    try {
      this.monitoringActive = true;
      
      // Realizar una verificación inicial inmediata
      await this.checkStock();
      
      // En Vercel, no podemos mantener procesos corriendo, pero podemos configurar
      // verificaciones automáticas cuando se accede a la aplicación
      this.scheduleNextCheck();
      
      logger.info('Monitoreo iniciado correctamente');
    } catch (error) {
      logger.error(`Error al iniciar el monitoreo de stock: ${error.message}`);
      throw error;
    }
  }

  /**
   * Programa la próxima verificación (solo para entornos que lo soporten)
   */
  scheduleNextCheck() {
    if (!process.env.VERCEL && this.monitoringActive) {
      this.autoCheckTimeout = setTimeout(async () => {
        if (this.monitoringActive) {
          try {
            await this.checkStock();
            this.scheduleNextCheck();
          } catch (error) {
            logger.error(`Error en verificación automática: ${error.message}`);
          }
        }
      }, this.checkInterval);
    }
  }

  /**
   * Detiene el monitoreo de stock
   */
  stop() {
    this.monitoringActive = false;
    if (this.autoCheckTimeout) {
      clearTimeout(this.autoCheckTimeout);
      this.autoCheckTimeout = null;
    }
    logger.info('Monitoreo de stock detenido');
  }

  /**
   * Verifica si es necesario hacer una nueva verificación automática
   */
  async autoCheckIfNeeded() {
    const now = Date.now();
    
    const timeSinceLastCheck = this.lastCheckTime ? now - this.lastCheckTime : Infinity;
    const shouldCheck = timeSinceLastCheck > this.checkInterval;
    
    if (shouldCheck && this.monitoringActive) {
      logger.info('Ejecutando verificación automática por tiempo transcurrido');
      try {
        await this.checkStock();
      } catch (error) {
        logger.error(`Error en verificación automática: ${error.message}`);
      }
    }
    
    return {
      lastCheck: this.lastCheckTime,
      timeSinceLastCheck,
      shouldCheck,
      nextCheckIn: this.checkInterval - timeSinceLastCheck
    };
  }

  /**
   * CORREGIDO: Actualiza la lista de productos monitoreados con validación de datos
   * MEJORADO: Ahora acepta scanResult opcional para evitar llamadas duplicadas a la API
   */
  async refreshProductList(existingScanResult = null) {
    try {
      logger.info('Actualizando lista de productos...');
      
      // NUEVO: Usar scanResult existente si se proporciona (evita llamada duplicada a API)
      let scanResult;
      if (existingScanResult) {
        logger.info('✅ Usando scanResult existente (evitando llamada duplicada a API)');
        scanResult = existingScanResult;
      } else {
        logger.info('🔄 Obteniendo productos desde API...');
        scanResult = await products.getAllProducts();
      }
      
      // NUEVO: Guardar información del scan ANTES de verificar si results es null
      this.lastScanInfo = {
        scanCompleted: scanResult.scanCompleted,
        batchCompleted: scanResult.batchCompleted,
        hasMoreProducts: scanResult.hasMoreProducts,
        pagesProcessed: scanResult.pagesProcessed,
        duplicatesDetected: scanResult.duplicatesDetected,
        uniqueProducts: scanResult.uniqueProducts,
        error: scanResult.error,
        lastUpdate: Date.now()
      };
      
      // CORREGIDO: Si results es null, significa "sin cambios" - mantener productos existentes
      if (scanResult.results === null) {
        logger.info('📋 Scan completado sin cambios - manteniendo productos existentes');
        // IMPORTANTE: lastScanInfo ya se actualizó arriba, así que el frontend sabrá que scanCompleted=true
        return;
      }
      
      const productIds = Array.isArray(scanResult) ? scanResult : scanResult.results || [];
      
      // Log información del scan
      if (scanResult.scanCompleted !== undefined) {
        logger.info(`📊 Scan completado: ${scanResult.scanCompleted ? 'SÍ' : 'NO'} (${scanResult.pagesProcessed || 0} páginas)`);
        if (scanResult.duplicatesDetected > 0) {
          logger.info(`🔢 Duplicados filtrados: ${scanResult.duplicatesDetected}`);
        }
        if (!scanResult.scanCompleted) {
          logger.warn(`⚠️ Scan parcial: procesando ${productIds.length} productos de los ~2908 totales`);
        }
      }
      
      if (productIds.length === 0) {
        logger.warn('⚠️ No se proporcionaron productos para actualizar - probablemente fin del scan');
        // CORREGIDO: NO limpiar productos existentes cuando se llega al final del scan
        // Solo limpiar si es el primer scan o si explícitamente se solicita reset
        if (this.trackedProducts.size === 0) {
          logger.info('📋 Primera vez - no hay productos previos que preservar');
          return;
        } else {
          logger.info(`📋 Fin del scan alcanzado - preservando ${this.trackedProducts.size} productos existentes`);
          return; // Mantener los productos que ya tenemos
        }
      }
      
      logger.info(`📋 Procesando ${productIds.length} productos únicos...`);
      
      // OPTIMIZADO: Solo procesar productos nuevos para evitar timeout
      const newProductIds = productIds.filter(id => !this.trackedProducts.has(id));
      const existingCount = productIds.length - newProductIds.length;
      
      if (existingCount > 0) {
        logger.info(`⚡ OPTIMIZACIÓN: ${existingCount} productos ya procesados, solo obteniendo ${newProductIds.length} nuevos`);
      }
      
      // MEJORADO: Obtener detalles solo de productos nuevos
      const productDetails = [];
      let successCount = 0;
      let errorCount = 0;
      
      // Preservar productos ya existentes que siguen en la lista actual
      const preservedProducts = [];
      for (const [id, existingProduct] of this.trackedProducts.entries()) {
        if (productIds.includes(id)) {
          preservedProducts.push(existingProduct);
        }
      }
      
      logger.info(`📦 Preservando ${preservedProducts.length} productos ya procesados`);
      productDetails.push(...preservedProducts);
      successCount = preservedProducts.length;
      
      // Procesar solo productos nuevos
      for (const id of newProductIds) {
        try {
          logger.debug(`🔍 Obteniendo detalles de producto NUEVO ${id}...`);
          const productData = await products.getProduct(id);
          
          // NUEVO: Validación de datos críticos
          if (!productData.id) {
            logger.error(`❌ Producto sin ID válido: ${JSON.stringify(productData)}`);
            errorCount++;
            continue;
          }
          
          if (typeof productData.available_quantity !== 'number') {
            logger.error(`❌ Producto ${productData.id} sin stock válido: ${productData.available_quantity}`);
            errorCount++;
            continue;
          }
          
          productDetails.push(productData);
          successCount++;
          
          // Log detallado para debugging
          logger.info(`✅ NUEVO ${productData.id}: "${productData.title ? productData.title.substring(0, 40) + '...' : 'Sin título'}" - ${productData.available_quantity} unidades - SKU: ${productData.seller_sku || 'Sin SKU'}`);
          
        } catch (error) {
          logger.error(`❌ Error obteniendo producto ${id}: ${error.message}`);
          errorCount++;
        }
      }
      
      logger.info(`📊 Resultados: ${successCount} exitosos (${newProductIds.length} nuevos + ${existingCount} ya existentes), ${errorCount} errores de ${productIds.length} total`);
      
      // Actualizar both trackedProducts y lastKnownStockState
      this.trackedProducts.clear();
      
      productDetails.forEach(productData => {
        const product = Product.fromApiData(productData);
        
        // Mantener el producto actual
        this.trackedProducts.set(product.id, product);
        
        // ACTUALIZADO: Estado conocido con SKU incluido
        this.lastKnownStockState.set(product.id, {
          stock: product.available_quantity,
          timestamp: Date.now(),
          title: product.title,
          permalink: product.permalink,
          seller_sku: product.seller_sku || null, // NUEVO: Incluir SKU
          last_sync: new Date().toISOString()
        });
        
        logger.debug(`🔄 Sincronizado: ${product.id} - Stock: ${product.available_quantity} - SKU: ${product.seller_sku || 'Sin SKU'} - Link: ${product.permalink ? 'Sí' : 'Generado'}`);
      });
      
      logger.info(`Lista de productos actualizada. Monitoreando ${this.trackedProducts.size} productos`);
      this.lastFullCheckTime = Date.now();
      
    } catch (error) {
      logger.error(`Error al actualizar lista de productos: ${error.message}`);
      throw error;
    }
  }

  /**
   * NUEVO: Método específico para continuar scan y actualizar inmediatamente
   */
  async continueScanAndRefresh() {
    try {
      logger.info('🔄 Continuando scan y actualizando monitor...');
      
      // 1. Continuar scan para obtener más productos
      const scanResult = await products.continueProductScan();
      
      // 2. Actualizar lista con los resultados del scan (evita llamada duplicada)
      await this.refreshProductList(scanResult);
      
      // 3. Verificar stock inmediatamente para actualizar contadores
      const stockResult = await this.checkStock();
      
      logger.info(`✅ Scan continuado y monitor actualizado: ${stockResult.totalProducts} productos total, ${stockResult.lowStockProducts} con stock bajo`);
      
      return {
        scanResult,
        stockResult,
        totalProducts: this.trackedProducts.size,
        lowStockProducts: this.lowStockProducts.length,
        lastScanInfo: this.lastScanInfo
      };
      
    } catch (error) {
      logger.error(`❌ Error en continueScanAndRefresh: ${error.message}`);
      throw error;
    }
  }

  /**
   * MEJORADO: Verifica el stock de todos los productos monitoreados con datos sincronizados
   * OPTIMIZADO: Acepta skipRefresh para evitar llamadas duplicadas
   */
  async checkStock(skipRefresh = false) {
    try {
      logger.info('🔍 Verificando stock de productos...');
      
      this.lastCheckTime = Date.now();
      
      // OPTIMIZADO: Solo refrescar datos si no se especifica skipRefresh
      if (!skipRefresh) {
        await this.refreshProductList();
      }
      
      let lowStockCount = 0;
      const alertsToSend = [];
      const currentLowStockProducts = [];
      
      // Verificar cada producto usando datos consistentes
      for (const [id, product] of this.trackedProducts.entries()) {
        const hasLowStock = product.hasLowStock(this.stockThreshold);
        
        logger.info(`📦 ${product.title} (${id}): ${product.available_quantity} unidades - SKU: ${product.seller_sku || 'Sin SKU'} - ${hasLowStock ? '⚠️ STOCK BAJO' : '✅ OK'}`);
        
        if (hasLowStock) {
          // MEJORADO: Usar datos DIRECTOS del producto con SKU y estado
          const productInfo = {
            id: product.id,
            title: product.title,
            stock: product.available_quantity, // Dato DIRECTO de la API
            permalink: product.permalink,
            seller_sku: product.seller_sku || null, // NUEVO: Incluir SKU
            status: product.status || 'unknown', // NUEVO: Estado de publicación
            health: product.health || null, // NUEVO: Estado de salud
            condition: product.condition || null, // NUEVO: Condición
            listing_type_id: product.listing_type_id || null, // NUEVO: Tipo de publicación
            linkType: product.linkType || 'unknown', // NUEVO: Tipo de enlace
            hasLowStock: true,
            timestamp: Date.now(),
            productUrl: product.getProductUrl() // NUEVO: URL validada
          };
          
          currentLowStockProducts.push(productInfo);
          
          // Verificar si debe enviar alerta
          if (product.shouldSendAlert(this.stockThreshold)) {
            alertsToSend.push(product);
            product.markAlertSent();
            lowStockCount++;
          }
        }
      }
      
      // ACTUALIZAR la lista de productos con stock bajo con datos FRESH
      this.lowStockProducts = currentLowStockProducts;
      
      // Debug: Mostrar estado actual con SKU
      logger.info(`📊 Estado actual de stock:`);
      this.lowStockProducts.forEach(p => {
        logger.info(`   - ${p.title}: ${p.stock} unidades - SKU: ${p.seller_sku || 'Sin SKU'} - ${p.permalink || p.productUrl}`);
      });
      
      // Enviar alertas en paralelo
      if (alertsToSend.length > 0) {
        await Promise.all(
          alertsToSend.map(product => 
            notifier.sendLowStockAlert(product).catch(error => 
              logger.error(`Error enviando alerta para ${product.id}: ${error.message}`)
            )
          )
        );
      }
      
      const result = {
        totalProducts: this.trackedProducts.size,
        lowStockProducts: this.lowStockProducts.length,
        newAlerts: lowStockCount,
        timestamp: this.lastCheckTime,
        products: Array.from(this.trackedProducts.values()).map(p => ({
          id: p.id,
          title: p.title,
          stock: p.available_quantity,
          permalink: p.permalink,
          seller_sku: p.seller_sku || null, // NUEVO: Incluir SKU
          hasLowStock: p.hasLowStock(this.stockThreshold),
          productUrl: p.getProductUrl() // NUEVO: URL validada
        }))
      };
      
      logger.info(`✅ Verificación completada. ${result.lowStockProducts} productos con stock bajo, ${lowStockCount} nuevas alertas enviadas`);
      
      return result;
    } catch (error) {
      logger.error(`❌ Error al verificar stock: ${error.message}`);
      throw error;
    }
  }

  /**
   * MEJORADO: Verifica el stock de un producto específico con sincronización completa
   */
  async checkProductStock(productId) {
    try {
      logger.info(`🔍 Verificando stock del producto ${productId}...`);
      
      // Obtener datos FRESH directamente de la API
      const productData = await products.getProduct(productId);
      const product = Product.fromApiData(productData);
      
      // NUEVO: Log detallado para debugging
      logger.info(`🔍 DATOS OBTENIDOS:`);
      logger.info(`   ID: ${product.id}`);
      logger.info(`   Título: ${product.title}`);
      logger.info(`   Stock: ${product.available_quantity}`);
      logger.info(`   SKU: ${product.seller_sku || 'Sin SKU'}`);
      logger.info(`   Permalink: ${product.permalink || 'Sin permalink'}`);
      logger.info(`   URL generada: ${product.getProductUrl()}`);
      
      // Actualizar inmediatamente en trackedProducts
      this.trackedProducts.set(product.id, product);
      
      // Actualizar estado conocido con SKU
      this.lastKnownStockState.set(product.id, {
        stock: product.available_quantity,
        timestamp: Date.now(),
        title: product.title,
        permalink: product.permalink,
        seller_sku: product.seller_sku || null,
        last_sync: new Date().toISOString()
      });
      
      // Actualizar lista de productos con stock bajo
      const existingIndex = this.lowStockProducts.findIndex(p => p.id === productId);
      
      if (product.hasLowStock(this.stockThreshold)) {
        const productInfo = {
          id: product.id,
          title: product.title,
          stock: product.available_quantity, // Dato FRESCO
          permalink: product.permalink,
          seller_sku: product.seller_sku || null, // NUEVO: Incluir SKU
          status: product.status || 'unknown', // NUEVO: Estado de publicación
          health: product.health || null, // NUEVO: Estado de salud
          condition: product.condition || null, // NUEVO: Condición
          listing_type_id: product.listing_type_id || null, // NUEVO: Tipo de publicación
          linkType: product.linkType || 'unknown', // NUEVO: Tipo de enlace
          hasLowStock: true,
          timestamp: Date.now(),
          productUrl: product.getProductUrl()
        };
        
        if (existingIndex >= 0) {
          // Actualizar producto existente
          this.lowStockProducts[existingIndex] = productInfo;
        } else {
          // Agregar nuevo producto
          this.lowStockProducts.push(productInfo);
        }
        
        // Enviar alerta si es necesario
        if (product.shouldSendAlert(this.stockThreshold)) {
          await notifier.sendLowStockAlert(product);
          product.markAlertSent();
          logger.info(`📧 Alerta enviada para ${productId}: ${product.available_quantity} unidades`);
        }
        
        logger.info(`⚠️ ${product.title}: ${product.available_quantity} unidades (STOCK BAJO) - SKU: ${product.seller_sku || 'Sin SKU'} - ${product.permalink || product.getProductUrl()}`);
      } else {
        // Remover de lista de stock bajo si ya no aplica
        if (existingIndex >= 0) {
          this.lowStockProducts.splice(existingIndex, 1);
        }
        logger.info(`✅ ${product.title}: ${product.available_quantity} unidades (STOCK SUFICIENTE) - SKU: ${product.seller_sku || 'Sin SKU'} - ${product.permalink || product.getProductUrl()}`);
      }
      
      return product;
    } catch (error) {
      logger.error(`❌ Error al verificar stock del producto ${productId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * MEJORADO: Obtiene el estado actual del monitoreo con datos sincronizados y SKU
   */
  getStatus() {
    // Asegurar que lowStockProducts tiene datos actualizados con SKU
    const syncedLowStockProducts = this.lowStockProducts.map(p => {
      // Buscar datos más recientes en trackedProducts
      const trackedProduct = this.trackedProducts.get(p.id);
      if (trackedProduct) {
        return {
          id: trackedProduct.id,
          title: trackedProduct.title,
          stock: trackedProduct.available_quantity, // Dato sincronizado
          permalink: trackedProduct.permalink,
          seller_sku: trackedProduct.seller_sku || null, // NUEVO: SKU sincronizado
          status: trackedProduct.status || 'unknown', // NUEVO: Estado sincronizado
          health: trackedProduct.health || null, // NUEVO: Estado de salud
          condition: trackedProduct.condition || null, // NUEVO: Condición
          listing_type_id: trackedProduct.listing_type_id || null, // NUEVO: Tipo de publicación
          linkType: trackedProduct.linkType || 'unknown', // NUEVO: Tipo de enlace
          productUrl: trackedProduct.getProductUrl()
        };
      }
      return {
        id: p.id,
        title: p.title,
        stock: p.stock,
        permalink: p.permalink,
        seller_sku: p.seller_sku || null, // NUEVO: Incluir SKU
        status: p.status || 'unknown', // NUEVO: Estado
        health: p.health || null, // NUEVO: Estado de salud
        condition: p.condition || null, // NUEVO: Condición
        listing_type_id: p.listing_type_id || null, // NUEVO: Tipo de publicación
        linkType: p.linkType || 'unknown', // NUEVO: Tipo de enlace
        productUrl: p.productUrl || this.generateProductUrl(p.id)
      };
    });
    
    return {
      active: this.monitoringActive,
      lastCheckTime: this.lastCheckTime,
      lastFullCheckTime: this.lastFullCheckTime,
      totalProducts: this.trackedProducts.size,
      threshold: this.stockThreshold,
      checkInterval: this.checkInterval,
      lowStockProducts: syncedLowStockProducts,
      scanInfo: this.lastScanInfo // NUEVO: Información del scan por lotes
    };
  }

  /**
   * MEJORADO: Método para debugging - mostrar estado interno con SKU y enlaces
   */
  debugCurrentState() {
    logger.info('🐛 DEBUG - Estado interno del monitor:');
    logger.info(`   Productos rastreados: ${this.trackedProducts.size}`);
    logger.info(`   Productos con stock bajo: ${this.lowStockProducts.length}`);
    
    // Mostrar cada producto con detalles completos
    this.trackedProducts.forEach((product, id) => {
      const inLowStock = this.lowStockProducts.find(p => p.id === id);
      const status = inLowStock ? '(EN LISTA STOCK BAJO)' : '';
      const sku = product.seller_sku ? `SKU: ${product.seller_sku}` : 'Sin SKU';
      const link = product.permalink || product.getProductUrl();
      
      logger.info(`   - ${product.title}: ${product.available_quantity} unidades - ${sku} ${status}`);
      logger.info(`     URL: ${link}`);
      
      // Validar consistencia de enlaces
      if (product.permalink) {
        const generated = product.getProductUrl();
        if (product.permalink !== generated) {
          logger.warn(`     ⚠️ DIFERENCIA: Real: ${product.permalink}, Generado: ${generated}`);
        }
      }
    });
    
    // Mostrar lista de stock bajo con detalles
    logger.info('📋 Lista actual de stock bajo:');
    this.lowStockProducts.forEach(p => {
      logger.info(`   - ${p.title}: ${p.stock} unidades - SKU: ${p.seller_sku || 'Sin SKU'}`);
      logger.info(`     URL: ${p.permalink || p.productUrl}`);
    });
    
    // Estadísticas de calidad de datos
    const withPermalink = Array.from(this.trackedProducts.values()).filter(p => p.permalink).length;
    const withSKU = Array.from(this.trackedProducts.values()).filter(p => p.seller_sku).length;
    const total = this.trackedProducts.size;
    
    logger.info(`📊 Calidad de datos:`);
    logger.info(`   Con Permalink: ${withPermalink}/${total} (${Math.round(withPermalink/total*100)}%)`);
    logger.info(`   Con SKU: ${withSKU}/${total} (${Math.round(withSKU/total*100)}%)`);
  }

  /**
   * NUEVO: Genera URL de producto correcta basada en ID
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
   * NUEVO: Función para debuggear datos específicos de productos
   */
  async debugProductData() {
    try {
      logger.info('🐛 Iniciando debugging detallado de datos de productos...');
      
      const debugResult = await products.debugProductsData();
      
      // Log local adicional
      logger.info('🔍 ANÁLISIS LOCAL DE PRODUCTOS TRACKEADOS:');
      
      this.trackedProducts.forEach((product, id) => {
        logger.info(`📦 ${id}:`);
        logger.info(`   Título: ${product.title}`);
        logger.info(`   Stock: ${product.available_quantity}`);
        logger.info(`   SKU: ${product.seller_sku || 'Sin SKU'}`);
        logger.info(`   Permalink: ${product.permalink || 'No disponible'}`);
        logger.info(`   URL generada: ${product.getProductUrl()}`);
        logger.info(`   Enlaces coinciden: ${product.permalink === product.getProductUrl()}`);
      });
      
      return debugResult;
      
    } catch (error) {
      logger.error(`❌ Error en debugging de datos: ${error.message}`);
      throw error;
    }
  }
}

module.exports = new StockMonitor();