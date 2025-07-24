/**
 * Mock de la API de Mercado Libre para testing local
 * VERSIÓN MEJORADA: Stock dinámico con cambios automáticos
 */

const logger = require('../utils/logger');

// Productos base expandidos con stock dinámico
const BASE_MOCK_PRODUCTS = [
  {
    id: 'MLM123456789',
    title: 'iPhone 14 Pro Max 256GB Space Black',
    price: 25999,
    currency_id: 'MXN',
    base_stock: 3,
    min_stock: 0,
    max_stock: 8,
    status: 'active',
    permalink: 'https://articulo.mercadolibre.com.mx/MLM-123456789-iphone-14-pro-max',
    thumbnail: 'https://http2.mlstatic.com/D_123456-MLA123456789_123456-I.jpg',
    listing_type_id: 'gold_special',
    category_id: 'MLM1055',
    last_modified: Date.now()
  },
  {
    id: 'MLM987654321',
    title: 'Samsung Galaxy S23 Ultra 512GB',
    price: 22999,
    currency_id: 'MXN',
    base_stock: 12,
    min_stock: 2,
    max_stock: 20,
    status: 'active',
    permalink: 'https://articulo.mercadolibre.com.mx/MLM-987654321-samsung-galaxy-s23',
    thumbnail: 'https://http2.mlstatic.com/D_987654-MLA987654321_987654-I.jpg',
    listing_type_id: 'gold_pro',
    category_id: 'MLM1055',
    last_modified: Date.now()
  },
  {
    id: 'MLM555666777',
    title: 'MacBook Air M2 256GB',
    price: 28999,
    currency_id: 'MXN',
    base_stock: 1,
    min_stock: 0,
    max_stock: 5,
    status: 'active',
    permalink: 'https://articulo.mercadolibre.com.mx/MLM-555666777-macbook-air-m2',
    thumbnail: 'https://http2.mlstatic.com/D_555666-MLA555666777_555666-I.jpg',
    listing_type_id: 'gold_special',
    category_id: 'MLM1648',
    last_modified: Date.now()
  },
  {
    id: 'MLM111222333',
    title: 'PlayStation 5 Standard Edition',
    price: 12999,
    currency_id: 'MXN',
    base_stock: 6,
    min_stock: 0,
    max_stock: 15,
    status: 'active',
    permalink: 'https://articulo.mercadolibre.com.mx/MLM-111222333-playstation-5',
    thumbnail: 'https://http2.mlstatic.com/D_111222-MLA111222333_111222-I.jpg',
    listing_type_id: 'gold_pro',
    category_id: 'MLM1144',
    last_modified: Date.now()
  },
  {
    id: 'MLM999888777',
    title: 'iPad Pro 12.9" M2 WiFi 256GB',
    price: 18999,
    currency_id: 'MXN',
    base_stock: 4,
    min_stock: 0,
    max_stock: 10,
    status: 'active',
    permalink: 'https://articulo.mercadolibre.com.mx/MLM-999888777-ipad-pro-m2',
    thumbnail: 'https://http2.mlstatic.com/D_999888-MLA999888777_999888-I.jpg',
    listing_type_id: 'gold_special',
    category_id: 'MLM1648',
    last_modified: Date.now()
  },
  {
    id: 'MLM444555666',
    title: 'Nintendo Switch OLED 64GB',
    price: 8999,
    currency_id: 'MXN',
    base_stock: 7,
    min_stock: 1,
    max_stock: 12,
    status: 'active',
    permalink: 'https://articulo.mercadolibre.com.mx/MLM-444555666-nintendo-switch-oled',
    thumbnail: 'https://http2.mlstatic.com/D_444555-MLA444555666_444555-I.jpg',
    listing_type_id: 'gold_pro',
    category_id: 'MLM1144',
    last_modified: Date.now()
  },
  {
    id: 'MLM777888999',
    title: 'AirPods Pro 2da Generación',
    price: 4999,
    currency_id: 'MXN',
    base_stock: 15,
    min_stock: 3,
    max_stock: 25,
    status: 'active',
    permalink: 'https://articulo.mercadolibre.com.mx/MLM-777888999-airpods-pro-2gen',
    thumbnail: 'https://http2.mlstatic.com/D_777888-MLA777888999_777888-I.jpg',
    listing_type_id: 'gold_special',
    category_id: 'MLM1051',
    last_modified: Date.now()
  },
  {
    id: 'MLM222333444',
    title: 'MacBook Pro 14" M2 Pro 512GB',
    price: 45999,
    currency_id: 'MXN',
    base_stock: 2,
    min_stock: 0,
    max_stock: 6,
    status: 'active',
    permalink: 'https://articulo.mercadolibre.com.mx/MLM-222333444-macbook-pro-14-m2',
    thumbnail: 'https://http2.mlstatic.com/D_222333-MLA222333444_222333-I.jpg',
    listing_type_id: 'gold_special',
    category_id: 'MLM1648',
    last_modified: Date.now()
  },
  {
    id: 'MLM666777888',
    title: 'Apple Watch Series 9 45mm GPS',
    price: 8499,
    currency_id: 'MXN',
    base_stock: 9,
    min_stock: 2,
    max_stock: 18,
    status: 'active',
    permalink: 'https://articulo.mercadolibre.com.mx/MLM-666777888-apple-watch-s9',
    thumbnail: 'https://http2.mlstatic.com/D_666777-MLA666777888_666777-I.jpg',
    listing_type_id: 'gold_pro',
    category_id: 'MLM1051',
    last_modified: Date.now()
  },
  {
    id: 'MLM333444555',
    title: 'Xbox Series X 1TB',
    price: 13999,
    currency_id: 'MXN',
    base_stock: 5,
    min_stock: 0,
    max_stock: 10,
    status: 'active',
    permalink: 'https://articulo.mercadolibre.com.mx/MLM-333444555-xbox-series-x',
    thumbnail: 'https://http2.mlstatic.com/D_333444-MLA333444555_333444-I.jpg',
    listing_type_id: 'gold_pro',
    category_id: 'MLM1144',
    last_modified: Date.now()
  },
  {
    id: 'MLM888999000',
    title: 'Samsung 65" QLED 4K Smart TV',
    price: 19999,
    currency_id: 'MXN',
    base_stock: 3,
    min_stock: 0,
    max_stock: 8,
    status: 'active',
    permalink: 'https://articulo.mercadolibre.com.mx/MLM-888999000-samsung-65-qled',
    thumbnail: 'https://http2.mlstatic.com/D_888999-MLA888999000_888999-I.jpg',
    listing_type_id: 'gold_special',
    category_id: 'MLM1000',
    last_modified: Date.now()
  },
  {
    id: 'MLM101112131',
    title: 'Dyson V15 Detect Aspiradora',
    price: 14999,
    currency_id: 'MXN',
    base_stock: 6,
    min_stock: 1,
    max_stock: 12,
    status: 'active',
    permalink: 'https://articulo.mercadolibre.com.mx/MLM-101112131-dyson-v15',
    thumbnail: 'https://http2.mlstatic.com/D_101112-MLA101112131_101112-I.jpg',
    listing_type_id: 'gold_pro',
    category_id: 'MLM1574',
    last_modified: Date.now()
  }
];

const MOCK_TOKENS = {
  access_token: 'APP_USR-mock-access-token-12345',
  refresh_token: 'TG-mock-refresh-token-67890',
  expires_in: 21600,
  token_type: 'bearer',
  scope: 'offline_access read write'
};

class MockMercadoLibreAPI {
  constructor() {
    this.isAuthenticated = false;
    this.currentTokens = null;
    
    // CLAVE: Caché de productos actual - mantiene consistencia
    this.currentProducts = new Map();
    this.lastUpdateTime = Date.now();
    
    // Configuración para cambios automáticos de stock
    this.autoStockChangeInterval = null;
    this.stockChangeFrequency = 30000; // 30 segundos
    this.maxStockChangePerCycle = 3; // Máximo 3 productos cambian por ciclo
    
    // Inicializar productos con stock base
    this.initializeProducts();
    
    // Iniciar cambios automáticos de stock
    this.startAutoStockChanges();
    
    logger.info('🎭 Mock API de Mercado Libre inicializada con stock dinámico');
    logger.info(`📊 ${this.currentProducts.size} productos con cambios automáticos cada ${this.stockChangeFrequency/1000}s`);
  }

  /**
   * Inicializa los productos con su stock base
   */
  initializeProducts() {
    BASE_MOCK_PRODUCTS.forEach(baseProduct => {
      this.currentProducts.set(baseProduct.id, {
        ...baseProduct,
        available_quantity: baseProduct.base_stock,
        last_updated: Date.now(),
        change_trend: 'stable' // stable, increasing, decreasing
      });
    });
    
    logger.info(`🎭 Mock: ${this.currentProducts.size} productos inicializados con stock dinámico`);
  }

  /**
   * Inicia los cambios automáticos de stock
   */
  startAutoStockChanges() {
    if (this.autoStockChangeInterval) {
      clearInterval(this.autoStockChangeInterval);
    }
    
    this.autoStockChangeInterval = setInterval(() => {
      this.performAutoStockChanges();
    }, this.stockChangeFrequency);
    
    logger.info(`🔄 Cambios automáticos de stock iniciados (cada ${this.stockChangeFrequency/1000}s)`);
  }

  /**
   * Detiene los cambios automáticos de stock
   */
  stopAutoStockChanges() {
    if (this.autoStockChangeInterval) {
      clearInterval(this.autoStockChangeInterval);
      this.autoStockChangeInterval = null;
      logger.info('⏹️ Cambios automáticos de stock detenidos');
    }
  }

  /**
   * Realiza cambios automáticos de stock de forma realista
   */
  performAutoStockChanges() {
    const products = Array.from(this.currentProducts.values());
    const productsToChange = Math.min(
      this.maxStockChangePerCycle, 
      Math.floor(Math.random() * products.length) + 1
    );
    
    // Seleccionar productos aleatorios para cambiar
    const shuffled = products.sort(() => 0.5 - Math.random());
    const selectedProducts = shuffled.slice(0, productsToChange);
    
    let changesCount = 0;
    
    selectedProducts.forEach(product => {
      const currentStock = product.available_quantity;
      const minStock = product.min_stock;
      const maxStock = product.max_stock;
      
      // Determinar tipo de cambio basado en el stock actual y tendencia
      let stockChange = 0;
      let newTrend = product.change_trend;
      
      // Lógica de cambio más realista
      if (currentStock <= minStock + 1) {
        // Si está muy bajo, probabilidad alta de restock
        if (Math.random() < 0.7) {
          stockChange = Math.floor(Math.random() * 5) + 1; // +1 a +5
          newTrend = 'increasing';
        }
      } else if (currentStock >= maxStock - 2) {
        // Si está muy alto, probabilidad de ventas
        if (Math.random() < 0.6) {
          stockChange = -(Math.floor(Math.random() * 3) + 1); // -1 a -3
          newTrend = 'decreasing';
        }
      } else {
        // Stock normal, cambios más variables
        const changeType = Math.random();
        if (changeType < 0.3) {
          stockChange = Math.floor(Math.random() * 3) + 1; // Aumentar
          newTrend = 'increasing';
        } else if (changeType < 0.6) {
          stockChange = -(Math.floor(Math.random() * 2) + 1); // Disminuir
          newTrend = 'decreasing';
        } else {
          newTrend = 'stable'; // Sin cambio
        }
      }
      
      // Aplicar el cambio
      if (stockChange !== 0) {
        const newStock = Math.max(minStock, Math.min(maxStock, currentStock + stockChange));
        
        if (newStock !== currentStock) {
          this.currentProducts.set(product.id, {
            ...product,
            available_quantity: newStock,
            last_updated: Date.now(),
            change_trend: newTrend
          });
          
          changesCount++;
          
          const changeIcon = stockChange > 0 ? '📈' : '📉';
          const trendIcon = newStock <= 5 ? '⚠️' : newStock <= 2 ? '🔴' : '✅';
          
          logger.info(`🎭 ${changeIcon} Stock cambió: ${product.title.substring(0, 30)}... ${currentStock} → ${newStock} ${trendIcon}`);
        }
      }
    });
    
    if (changesCount > 0) {
      logger.info(`🔄 Mock: ${changesCount} productos cambiaron stock automáticamente`);
    }
    
    return changesCount;
  }

  /**
   * Simula la obtención de tokens desde código de autorización
   */
  async getTokensFromCode(code) {
    logger.info(`🎭 Mock: getTokensFromCode con código ${code}`);
    
    await this.simulateDelay(500);
    
    if (!code || code === 'invalid') {
      throw new Error('Código de autorización inválido');
    }
    
    this.currentTokens = {
      ...MOCK_TOKENS,
      expires_at: Date.now() + MOCK_TOKENS.expires_in * 1000
    };
    
    this.isAuthenticated = true;
    
    logger.info('🎭 Mock: Tokens obtenidos exitosamente');
    return this.currentTokens;
  }

  /**
   * Simula el refresh de tokens
   */
  async refreshAccessToken(refreshToken) {
    logger.info('🎭 Mock: refreshAccessToken');
    
    await this.simulateDelay(300);
    
    if (!this.isAuthenticated) {
      throw new Error('No hay sesión activa');
    }
    
    this.currentTokens = {
      ...MOCK_TOKENS,
      access_token: `APP_USR-mock-refreshed-token-${Date.now()}`,
      expires_at: Date.now() + MOCK_TOKENS.expires_in * 1000
    };
    
    logger.info('🎭 Mock: Tokens refrescados exitosamente');
    return this.currentTokens;
  }

  /**
   * Simula obtener información del usuario
   */
  async getUser() {
    logger.info('🎭 Mock: getUser');
    
    await this.simulateDelay(200);
    
    if (!this.isAuthenticated) {
      throw new Error('No autenticado');
    }
    
    return {
      id: '123456789',
      nickname: 'USUARIO_TEST',
      email: 'test@example.com',
      first_name: 'Usuario',
      last_name: 'Prueba'
    };
  }

  /**
   * Simula obtener lista de productos del usuario
   */
  async getUserProducts(userId, offset = 0, limit = 50) {
    logger.info(`🎭 Mock: getUserProducts para usuario ${userId}, offset: ${offset}, limit: ${limit}`);
    
    await this.simulateDelay(800);
    
    if (!this.isAuthenticated) {
      throw new Error('No autenticado');
    }
    
    const productIds = Array.from(this.currentProducts.keys());
    const startIndex = offset;
    const endIndex = Math.min(startIndex + limit, productIds.length);
    const results = productIds.slice(startIndex, endIndex);
    
    return {
      results: results,
      paging: {
        total: productIds.length,
        offset: offset,
        limit: limit
      }
    };
  }

  /**
   * Simula obtener detalles de un producto
   * MEJORADO: Devuelve datos consistentes del caché actual
   */
  async getProduct(productId) {
    logger.info(`🎭 Mock: getProduct ${productId}`);
    
    await this.simulateDelay(300);
    
    const product = this.currentProducts.get(productId);
    
    if (!product) {
      throw new Error(`Producto ${productId} no encontrado`);
    }
    
    // IMPORTANTE: Devolver exactamente los datos del caché actual
    const currentProduct = {
      ...product,
      last_fetched: Date.now()
    };
    
    logger.info(`🎭 Mock: Producto ${productId} stock actual: ${currentProduct.available_quantity} (${currentProduct.change_trend})`);
    return currentProduct;
  }

  /**
   * Simula actualizar stock de un producto
   */
  async updateProductStock(productId, quantity) {
    logger.info(`🎭 Mock: updateProductStock ${productId} con cantidad ${quantity}`);
    
    await this.simulateDelay(400);
    
    const product = this.currentProducts.get(productId);
    
    if (!product) {
      throw new Error(`Producto ${productId} no encontrado`);
    }
    
    // Actualizar stock en el caché
    this.currentProducts.set(productId, {
      ...product,
      available_quantity: quantity,
      last_updated: Date.now(),
      change_trend: 'manual'
    });
    
    logger.info(`🎭 Mock: Stock actualizado para ${productId}: ${quantity} unidades`);
    return {
      id: productId,
      available_quantity: quantity,
      status: 'updated',
      last_updated: Date.now()
    };
  }

  /**
   * Obtiene el estado actual de todos los productos (para debugging)
   */
  getCurrentStockStatus() {
    const status = {};
    this.currentProducts.forEach((product, id) => {
      status[id] = {
        title: product.title,
        stock: product.available_quantity,
        trend: product.change_trend,
        last_updated: product.last_updated
      };
    });
    return status;
  }

  /**
   * Fuerza cambios de stock para algunos productos (para testing manual)
   */
  triggerStockChanges() {
    logger.info('🎭 Forzando cambios de stock para testing...');
    return this.performAutoStockChanges();
  }

  /**
   * Simula delay de red para testing realista
   */
  async simulateDelay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Obtiene todos los productos mock actuales
   */
  getMockProducts() {
    return Array.from(this.currentProducts.values());
  }

  /**
   * Reinicia el estado del mock
   */
  reset() {
    this.isAuthenticated = false;
    this.currentTokens = null;
    this.stopAutoStockChanges();
    this.initializeProducts(); // Reinicializar con stock base
    this.startAutoStockChanges(); // Reiniciar cambios automáticos
    logger.info('🎭 Mock API reiniciada con stock dinámico');
  }

  /**
   * Fuerza una actualización de stock para testing
   */
  forceStockUpdate(productId, newStock) {
    const product = this.currentProducts.get(productId);
    if (product) {
      this.currentProducts.set(productId, {
        ...product,
        available_quantity: newStock,
        last_updated: Date.now(),
        change_trend: 'manual'
      });
      logger.info(`🎭 Mock: Stock forzado para ${productId}: ${newStock} unidades`);
      return true;
    }
    return false;
  }

  /**
   * Obtiene estadísticas de cambios de stock
   */
  getStockChangeStats() {
    const products = Array.from(this.currentProducts.values());
    return {
      totalProducts: products.length,
      lowStock: products.filter(p => p.available_quantity <= 5).length,
      outOfStock: products.filter(p => p.available_quantity === 0).length,
      increasing: products.filter(p => p.change_trend === 'increasing').length,
      decreasing: products.filter(p => p.change_trend === 'decreasing').length,
      stable: products.filter(p => p.change_trend === 'stable').length,
      autoChangeInterval: this.stockChangeFrequency / 1000,
      lastUpdate: this.lastUpdateTime
    };
  }

  /**
   * Configura la frecuencia de cambios automáticos
   */
  setStockChangeFrequency(seconds) {
    this.stockChangeFrequency = seconds * 1000;
    this.stopAutoStockChanges();
    this.startAutoStockChanges();
    logger.info(`🎭 Mock: Frecuencia de cambios actualizada a ${seconds}s`);
  }
}

module.exports = new MockMercadoLibreAPI();