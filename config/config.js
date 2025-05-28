require('dotenv').config();

// Inicializar cryptoHelper sin logger para evitar dependencias circulares
let cryptoHelper;
try {
  cryptoHelper = require('../src/utils/cryptoHelper');
} catch (error) {
  console.warn('CryptoHelper no disponible durante inicialización:', error.message);
  cryptoHelper = {
    isEncrypted: () => false,
    decrypt: (value) => value
  };
}

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
  
  if (encrypted && cryptoHelper && cryptoHelper.isEncrypted && cryptoHelper.isEncrypted(value)) {
    try {
      return cryptoHelper.decrypt(value);
    } catch (error) {
      console.warn(`No se pudo descifrar ${key}, usando valor sin cifrar`);
      return value;
    }
  }
  
  return value;
}

module.exports = {
  app: {
    port: parseInt(getEnvValue('PORT', 8080)),
    httpsPort: parseInt(getEnvValue('HTTPS_PORT', 8443)),
    environment: getEnvValue('NODE_ENV', 'development'),
    logLevel: getEnvValue('LOG_LEVEL', 'info')
  },
  mercadolibre: {
    clientId: getEnvValue('ML_CLIENT_ID', '', true),
    clientSecret: getEnvValue('ML_CLIENT_SECRET', '', true),
    redirectUri: getEnvValue('ML_REDIRECT_URI'),
    apiBaseUrl: 'https://api.mercadolibre.com'
  },
  monitoring: {
    stockCheckInterval: parseInt(getEnvValue('STOCK_CHECK_INTERVAL', 900000)), // 15 minutos por defecto
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
  }
};