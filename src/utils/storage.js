/**
 * Módulo para manejo de almacenamiento persistente de tokens
 * Para Railway, implementa una persistencia simple mediante variables de entorno
 * Esto es útil para evitar la pérdida de tokens durante reinicios
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger');

// Ruta del archivo de tokens
const TOKENS_FILE_PATH = path.join(__dirname, '../../.tokens.json');

/**
 * Guarda los tokens en almacenamiento persistente
 * @param {Object} tokens - Tokens a guardar
 */
function saveTokens(tokens) {
  try {
    // Primero intentamos guardar en archivo local (para desarrollo)
    fs.writeFileSync(TOKENS_FILE_PATH, JSON.stringify(tokens, null, 2));
    logger.info('Tokens guardados en archivo local');
    
    // Si estamos en producción, también intentamos guardar en variables de entorno
    if (process.env.NODE_ENV === 'production' && process.env.RAILWAY_STATIC_URL) {
      // En Railway, no se pueden modificar las variables de entorno programáticamente
      // pero podemos mostrar un mensaje para ayudar al operador
      logger.info(`
        ========================================================
        🔄 INFORMACIÓN DE TOKENS (RAILWAY) 🔄
        ========================================================
        
        Railway no permite guardar tokens automáticamente entre reinicios.
        
        Para evitar tener que reautenticar después de cada reinicio, considera:
        
        1. Implementar una base de datos para almacenamiento persistente
        2. O guardar manualmente los siguientes valores como variables de entorno:
        
        ML_ACCESS_TOKEN=${tokens.access_token}
        ML_REFRESH_TOKEN=${tokens.refresh_token}
        ML_TOKEN_EXPIRES_AT=${tokens.expires_at}
        
        ========================================================
      `);
    }
  } catch (error) {
    logger.error(`Error al guardar tokens: ${error.message}`);
    throw error;
  }
}

/**
 * Carga los tokens desde almacenamiento persistente
 * @returns {Object|null} Tokens cargados o null si no existen
 */
function loadTokens() {
  try {
    // Primero intentamos cargar desde variables de entorno (para Railway)
    if (process.env.ML_ACCESS_TOKEN && process.env.ML_REFRESH_TOKEN && process.env.ML_TOKEN_EXPIRES_AT) {
      logger.info('Tokens cargados desde variables de entorno');
      return {
        access_token: process.env.ML_ACCESS_TOKEN,
        refresh_token: process.env.ML_REFRESH_TOKEN,
        expires_at: parseInt(process.env.ML_TOKEN_EXPIRES_AT)
      };
    }
    
    // Si no están en variables de entorno, intentamos cargar desde archivo
    if (fs.existsSync(TOKENS_FILE_PATH)) {
      const data = fs.readFileSync(TOKENS_FILE_PATH, 'utf8');
      logger.info('Tokens cargados desde archivo local');
      return JSON.parse(data);
    }
    
    logger.info('No se encontraron tokens guardados');
    return null;
  } catch (error) {
    logger.error(`Error al cargar tokens: ${error.message}`);
    return null;
  }
}

/**
 * Limpia los tokens guardados
 */
function clearTokens() {
  try {
    // Eliminar archivo de tokens si existe
    if (fs.existsSync(TOKENS_FILE_PATH)) {
      fs.unlinkSync(TOKENS_FILE_PATH);
      logger.info('Archivo de tokens eliminado');
    }
    
    logger.info('Tokens limpiados correctamente');
  } catch (error) {
    logger.error(`Error al limpiar tokens: ${error.message}`);
    throw error;
  }
}

module.exports = {
  saveTokens,
  loadTokens,
  clearTokens
};