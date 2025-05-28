require('dotenv').config();
const cryptoHelper = require('../src/utils/cryptoHelper');

/**
 * Configuración específica para desarrollo local
 * Este archivo permite probar la aplicación localmente con configuraciones de prueba
 */

/**
 * Obtiene un valor de entorno, descifrándolo si es necesario
 * @param {string} key - Clave del valor de entorno
 * @param {*} defaultValue - Valor por defecto si no existe
 * @param {boolean} encrypted - Indica si el valor está cifrado
 * @returns {*} Valor de entorno (descifrado si es necesario)
 */
function getEnvValue(key, defaultValue = undefined, encrypted = false) {
  const value = process.env[key];
  
  if (value === undefined) {
    return defaultValue;
  }
  
  if (encrypted && cryptoHelper.isEncrypted(value)) {
    try {
      return cryptoHelper.decrypt(value);
    } catch (error) {
      console.warn(`No se pudo descifrar ${key}, usando valor sin cifrar`);
      return value;
    }
  }
  
  return value;
}

// Configuración para modo de desarrollo local
const isDevelopment = process.env.NODE_ENV === 'development';

module.exports = {
  app: {
    port: parseInt(getEnvValue('PORT', 3000)),
    environment: getEnvValue('NODE_ENV', 'development'),
    logLevel: getEnvValue('LOG_LEVEL', 'debug'),
    isDevelopment: isDevelopment
  },
  mercadolibre: {
    clientId: getEnvValue('ML_CLIENT_ID', '', true),
    clientSecret: getEnvValue('ML_CLIENT_SECRET', '', true),
    redirectUri: getEnvValue('ML_REDIRECT_URI', 'http://localhost:3000/auth/callback'),
    apiBaseUrl: 'https://api.mercadolibre.com',
    // Configuración para testing
    mockApi: getEnvValue('MOCK_ML_API', 'false') === 'true'
  },
  monitoring: {
    stockCheckInterval: parseInt(getEnvValue('STOCK_CHECK_INTERVAL', 60000)), // 1 minuto para desarrollo
    stockThreshold: parseInt(getEnvValue('STOCK_THRESHOLD', 5))
  },
  notification: {
    method: getEnvValue('NOTIFICATION_METHOD', 'console'),
    email: {
      service: getEnvValue('EMAIL_SERVICE'),
      user: getEnvValue('EMAIL_USER'),
      password: getEnvValue('EMAIL_PASSWORD', '', true)
    },
    telegram: {
      botToken: getEnvValue('TELEGRAM_BOT_TOKEN', '', true),
      chatId: getEnvValue('TELEGRAM_CHAT_ID')
    }
  },
  testing: {
    enableMocks: getEnvValue('ENABLE_MOCKS', 'false') === 'true',
    mockProducts: getEnvValue('MOCK_PRODUCTS', 'true') === 'true',
    logRequests: getEnvValue('LOG_REQUESTS', 'true') === 'true'
  }
};