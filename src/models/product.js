/**
 * Clase para representar un producto de Mercado Libre
 * ACTUALIZADA: Con soporte completo para permalinks
 */
class Product {
  /**
   * Crea una instancia de Product
   * @param {Object} data - Datos del producto de la API de Mercado Libre
   */
  constructor(data) {
    this.id = data.id;
    this.title = data.title;
    this.permalink = data.permalink; // NUEVO: Enlace directo al producto en ML
    this.price = data.price;
    this.currency_id = data.currency_id;
    this.available_quantity = data.available_quantity;
    this.status = data.status;
    this.listing_type_id = data.listing_type_id;
    this.category_id = data.category_id;
    this.thumbnail = data.thumbnail;
    this.lastAlertSent = null;
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
   * NUEVO: Obtiene el enlace directo al producto en MercadoLibre
   * @returns {string} URL del producto en ML
   */
  getMercadoLibreUrl() {
    return this.permalink;
  }

  /**
   * NUEVO: Genera un enlace genérico si no hay permalink
   * @returns {string} URL del producto (permalink o generado)
   */
  getProductUrl() {
    if (this.permalink) {
      return this.permalink;
    }
    
    // Generar URL basado en el ID (formato argentino por defecto)
    const countryCode = this.id.substring(0, 3); // MLM, MLA, etc.
    const countryDomains = {
      'MLA': 'com.ar',
      'MLM': 'com.mx', 
      'MLB': 'com.br',
      'MLC': 'cl',
      'MCO': 'com.co'
    };
    
    const domain = countryDomains[countryCode] || 'com.ar';
    return `https://articulo.mercadolibre.${domain}/${this.id}`;
  }

  /**
   * NUEVO: Información completa del producto incluyendo enlaces
   * @returns {Object} Objeto con toda la información del producto
   */
  getFullInfo() {
    return {
      id: this.id,
      title: this.title,
      permalink: this.permalink,
      productUrl: this.getProductUrl(),
      price: this.price,
      currency_id: this.currency_id,
      available_quantity: this.available_quantity,
      status: this.status,
      hasLowStock: this.hasLowStock(5), // Umbral por defecto
      isOutOfStock: this.isOutOfStock(),
      thumbnail: this.thumbnail,
      lastAlertSent: this.lastAlertSent
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
   * NUEVO: Valida que el producto tenga los datos mínimos requeridos
   * @returns {boolean} true si el producto es válido
   */
  isValid() {
    return !!(this.id && this.title && typeof this.available_quantity === 'number');
  }

  /**
   * NUEVO: Información para logging (sin datos sensibles)
   * @returns {string} String informativo del producto
   */
  toString() {
    return `Product(${this.id}: "${this.title}" - ${this.available_quantity} units)`;
  }
}

module.exports = Product;