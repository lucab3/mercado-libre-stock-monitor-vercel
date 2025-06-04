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
    this.lastFullCheckTime = null; // Para tracking de verificaciones completas
    this.autoCheckTimeout = null;
    this.lowStockProducts = []; // Mantener lista persistente de productos con stock bajo
    
    // NUEVO: Cache de último estado conocido para consistencia
    this.lastKnownStockState = new Map();
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
   * Actualiza la lista de productos monitoreados
   * MEJORADO: Mantiene consistencia de datos CON PERMALINKS
   */
  async refreshProductList() {
    try {
      logger.info('Actualizando lista de productos...');
      
      const productIds = await products.getAllProducts();
      
      if (productIds.length === 0) {
        logger.info('No se encontraron productos para monitorear');
        this.trackedProducts.clear();
        this.lastKnownStockState.clear();
        return;
      }
      
      // CLAVE: Obtener todos los detalles en una sola operación
      const productDetails = [];
      for (const id of productIds) {
        try {
          const productData = await products.getProduct(id);
          productDetails.push(productData);
        } catch (error) {
          logger.error(`Error obteniendo producto ${id}: ${error.message}`);
        }
      }
      
      // Actualizar both trackedProducts y lastKnownStockState
      this.trackedProducts.clear();
      
      productDetails.forEach(productData => {
        const product = Product.fromApiData(productData);
        
        // Mantener el producto actual
        this.trackedProducts.set(product.id, product);
        
        // NUEVO: Actualizar estado conocido para consistencia CON PERMALINK
        this.lastKnownStockState.set(product.id, {
          stock: product.available_quantity,
          timestamp: Date.now(),
          title: product.title,
          permalink: product.permalink // NUEVO: Incluir enlace
        });
        
        logger.info(`🔄 Producto ${product.id}: ${product.available_quantity} unidades (${product.title}) - ${product.permalink}`);
      });
      
      logger.info(`Lista de productos actualizada. Monitoreando ${this.trackedProducts.size} productos`);
      this.lastFullCheckTime = Date.now();
      
    } catch (error) {
      logger.error(`Error al actualizar lista de productos: ${error.message}`);
      throw error;
    }
  }

  /**
   * Verifica el stock de todos los productos monitoreados
   * MEJORADO: Datos consistentes y sincronizados CON PERMALINKS
   */
  async checkStock() {
    try {
      logger.info('🔍 Verificando stock de productos...');
      
      this.lastCheckTime = Date.now();
      
      // Refrescar datos ANTES de cualquier análisis
      await this.refreshProductList();
      
      let lowStockCount = 0;
      const alertsToSend = [];
      const currentLowStockProducts = [];
      
      // Verificar cada producto usando datos consistentes
      for (const [id, product] of this.trackedProducts.entries()) {
        const hasLowStock = product.hasLowStock(this.stockThreshold);
        
        logger.info(`📦 ${product.title} (${id}): ${product.available_quantity} unidades - ${hasLowStock ? '⚠️ STOCK BAJO' : '✅ OK'}`);
        
        if (hasLowStock) {
          // Usar datos DIRECTOS del producto, no del caché anterior
          const productInfo = {
            id: product.id,
            title: product.title,
            stock: product.available_quantity, // Dato DIRECTO de la API
            permalink: product.permalink, // NUEVO: Incluir enlace
            hasLowStock: true,
            timestamp: Date.now()
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
      
      // Debug: Mostrar estado actual
      logger.info(`📊 Estado actual de stock:`);
      this.lowStockProducts.forEach(p => {
        logger.info(`   - ${p.title}: ${p.stock} unidades - ${p.permalink}`);
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
          permalink: p.permalink, // NUEVO: Incluir enlace
          hasLowStock: p.hasLowStock(this.stockThreshold)
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
   * Verifica el stock de un producto específico
   * MEJORADO: Sincronización inmediata con estado global CON PERMALINKS
   */
  async checkProductStock(productId) {
    try {
      logger.info(`🔍 Verificando stock del producto ${productId}...`);
      
      // Obtener datos FRESH directamente de la API
      const productData = await products.getProduct(productId);
      const product = Product.fromApiData(productData);
      
      // Actualizar inmediatamente en trackedProducts
      this.trackedProducts.set(product.id, product);
      
      // Actualizar estado conocido
      this.lastKnownStockState.set(product.id, {
        stock: product.available_quantity,
        timestamp: Date.now(),
        title: product.title,
        permalink: product.permalink // NUEVO: Incluir enlace
      });
      
      // Actualizar lista de productos con stock bajo
      const existingIndex = this.lowStockProducts.findIndex(p => p.id === productId);
      
      if (product.hasLowStock(this.stockThreshold)) {
        const productInfo = {
          id: product.id,
          title: product.title,
          stock: product.available_quantity, // Dato FRESCO
          permalink: product.permalink, // NUEVO: Incluir enlace
          hasLowStock: true,
          timestamp: Date.now()
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
        
        logger.info(`⚠️ ${product.title}: ${product.available_quantity} unidades (STOCK BAJO) - ${product.permalink}`);
      } else {
        // Remover de lista de stock bajo si ya no aplica
        if (existingIndex >= 0) {
          this.lowStockProducts.splice(existingIndex, 1);
        }
        logger.info(`✅ ${product.title}: ${product.available_quantity} unidades (STOCK SUFICIENTE) - ${product.permalink}`);
      }
      
      return product;
    } catch (error) {
      logger.error(`❌ Error al verificar stock del producto ${productId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtiene el estado actual del monitoreo
   * MEJORADO: Datos sincronizados en tiempo real CON PERMALINKS
   */
  getStatus() {
    // Asegurar que lowStockProducts tiene datos actualizados
    const syncedLowStockProducts = this.lowStockProducts.map(p => {
      // Buscar datos más recientes en trackedProducts
      const trackedProduct = this.trackedProducts.get(p.id);
      if (trackedProduct) {
        return {
          id: trackedProduct.id,
          title: trackedProduct.title,
          stock: trackedProduct.available_quantity, // Dato sincronizado
          permalink: trackedProduct.permalink // NUEVO: Enlace sincronizado
        };
      }
      return {
        id: p.id,
        title: p.title,
        stock: p.stock,
        permalink: p.permalink // NUEVO: Incluir enlace
      };
    });
    
    return {
      active: this.monitoringActive,
      lastCheckTime: this.lastCheckTime,
      lastFullCheckTime: this.lastFullCheckTime,
      totalProducts: this.trackedProducts.size,
      threshold: this.stockThreshold,
      checkInterval: this.checkInterval,
      lowStockProducts: syncedLowStockProducts
    };
  }

  /**
   * NUEVO: Método para debugging - mostrar estado interno CON PERMALINKS
   */
  debugCurrentState() {
    logger.info('🐛 DEBUG - Estado interno del monitor:');
    logger.info(`   Productos rastreados: ${this.trackedProducts.size}`);
    logger.info(`   Productos con stock bajo: ${this.lowStockProducts.length}`);
    
    // Mostrar cada producto
    this.trackedProducts.forEach((product, id) => {
      const inLowStock = this.lowStockProducts.find(p => p.id === id);
      logger.info(`   - ${product.title}: ${product.available_quantity} unidades ${inLowStock ? '(EN LISTA STOCK BAJO)' : ''} - ${product.permalink}`);
    });
    
    // Mostrar lista de stock bajo
    logger.info('📋 Lista actual de stock bajo:');
    this.lowStockProducts.forEach(p => {
      logger.info(`   - ${p.title}: ${p.stock} unidades - ${p.permalink}`);
    });
  }
}

module.exports = new StockMonitor();