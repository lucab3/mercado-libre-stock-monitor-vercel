/**
 * Módulo para manejo de almacenamiento persistente de tokens
 * ARREGLADO PARA VERCEL - No intenta escribir archivos en filesystem de solo lectura
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger');

// Ruta del archivo de tokens (solo para desarrollo local)
const TOKENS_FILE_PATH = path.join(__dirname, '../../.tokens.json');

// DEPRECADO: Usar tokenManager en lugar de este sistema
const tokenManager = require('./tokenManager');

/**
 * @deprecated Usar tokenManager.saveTokens(userId, tokens) en su lugar
 * Guarda los tokens en almacenamiento persistente
 * ARREGLADO: En Vercel usa memoria, en desarrollo local usa archivos
 * @param {Object} tokens - Tokens a guardar
 * @param {string} userId - ID del usuario (requerido para nuevo sistema)
 */
function saveTokens(tokens, userId = null) {
  try {
    // NUEVO: Usar tokenManager si se proporciona userId
    if (userId) {
      return tokenManager.saveTokens(userId, tokens);
    }
    
    // DEPRECADO: Sistema antiguo para compatibilidad
    logger.warn('⚠️ saveTokens() sin userId está deprecado. Usar tokenManager.saveTokens(userId, tokens)');
    
    // En Vercel, guardar en memoria (temporal durante la sesión) - SOLO para compatibilidad
    if (process.env.VERCEL) {
      // Sistema legacy compartido (problemático)
      logger.warn('🚨 Usando almacenamiento legacy compartido - puede causar conflictos entre usuarios');
      tokenManager.saveTokens('legacy', tokens, { isLegacy: true });
      logger.info('Tokens guardados en memoria (Vercel)');
      
      // Mostrar mensaje informativo para producción
      logger.info(`
        💡 INFORMACIÓN IMPORTANTE (VERCEL):
        Los tokens se almacenan temporalmente en memoria.
        Si necesitas persistencia entre reinicios, considera:
        1. Usar una base de datos (Redis, MongoDB, etc.)
        2. O agregar los tokens como variables de entorno en Vercel Dashboard
      `);
      
      return;
    }
    
    // En desarrollo local, guardar en archivo
    fs.writeFileSync(TOKENS_FILE_PATH, JSON.stringify(tokens, null, 2));
    logger.info('Tokens guardados en archivo local');
    
  } catch (error) {
    logger.error(`Error al guardar tokens: ${error.message}`);
    
    // En caso de error, al menos guardar en memoria
    if (!memoryTokenStorage) {
      memoryTokenStorage = tokens;
      logger.warn('Tokens guardados en memoria como fallback');
    }
    
    throw error;
  }
}

/**
 * @deprecated Usar tokenManager.getTokens(userId) en su lugar
 * Carga los tokens desde almacenamiento persistente
 * ARREGLADO: Prioriza variables de entorno, luego memoria, luego archivos
 * @param {string} userId - ID del usuario (requerido para nuevo sistema)
 * @returns {Object|null} Tokens cargados o null si no existen
 */
function loadTokens(userId = null) {
  try {
    // NUEVO: Usar tokenManager si se proporciona userId
    if (userId) {
      return tokenManager.getTokens(userId);
    }
    
    // DEPRECADO: Sistema antiguo para compatibilidad
    logger.warn('⚠️ loadTokens() sin userId está deprecado. Usar tokenManager.getTokens(userId)');
    
    // 1. PRIMERO: Intentar cargar desde variables de entorno (para persistencia en Vercel)
    if (process.env.ML_ACCESS_TOKEN && process.env.ML_REFRESH_TOKEN && process.env.ML_TOKEN_EXPIRES_AT) {
      logger.info('Tokens cargados desde variables de entorno');
      return {
        access_token: process.env.ML_ACCESS_TOKEN,
        refresh_token: process.env.ML_REFRESH_TOKEN,
        expires_at: parseInt(process.env.ML_TOKEN_EXPIRES_AT)
      };
    }
    
    // 2. SEGUNDO: Intentar desde tokenManager legacy
    const legacyTokens = tokenManager.getTokens('legacy');
    if (legacyTokens) {
      logger.info('Tokens cargados desde tokenManager legacy');
      return legacyTokens;
    }
    
    // 3. TERCERO: En desarrollo local, intentar cargar desde archivo
    if (!process.env.VERCEL && fs.existsSync(TOKENS_FILE_PATH)) {
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
 * ARREGLADO: En Vercel limpia memoria, en desarrollo local limpia archivos
 */
function clearTokens() {
  try {
    // En Vercel, limpiar memoria
    if (process.env.VERCEL) {
      memoryTokenStorage = null;
      logger.info('Tokens limpiados de memoria (Vercel)');
      return;
    }
    
    // En desarrollo local, eliminar archivo
    if (fs.existsSync(TOKENS_FILE_PATH)) {
      fs.unlinkSync(TOKENS_FILE_PATH);
      logger.info('Archivo de tokens eliminado');
    }
    
    // También limpiar memoria como medida adicional
    memoryTokenStorage = null;
    
    logger.info('Tokens limpiados correctamente');
  } catch (error) {
    logger.error(`Error al limpiar tokens: ${error.message}`);
    
    // Al menos limpiar memoria
    memoryTokenStorage = null;
    throw error;
  }
}

/**
 * NUEVO: Función para obtener información sobre el almacenamiento actual
 * @returns {Object} Información sobre el tipo de almacenamiento usado
 */
function getStorageInfo() {
  if (process.env.VERCEL) {
    return {
      type: 'memory',
      persistent: false,
      hasTokens: memoryTokenStorage !== null,
      message: 'Almacenamiento temporal en memoria (Vercel)'
    };
  } else {
    return {
      type: 'file',
      persistent: true,
      hasTokens: fs.existsSync(TOKENS_FILE_PATH),
      message: 'Almacenamiento persistente en archivo (desarrollo local)'
    };
  }
}

module.exports = {
  saveTokens,
  loadTokens,
  clearTokens,
  getStorageInfo
};
