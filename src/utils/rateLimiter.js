/**
 * Sistema de Rate Limiting para Mercado Libre API
 * Límite: 1500 requests/minuto por vendedor
 */

const logger = require('./logger');

class RateLimiter {
  constructor() {
    // Configuración basada en límites de ML
    this.maxRequestsPerMinute = 1400; // Margen de seguridad (100 requests menos)
    this.windowSizeMs = 60000; // 1 minuto en milisegundos
    this.safetyMargin = 0.1; // 10% de margen de seguridad
    
    // Almacenamiento de requests
    this.requests = []; // Array de timestamps
    this.requestQueue = []; // Cola de requests pendientes
    this.isProcessingQueue = false;
    
    // Estadísticas
    this.stats = {
      totalRequests: 0,
      rejectedRequests: 0,
      queuedRequests: 0,
      averageWaitTime: 0
    };
    
    // Limpieza automática cada minuto
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000);
    
    logger.info(`🚦 Rate Limiter iniciado: ${this.maxRequestsPerMinute} requests/min`);
  }

  /**
   * Verifica si se puede hacer una request
   */
  canMakeRequest() {
    this.cleanup();
    
    const currentCount = this.requests.length;
    const canProceed = currentCount < this.maxRequestsPerMinute;
    
    if (!canProceed) {
      logger.warn(`🚫 Rate limit alcanzado: ${currentCount}/${this.maxRequestsPerMinute} requests en el último minuto`);
    }
    
    return canProceed;
  }

  /**
   * Registra una request realizada
   */
  recordRequest() {
    const now = Date.now();
    this.requests.push(now);
    this.stats.totalRequests++;
    
    // Log cada 100 requests para debugging
    if (this.stats.totalRequests % 100 === 0) {
      logger.info(`📊 Rate Limiter Stats: ${this.getCurrentCount()}/${this.maxRequestsPerMinute} requests en ventana actual`);
    }
  }

  /**
   * Espera hasta que se pueda hacer una request
   */
  async waitForAvailability() {
    if (this.canMakeRequest()) {
      return 0; // No necesita esperar
    }

    const oldestRequest = this.requests[0];
    const waitTime = (oldestRequest + this.windowSizeMs) - Date.now();
    
    if (waitTime > 0) {
      logger.info(`⏳ Esperando ${Math.ceil(waitTime/1000)}s para evitar rate limit`);
      await this.sleep(waitTime);
    }
    
    return waitTime;
  }

  /**
   * Wrapper para hacer requests de forma segura
   */
  async safeRequest(requestFunction, ...args) {
    const startTime = Date.now();
    
    try {
      // Esperar si es necesario
      const waitTime = await this.waitForAvailability();
      
      // Registrar la request
      this.recordRequest();
      
      // Ejecutar la request
      const result = await requestFunction(...args);
      
      // Actualizar estadísticas
      const totalTime = Date.now() - startTime;
      this.updateAverageWaitTime(totalTime);
      
      return result;
      
    } catch (error) {
      // Si es error 429, esperar más tiempo
      if (error.response && error.response.status === 429) {
        logger.error('🚨 Rate limit excedido (429) - ajustando límites');
        await this.handleRateLimitError(error);
        throw error;
      }
      
      throw error;
    }
  }

  /**
   * Sistema de cola para requests en lote
   */
  async queueRequest(requestFunction, ...args) {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({
        fn: requestFunction,
        args: args,
        resolve: resolve,
        reject: reject,
        timestamp: Date.now()
      });
      
      this.stats.queuedRequests++;
      this.processQueue();
    });
  }

  /**
   * Procesa la cola de requests
   */
  async processQueue() {
    if (this.isProcessingQueue || this.requestQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;
    
    try {
      while (this.requestQueue.length > 0) {
        const request = this.requestQueue.shift();
        
        try {
          const result = await this.safeRequest(request.fn, ...request.args);
          request.resolve(result);
        } catch (error) {
          request.reject(error);
        }
        
        // Pausa pequeña entre requests en cola
        await this.sleep(50);
      }
    } finally {
      this.isProcessingQueue = false;
    }
  }

  /**
   * Maneja errores de rate limit
   */
  async handleRateLimitError(error) {
    this.stats.rejectedRequests++;
    
    // Reducir límite temporalmente
    this.maxRequestsPerMinute = Math.max(1000, this.maxRequestsPerMinute * 0.8);
    
    logger.warn(`🔧 Límite reducido temporalmente a ${this.maxRequestsPerMinute} requests/min`);
    
    // Obtener tiempo de espera del header Retry-After si existe
    const retryAfter = error.response?.headers['retry-after'];
    const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 60000; // Default: 1 minuto
    
    logger.info(`⏸️ Pausando requests por ${waitTime/1000}s debido a rate limit`);
    await this.sleep(waitTime);
    
    // Restaurar límite gradualmente
    setTimeout(() => {
      this.maxRequestsPerMinute = Math.min(1400, this.maxRequestsPerMinute + 100);
      logger.info(`📈 Límite restaurado a ${this.maxRequestsPerMinute} requests/min`);
    }, 300000); // 5 minutos
  }

  /**
   * Limpia requests antiguos de la ventana
   */
  cleanup() {
    const now = Date.now();
    const cutoff = now - this.windowSizeMs;
    
    const beforeCount = this.requests.length;
    this.requests = this.requests.filter(timestamp => timestamp > cutoff);
    
    const cleanedCount = beforeCount - this.requests.length;
    if (cleanedCount > 0) {
      logger.debug(`🧹 Limpiados ${cleanedCount} requests antiguos`);
    }
  }

  /**
   * Obtiene el conteo actual de requests
   */
  getCurrentCount() {
    this.cleanup();
    return this.requests.length;
  }

  /**
   * Obtiene estadísticas del rate limiter
   */
  getStats() {
    return {
      ...this.stats,
      currentRequests: this.getCurrentCount(),
      maxRequests: this.maxRequestsPerMinute,
      utilizationPercent: Math.round((this.getCurrentCount() / this.maxRequestsPerMinute) * 100),
      queueLength: this.requestQueue.length,
      windowSizeMinutes: this.windowSizeMs / 60000,
      isNearLimit: this.getCurrentCount() > (this.maxRequestsPerMinute * 0.8)
    };
  }

  /**
   * Verifica si está cerca del límite
   */
  isNearLimit() {
    return this.getCurrentCount() > (this.maxRequestsPerMinute * 0.8);
  }

  /**
   * Actualiza el tiempo promedio de espera
   */
  updateAverageWaitTime(totalTime) {
    if (this.stats.averageWaitTime === 0) {
      this.stats.averageWaitTime = totalTime;
    } else {
      this.stats.averageWaitTime = (this.stats.averageWaitTime + totalTime) / 2;
    }
  }

  /**
   * Función de sleep/pausa
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Reset manual de estadísticas
   */
  resetStats() {
    this.stats = {
      totalRequests: 0,
      rejectedRequests: 0,
      queuedRequests: 0,
      averageWaitTime: 0
    };
    logger.info('📊 Estadísticas de rate limiter reiniciadas');
  }

  /**
   * Ajusta dinámicamente los límites basado en respuesta de la API
   */
  adjustLimitsBasedOnResponse(response) {
    // Buscar headers de rate limiting de ML
    const remaining = response.headers['x-ratelimit-remaining'];
    const reset = response.headers['x-ratelimit-reset'];
    
    if (remaining !== undefined) {
      const remainingRequests = parseInt(remaining);
      const resetTime = reset ? parseInt(reset) : Date.now() + 60000;
      
      logger.debug(`📊 ML Rate Limit Info: ${remainingRequests} requests restantes`);
      
      // Ajustar comportamiento si quedan pocas requests
      if (remainingRequests < 100) {
        logger.warn(`⚠️ Quedan solo ${remainingRequests} requests - reduciendo velocidad`);
        this.maxRequestsPerMinute = Math.max(600, this.maxRequestsPerMinute * 0.5);
      }
    }
  }

  /**
   * Limpieza al destruir el objeto
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    logger.info('🗑️ Rate Limiter destruido');
  }
}

// Instancia singleton
const rateLimiter = new RateLimiter();

// Limpieza al cerrar la aplicación
process.on('SIGINT', () => {
  rateLimiter.destroy();
});

process.on('SIGTERM', () => {
  rateLimiter.destroy();
});

module.exports = rateLimiter;