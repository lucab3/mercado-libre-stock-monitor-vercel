const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * Clase para el manejo de cifrado y descifrado de datos sensibles
 * MEJORADO: Implementa AES-GCM para integridad y autenticación
 */
class CryptoHelper {
  constructor() {
    this.algorithm = 'aes-256-gcm';
    this.keyDerivationAlgorithm = 'pbkdf2';
    this.keyPath = path.join(__dirname, '../../.secret_key');
    this.ivPath = path.join(__dirname, '../../.secret_iv');
    
    try {
      this.masterKey = this.getOrCreateMasterKey();
    } catch (error) {
      // Usar logger en lugar de console.error
      this.logError('Error al inicializar CryptoHelper', error);
      // Generar clave maestra temporal
      this.masterKey = crypto.randomBytes(32);
    }
  }

  /**
   * Logger seguro que evita exposición de información sensible
   */
  logError(message, error) {
    try {
      const logger = require('./logger');
      logger.error(`${message}: ${error.message}`);
    } catch {
      // Si logger no está disponible, no hacer nada (no usar console)
    }
  }

  /**
   * Obtiene o crea la clave maestra de cifrado
   * MEJORADO: Usa derivación de claves con PBKDF2
   * @returns {Buffer} Clave maestra
   */
  getOrCreateMasterKey() {
    try {
      // 1. Intentar obtener de variables de entorno (VERCEL)
      if (process.env.SECRET_KEY) {
        return Buffer.from(process.env.SECRET_KEY, 'hex');
      }
      
      // 2. Si no estamos en Vercel, intentar archivos
      if (!process.env.VERCEL && fs.existsSync(this.keyPath)) {
        return Buffer.from(fs.readFileSync(this.keyPath, 'utf8'), 'hex');
      }
      
      // 3. Crear una nueva clave maestra
      const key = crypto.randomBytes(32); // 256 bits
      
      // 4. Solo intentar guardar si NO estamos en Vercel
      if (!process.env.VERCEL) {
        try {
          fs.writeFileSync(this.keyPath, key.toString('hex'));
        } catch (writeError) {
          this.logError('No se pudo guardar la clave de cifrado', writeError);
        }
      }
      
      return key;
    } catch (error) {
      this.logError('Error al obtener/crear clave de cifrado', error);
      throw error;
    }
  }

  /**
   * Deriva una clave específica para una operación usando PBKDF2
   * @param {string} salt - Salt único para la derivación
   * @param {number} iterations - Número de iteraciones (por defecto 100000)
   * @returns {Buffer} Clave derivada
   */
  deriveKey(salt, iterations = 100000) {
    try {
      return crypto.pbkdf2Sync(this.masterKey, salt, iterations, 32, 'sha256');
    } catch (error) {
      this.logError('Error al derivar clave', error);
      throw error;
    }
  }

  /**
   * Cifra un texto usando AES-GCM con integridad y autenticación
   * @param {string} text - Texto a cifrar
   * @returns {string} Texto cifrado en formato base64 con metadatos
   */
  encrypt(text) {
    try {
      if (!text || typeof text !== 'string') {
        throw new Error('El texto a cifrar debe ser una cadena no vacía');
      }
      
      // Generar salt e IV únicos para esta operación
      const salt = crypto.randomBytes(16);
      const iv = crypto.randomBytes(12); // GCM usa IV de 12 bytes
      
      // Derivar clave específica para esta operación
      const key = this.deriveKey(salt);
      
      // Crear cipher GCM
      const cipher = crypto.createCipheriv(this.algorithm, key, iv);
      
      // Cifrar
      let encrypted = cipher.update(text, 'utf8');
      cipher.final();
      
      // Obtener tag de autenticación
      const authTag = cipher.getAuthTag();
      
      // Combinar todos los componentes
      const result = {
        data: encrypted.toString('base64'),
        salt: salt.toString('base64'),
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64'),
        algorithm: this.algorithm
      };
      
      return Buffer.from(JSON.stringify(result)).toString('base64');
    } catch (error) {
      this.logError('Error al cifrar texto', error);
      throw error;
    }
  }

  /**
   * Descifra un texto cifrado con AES-GCM
   * @param {string} encryptedText - Texto cifrado en formato base64 con metadatos
   * @returns {string} Texto descifrado
   */
  decrypt(encryptedText) {
    try {
      if (!encryptedText || typeof encryptedText !== 'string') {
        throw new Error('El texto cifrado debe ser una cadena no vacía');
      }
      
      // Intentar descifrar con nuevo formato (GCM)
      try {
        const encryptedData = JSON.parse(Buffer.from(encryptedText, 'base64').toString());
        
        // Validar estructura
        if (!encryptedData.data || !encryptedData.salt || !encryptedData.iv || !encryptedData.authTag) {
          throw new Error('Formato de datos cifrados inválido');
        }
        
        // Reconstruir componentes
        const data = Buffer.from(encryptedData.data, 'base64');
        const salt = Buffer.from(encryptedData.salt, 'base64');
        const iv = Buffer.from(encryptedData.iv, 'base64');
        const authTag = Buffer.from(encryptedData.authTag, 'base64');
        
        // Derivar la misma clave
        const key = this.deriveKey(salt);
        
        // Crear decipher GCM
        const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
        decipher.setAuthTag(authTag);
        
        // Descifrar
        let decrypted = decipher.update(data, null, 'utf8');
        decrypted += decipher.final('utf8');
        
        return decrypted;
      } catch (gcmError) {
        // Fallback para formato legacy (CBC) - TEMPORAL
        return this.decryptLegacy(encryptedText);
      }
    } catch (error) {
      this.logError('Error al descifrar texto', error);
      throw error;
    }
  }

  /**
   * Descifrado legacy para compatibilidad con formato CBC anterior
   * @param {string} encryptedText - Texto en formato hexadecimal
   * @returns {string} Texto descifrado
   */
  decryptLegacy(encryptedText) {
    try {
      // Esta función maneja el formato anterior (AES-CBC)
      // Solo para compatibilidad temporal
      if (process.env.SECRET_IV) {
        const iv = Buffer.from(process.env.SECRET_IV, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', this.masterKey, iv);
        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
      }
      throw new Error('No se puede descifrar formato legacy sin IV');
    } catch (error) {
      this.logError('Error en descifrado legacy', error);
      throw error;
    }
  }

  /**
   * Verifica si un texto está cifrado con formato seguro
   * @param {string} text - Texto a verificar
   * @returns {boolean} true si está cifrado, false en caso contrario
   */
  isEncrypted(text) {
    if (!text || typeof text !== 'string') {
      return false;
    }
    
    try {
      // Intentar decodificar como base64 y parsear JSON
      const decoded = Buffer.from(text, 'base64').toString();
      const parsed = JSON.parse(decoded);
      
      // Verificar estructura del nuevo formato
      return !!(parsed.data && parsed.salt && parsed.iv && parsed.authTag && parsed.algorithm);
    } catch {
      // Si falla, puede ser formato legacy (hexadecimal)
      const hexRegex = /^[0-9a-fA-F]+$/;
      return hexRegex.test(text) && text.length % 2 === 0 && text.length > 32;
    }
  }
}

module.exports = new CryptoHelper();
