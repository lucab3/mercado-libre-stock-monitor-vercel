const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * Clase para el manejo de cifrado y descifrado de datos sensibles
 * ARREGLADO PARA VERCEL - No intenta crear archivos en filesystem de solo lectura
 */
class CryptoHelper {
  constructor() {
    this.algorithm = 'aes-256-cbc';
    this.keyPath = path.join(__dirname, '../../.secret_key');
    this.ivPath = path.join(__dirname, '../../.secret_iv');
    
    try {
      this.key = this.getOrCreateKey();
      this.iv = this.getOrCreateIV();
    } catch (error) {
      console.error(`Error al inicializar CryptoHelper: ${error.message}`);
      // Valores por defecto para evitar errores
      this.key = crypto.randomBytes(32);
      this.iv = crypto.randomBytes(16);
    }
  }

  /**
   * Obtiene o crea la clave de cifrado
   * ARREGLADO: No intenta escribir archivos en Vercel
   * @returns {Buffer} Clave de cifrado
   */
  getOrCreateKey() {
    try {
      // 1. PRIMERO intentar obtener de variables de entorno (VERCEL)
      if (process.env.SECRET_KEY) {
        return Buffer.from(process.env.SECRET_KEY, 'hex');
      }
      
      // 2. Si no estamos en Vercel, intentar archivos
      if (!process.env.VERCEL && fs.existsSync(this.keyPath)) {
        return Buffer.from(fs.readFileSync(this.keyPath, 'utf8'), 'hex');
      }
      
      // 3. Crear una nueva clave
      const key = crypto.randomBytes(32); // 256 bits
      
      // 4. ARREGLO VERCEL: Solo intentar guardar si NO estamos en Vercel
      if (!process.env.VERCEL) {
        try {
          fs.writeFileSync(this.keyPath, key.toString('hex'));
        } catch (writeError) {
          console.warn('No se pudo guardar la clave de cifrado:', writeError.message);
        }
      }
      
      return key;
    } catch (error) {
      console.error(`Error al obtener/crear clave de cifrado: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtiene o crea el vector de inicialización
   * ARREGLADO: No intenta escribir archivos en Vercel
   * @returns {Buffer} Vector de inicialización
   */
  getOrCreateIV() {
    try {
      // 1. PRIMERO intentar obtener de variables de entorno (VERCEL)
      if (process.env.SECRET_IV) {
        return Buffer.from(process.env.SECRET_IV, 'hex');
      }
      
      // 2. Si no estamos en Vercel, intentar archivos
      if (!process.env.VERCEL && fs.existsSync(this.ivPath)) {
        return Buffer.from(fs.readFileSync(this.ivPath, 'utf8'), 'hex');
      }
      
      // 3. Crear un nuevo IV
      const iv = crypto.randomBytes(16); // 128 bits
      
      // 4. ARREGLO VERCEL: Solo intentar guardar si NO estamos en Vercel
      if (!process.env.VERCEL) {
        try {
          fs.writeFileSync(this.ivPath, iv.toString('hex'));
        } catch (writeError) {
          console.warn('No se pudo guardar el IV:', writeError.message);
        }
      }
      
      return iv;
    } catch (error) {
      console.error(`Error al obtener/crear vector de inicialización: ${error.message}`);
      throw error;
    }
  }

  /**
   * Cifra un texto
   * @param {string} text - Texto a cifrar
   * @returns {string} Texto cifrado en formato hexadecimal
   */
  encrypt(text) {
    try {
      const cipher = crypto.createCipheriv(this.algorithm, this.key, this.iv);
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      return encrypted;
    } catch (error) {
      console.error(`Error al cifrar texto: ${error.message}`);
      throw error;
    }
  }

  /**
   * Descifra un texto
   * @param {string} encryptedText - Texto cifrado en formato hexadecimal
   * @returns {string} Texto descifrado
   */
  decrypt(encryptedText) {
    try {
      const decipher = crypto.createDecipheriv(this.algorithm, this.key, this.iv);
      let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (error) {
      console.error(`Error al descifrar texto: ${error.message}`);
      throw error;
    }
  }

  /**
   * Verifica si un texto está cifrado
   * @param {string} text - Texto a verificar
   * @returns {boolean} true si está cifrado, false en caso contrario
   */
  isEncrypted(text) {
    if (!text || typeof text !== 'string') {
      return false;
    }
    
    // Asumimos que un texto cifrado solo contiene caracteres hexadecimales
    const hexRegex = /^[0-9a-fA-F]+$/;
    return hexRegex.test(text) && text.length % 2 === 0 && text.length > 16;
  }
}

module.exports = new CryptoHelper();
