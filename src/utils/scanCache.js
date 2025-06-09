/**
 * Cache en memoria para el estado del scan progresivo
 * Funciona en entorno serverless guardando estado entre llamadas de una misma sesión
 */

class ScanCache {
  constructor() {
    this.cache = new Map();
    this.maxCacheAge = 10 * 60 * 1000; // 10 minutos (scroll_id expira en 5 min, dejamos margen)
  }

  /**
   * Generar clave de cache basada en userId y sessionId
   */
  getCacheKey(userId, sessionId) {
    return `scan_${userId}_${sessionId || 'default'}`;
  }

  /**
   * Guardar estado del scan
   */
  setScanState(userId, sessionId, state) {
    const key = this.getCacheKey(userId, sessionId);
    const cacheEntry = {
      ...state,
      timestamp: Date.now()
    };
    
    this.cache.set(key, cacheEntry);
    
    // Limpiar entradas expiradas
    this.cleanExpiredEntries();
    
    return key;
  }

  /**
   * Obtener estado del scan
   */
  getScanState(userId, sessionId) {
    const key = this.getCacheKey(userId, sessionId);
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }
    
    // Verificar si no ha expirado
    if (Date.now() - entry.timestamp > this.maxCacheAge) {
      this.cache.delete(key);
      return null;
    }
    
    return entry;
  }

  /**
   * Limpiar estado del scan (cuando se completa o se cancela)
   */
  clearScanState(userId, sessionId) {
    const key = this.getCacheKey(userId, sessionId);
    this.cache.delete(key);
  }

  /**
   * Limpiar entradas expiradas
   */
  cleanExpiredEntries() {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.maxCacheAge) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Obtener estadísticas del cache
   */
  getStats() {
    return {
      totalEntries: this.cache.size,
      entries: Array.from(this.cache.keys())
    };
  }
}

// Instancia singleton
const scanCache = new ScanCache();

module.exports = scanCache;