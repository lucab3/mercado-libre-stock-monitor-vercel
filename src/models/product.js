/**
 * Clase para representar un producto de Mercado Libre
 */
class Product {
  /**
   * Crea una instancia de Product
   * @param {Object} data - Datos del producto de la API de Mercado Libre
   */
  constructor(data) {
    this.id = data.id;
    this.title = data.title;
    this.permalink = data.permalink;
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
   * Convierte la API data a una instancia de Product
   * @param {Object} data - Datos del producto de la API
   * @returns {Product} Instancia de Product
   */
  static fromApiData(data) {
    return new Product(data);
  }
}

module.exports = Product;