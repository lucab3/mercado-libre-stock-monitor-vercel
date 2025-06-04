/**
 * Clase para representar un producto de Mercado Libre
 * ACTUALIZADA: Con soporte completo para permalinks y SKU, URLs corregidas
 */
class Product {
  /**
   * Crea una instancia de Product
   * @param {Object} data - Datos del producto de la API de Mercado Libre
   */
  constructor(data) {
    this.id = data.id;
    this.title = data.title;
    this.permalink = data.permalink; // Enlace directo al producto en ML
    this.seller_sku = data.seller_sku || null; // NUEVO: SKU del vendedor
    this.price = data.price;
    this.currency_id = data.currency_id;
    this.available_quantity = data.available_quantity;
    this.status = data.status;
    this.listing_type_id = data.listing_type_id;
    this.category_id = data.category_id;
    this.thumbnail = data.thumbnail;
    this.lastAlertSent = null;
    
    // NUEVO: Validación de datos en constructor
    this.validateData();
  }

  /**
   * NUEVO: Valida que los datos del producto sean correctos
   */
  validateData() {
    if (!this.id) {
      console.warn(`⚠️ Producto sin ID válido:`, this);
    }
    
    if (typeof this.available_quantity !== 'number') {
      console.warn(`⚠️ Producto ${this.id} sin stock numérico válido:`, this.available_quantity);
    }
    
    if (!this.title) {
      console.warn(`⚠️ Producto ${this.id} sin título válido:`, this.title);
    }
  }

  /**
   * Verifica si el producto tiene stock bajo (incluyendo stock = 0)
   * @param {number} threshold - Umbral de stock bajo
   * @returns {boolean} true si el stock es bajo o cero, false en caso contrario
   */
  hasLowStock(threshold) {
    return this.available_quantity <= threshold;
  }

  /**
   * Verifica si el producto está sin stock
   * @returns {boolean} true si no hay stock, false en caso contrario
   */
  isOutOfStock() {
    return this.available_quantity === 0;
  }

  /**
   * Verifica si se debe enviar una alerta para este producto
   * @param {number} threshold - Umbral de stock bajo
   * @param {number} cooldownHours - Horas de espera entre alertas
   * @returns {boolean} true si se debe enviar alerta, false en caso contrario
   */
  shouldSendAlert(threshold, cooldownHours = 24) {
    if (!this.hasLowStock(threshold)) {
      return false;
    }

    // Si nunca se ha enviado una alerta o ha pasado el tiempo de cooldown
    if (!this.lastAlertSent) {
      return true;
    }

    const cooldownMs = cooldownHours * 60 * 60 * 1000;
    return Date.now() - this.lastAlertSent > cooldownMs;
  }

  /**
   * Registra que se ha enviado una alerta
   */
  markAlertSent() {
    this.lastAlertSent = Date.now();
  }

  /**
   * Obtiene el enlace directo al producto en MercadoLibre
   * @returns {string} URL del producto en ML
   */
  getMercadoLibreUrl() {
    return this.permalink;
  }

  /**
   * CORREGIDO: Genera un enlace correcto si no hay permalink
   * @returns {string} URL del producto (permalink o generado correctamente)
   */
  getProductUrl() {
    if (this.permalink) {
      return this.permalink;
    }
    
    return this.generateUrlFromId();
  }

  /**
   * NUEVO: Genera URL basado en el ID del producto con formato correcto
   * @returns {string} URL generada del producto
   */
  generateUrlFromId() {
    if (!this.id) {
      return 'https://mercadolibre.com.ar';
    }

    // Extraer código de país y número de producto
    const countryCode = this.id.substring(0, 3); // MLA, MLM, etc.
    const productNumber = this.id.substring(3); // Todo después del código de país
    
    const countryDomains = {
      'MLA': 'com.ar',
      'MLM': 'com.mx', 
      'MLB': 'com.br',
      'MLC': 'cl',
      'MCO': 'com.co'
    };
    
    const domain = countryDomains[countryCode] || 'com.ar';
    
    // CORREGIDO: Formato correcto con guión entre código de país y número
    return `https://articulo.mercadolibre.${domain}/${countryCode}-${productNumber}`;
  }

  /**
   * NUEVO: Compara el permalink real con el URL generado
   * @returns {Object} Comparación de enlaces
   */
  getLinkComparison() {
    const realLink = this.permalink;
    const generatedLink = this.generateUrlFromId();
    
    return {
      hasPermalink: !!realLink,
      realLink: realLink || null,
      generatedLink: generatedLink,
      linksMatch: realLink === generatedLink,
      shouldUse: realLink || generatedLink
    };
  }

  /**
   * MEJORADO: Información completa del producto incluyendo SKU y enlaces validados
   * @returns {Object} Objeto con toda la información del producto
   */
  getFullInfo() {
    const linkComparison = this.getLinkComparison();
    
    return {
      id: this.id,
      title: this.title,
      seller_sku: this.seller_sku,
      permalink: this.permalink,
      productUrl: this.getProductUrl(),
      linkComparison: linkComparison,
      price: this.price,
      currency_id: this.currency_id,
      available_quantity: this.available_quantity,
      status: this.status,
      hasLowStock: this.hasLowStock(5), // Umbral por defecto
      isOutOfStock: this.isOutOfStock(),
      thumbnail: this.thumbnail,
      lastAlertSent: this.lastAlertSent,
      isValid: this.isValid()
    };
  }

  /**
   * NUEVO: Información específica para debugging de enlaces
   * @returns {Object} Información detallada de enlaces
   */
  getDebugInfo() {
    const linkComparison = this.getLinkComparison();
    
    return {
      id: this.id,
      title: this.title ? this.title.substring(0, 50) + '...' : null,
      seller_sku: this.seller_sku,
      available_quantity: this.available_quantity,
      status: this.status,
      ...linkComparison,
      validation: {
        hasId: !!this.id,
        hasTitle: !!this.title,
        hasSku: !!this.seller_sku,
        hasStock: typeof this.available_quantity === 'number',
        hasPermalink: !!this.permalink,
        isActive: this.status === 'active'
      }
    };
  }

  /**
   * Convierte la API data a una instancia de Product
   * @param {Object} data - Datos del producto de la API
   * @returns {Product} Instancia de Product
   */
  static fromApiData(data) {
    return new Product(data);
  }

  /**
   * Valida que el producto tenga los datos mínimos requeridos
   * @returns {boolean} true si el producto es válido
   */
  isValid() {
    return !!(this.id && this.title && typeof this.available_quantity === 'number');
  }

  /**
   * MEJORADO: Información para logging con SKU y enlaces
   * @returns {string} String informativo del producto
   */
  toString() {
    const sku = this.seller_sku ? ` SKU:${this.seller_sku}` : '';
    const link = this.permalink ? ' [Con Permalink]' : ' [Generado]';
    return `Product(${this.id}: "${this.title}"${sku} - ${this.available_quantity} units${link})`;
  }

  /**
   * NUEVO: Información completa para alertas incluyendo SKU
   * @returns {Object} Datos para sistema de alertas
   */
  getAlertData() {
    return {
      id: this.id,
      title: this.title,
      seller_sku: this.seller_sku,
      available_quantity: this.available_quantity,
      price: this.price,
      currency_id: this.currency_id,
      permalink: this.getProductUrl(), // Usar el mejor enlace disponible
      isOutOfStock: this.isOutOfStock(),
      stockLevel: this.available_quantity === 0 ? 'empty' : 
                  this.available_quantity <= 2 ? 'critical' : 'low'
    };
  }

  /**
   * NUEVO: Método para actualizar stock preservando otros datos
   * @param {number} newStock - Nuevo valor de stock
   */
  updateStock(newStock) {
    if (typeof newStock === 'number' && newStock >= 0) {
      this.available_quantity = newStock;
      // Reset de alertas si el stock vuelve a niveles normales
      if (newStock > 5) {
        this.lastAlertSent = null;
      }
    } else {
      console.warn(`⚠️ Intento de actualizar stock con valor inválido: ${newStock}`);
    }
  }

  /**
   * NUEVO: Compara este producto con otro para detectar cambios
   * @param {Product} otherProduct - Otro producto para comparar
   * @returns {Object} Diferencias detectadas
   */
  compareWith(otherProduct) {
    if (!otherProduct || this.id !== otherProduct.id) {
      return { error: 'Productos no comparables' };
    }

    const changes = {};
    
    if (this.available_quantity !== otherProduct.available_quantity) {
      changes.stock = {
        old: otherProduct.available_quantity,
        new: this.available_quantity,
        difference: this.available_quantity - otherProduct.available_quantity
      };
    }
    
    if (this.price !== otherProduct.price) {
      changes.price = {
        old: otherProduct.price,
        new: this.price
      };
    }
    
    if (this.title !== otherProduct.title) {
      changes.title = {
        old: otherProduct.title,
        new: this.title
      };
    }

    return {
      hasChanges: Object.keys(changes).length > 0,
      changes,
      comparedAt: new Date().toISOString()
    };
  }
}

module.exports = Product;