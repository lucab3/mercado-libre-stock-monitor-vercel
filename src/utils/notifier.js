const nodemailer = require('nodemailer');
const axios = require('axios');
const config = require('../../config/config');
const logger = require('./logger');

class Notifier {
  constructor() {
    this.method = config.notification.method;
    
    // Configurar transporter para email si es necesario
    if (this.method === 'email') {
      this.transporter = nodemailer.createTransport({
        service: config.notification.email.service,
        auth: {
          user: config.notification.email.user,
          pass: config.notification.email.password
        }
      });
    }
  }

  /**
   * Envía una notificación sobre stock bajo
   * @param {Object} product - Objeto producto con la información
   * @returns {Promise<void>}
   */
  async sendLowStockAlert(product) {
    const message = `¡ALERTA DE STOCK BAJO! El producto "${product.title}" (ID: ${product.id}) tiene solo ${product.available_quantity} unidades disponibles.`;
    
    switch (this.method) {
      case 'email':
        return this.sendEmail(message, product);
      case 'telegram':
        return this.sendTelegram(message);
      case 'console':
      default:
        return this.sendConsole(message);
    }
  }

  /**
   * Envía una notificación por consola
   * @param {string} message - Mensaje a enviar
   * @returns {Promise<void>}
   */
  async sendConsole(message) {
    logger.warn(`NOTIFICACIÓN: ${message}`);
    console.log('\x1b[33m%s\x1b[0m', `NOTIFICACIÓN: ${message}`);
    return Promise.resolve();
  }

  /**
   * Envía una notificación por email
   * @param {string} message - Mensaje a enviar
   * @param {Object} product - Objeto producto con la información
   * @returns {Promise<void>}
   */
  async sendEmail(message, product) {
    try {
      const mailOptions = {
        from: config.notification.email.user,
        to: config.notification.email.user,
        subject: '🚨 Alerta de Stock Bajo en Mercado Libre',
        html: `
          <h2>Alerta de Stock Bajo</h2>
          <p>${message}</p>
          <p><strong>Detalles del producto:</strong></p>
          <ul>
            <li><strong>ID:</strong> ${product.id}</li>
            <li><strong>Título:</strong> ${product.title}</li>
            <li><strong>Stock actual:</strong> ${product.available_quantity}</li>
            <li><strong>Precio:</strong> ${product.price} ${product.currency_id}</li>
            <li><strong>Link:</strong> <a href="${product.permalink}">${product.permalink}</a></li>
          </ul>
          <p>Por favor, actualiza el inventario lo antes posible.</p>
        `
      };

      await this.transporter.sendMail(mailOptions);
      logger.info(`Email de alerta enviado para el producto ${product.id}`);
    } catch (error) {
      logger.error(`Error al enviar email: ${error.message}`);
      throw error;
    }
  }

  /**
   * Envía una notificación por Telegram
   * @param {string} message - Mensaje a enviar
   * @returns {Promise<void>}
   */
  async sendTelegram(message) {
    try {
      const telegramUrl = `https://api.telegram.org/bot${config.notification.telegram.botToken}/sendMessage`;
      await axios.post(telegramUrl, {
        chat_id: config.notification.telegram.chatId,
        text: message,
        parse_mode: 'HTML'
      });
      logger.info('Mensaje de Telegram enviado');
    } catch (error) {
      logger.error(`Error al enviar mensaje de Telegram: ${error.message}`);
      throw error;
    }
  }
}

module.exports = new Notifier();