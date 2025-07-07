/**
 * Gestor de tokens por usuario para MercadoLibre
 * Maneja almacenamiento en memoria, persistencia opcional y aislamiento por usuario
 */

const logger = require('./logger');

class TokenManager {
  constructor() {
    // Almacenamiento en memoria por usuario
    this.userTokens = new Map(); // userId -> { tokens, metadata }
    
    // Configuración
    this.tokenExpiryBuffer = 5 * 60 * 1000; // 5 minutos antes de expirar
    this.maxUsersInMemory = 10; // Máximo usuarios en memoria simultáneamente
    
    logger.info('🔐 TokenManager inicializado - aislamiento por usuario');
  }

  /**
   * Guardar tokens para un usuario específico
   */
  saveTokens(userId, tokens, metadata = {}) {
    try {
      if (!userId || !tokens) {
        throw new Error('userId y tokens son requeridos');
      }

      const userTokenData = {
        tokens: {
          access_token: tokens.access_token,
          token_type: tokens.token_type || 'Bearer',
          expires_in: tokens.expires_in,
          refresh_token: tokens.refresh_token,
          scope: tokens.scope,
          user_id: tokens.user_id
        },
        metadata: {
          savedAt: Date.now(),
          expiresAt: Date.now() + (tokens.expires_in * 1000) - this.tokenExpiryBuffer,
          userAgent: metadata.userAgent,
          cookieId: metadata.cookieId,
          lastUsed: Date.now(),
          ...metadata
        }
      };

      // Limpiar memoria si hay demasiados usuarios
      this.cleanupOldTokens();

      this.userTokens.set(userId.toString(), userTokenData);
      
      logger.info(`🔑 Tokens guardados para usuario ${userId} (expiran en ${tokens.expires_in}s)`);
      logger.debug(`📊 Usuarios en memoria: ${this.userTokens.size}/${this.maxUsersInMemory}`);
      
      return true;
    } catch (error) {
      logger.error(`❌ Error guardando tokens para usuario ${userId}: ${error.message}`);
      return false;
    }
  }

  /**
   * Obtener tokens para un usuario específico
   */
  getTokens(userId) {
    try {
      if (!userId) {
        return null;
      }

      const userTokenData = this.userTokens.get(userId.toString());
      
      if (!userTokenData) {
        logger.debug(`📭 No hay tokens para usuario ${userId}`);
        return null;
      }

      // Verificar si los tokens han expirado
      if (this.isTokenExpired(userTokenData)) {
        logger.warn(`⏰ Tokens expirados para usuario ${userId} - limpiando`);
        this.clearTokens(userId);
        return null;
      }

      // Actualizar último uso
      userTokenData.metadata.lastUsed = Date.now();
      
      logger.debug(`✅ Tokens válidos recuperados para usuario ${userId}`);
      return userTokenData.tokens;
    } catch (error) {
      logger.error(`❌ Error obteniendo tokens para usuario ${userId}: ${error.message}`);
      return null;
    }
  }

  /**
   * Verificar si un token está expirado
   */
  isTokenExpired(userTokenData) {
    if (!userTokenData || !userTokenData.metadata) {
      return true;
    }

    const now = Date.now();
    const expiresAt = userTokenData.metadata.expiresAt;
    
    return now >= expiresAt;
  }

  /**
   * Obtener access token específico para un usuario
   */
  getAccessToken(userId) {
    const tokens = this.getTokens(userId);
    return tokens ? tokens.access_token : null;
  }

  /**
   * Verificar si un usuario tiene tokens válidos
   */
  hasValidTokens(userId) {
    if (!userId) {
      return false;
    }

    const userTokenData = this.userTokens.get(userId.toString());
    return userTokenData && !this.isTokenExpired(userTokenData);
  }

  /**
   * Limpiar tokens para un usuario específico
   */
  clearTokens(userId) {
    if (!userId) {
      return false;
    }

    const existed = this.userTokens.delete(userId.toString());
    
    if (existed) {
      logger.info(`🗑️ Tokens limpiados para usuario ${userId}`);
    } else {
      logger.debug(`📭 No había tokens para limpiar del usuario ${userId}`);
    }
    
    return existed;
  }

  /**
   * Actualizar metadata de tokens sin cambiar los tokens
   */
  updateMetadata(userId, newMetadata) {
    if (!userId) {
      return false;
    }

    const userTokenData = this.userTokens.get(userId.toString());
    
    if (!userTokenData) {
      return false;
    }

    userTokenData.metadata = {
      ...userTokenData.metadata,
      ...newMetadata,
      lastUsed: Date.now()
    };

    logger.debug(`📝 Metadata actualizada para usuario ${userId}`);
    return true;
  }

  /**
   * Limpiar tokens antiguos o no utilizados
   */
  cleanupOldTokens() {
    if (this.userTokens.size <= this.maxUsersInMemory) {
      return;
    }

    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 horas
    let cleanedCount = 0;

    // Limpiar tokens expirados
    for (const [userId, userTokenData] of this.userTokens.entries()) {
      if (this.isTokenExpired(userTokenData)) {
        this.userTokens.delete(userId);
        cleanedCount++;
        continue;
      }

      // Limpiar tokens no usados en 24 horas
      if (now - userTokenData.metadata.lastUsed > maxAge) {
        this.userTokens.delete(userId);
        cleanedCount++;
      }
    }

    // Si aún hay demasiados, limpiar los más antiguos
    if (this.userTokens.size > this.maxUsersInMemory) {
      const sortedByLastUsed = Array.from(this.userTokens.entries())
        .sort((a, b) => a[1].metadata.lastUsed - b[1].metadata.lastUsed);

      const toRemove = this.userTokens.size - this.maxUsersInMemory;
      for (let i = 0; i < toRemove; i++) {
        const [userId] = sortedByLastUsed[i];
        this.userTokens.delete(userId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.info(`🧹 Limpieza automática: ${cleanedCount} usuarios eliminados. Usuarios restantes: ${this.userTokens.size}`);
    }
  }

  /**
   * Obtener estadísticas del gestor
   */
  getStats() {
    const stats = {
      totalUsers: this.userTokens.size,
      maxUsers: this.maxUsersInMemory,
      users: []
    };

    for (const [userId, userTokenData] of this.userTokens.entries()) {
      stats.users.push({
        userId,
        hasTokens: !!userTokenData.tokens,
        isExpired: this.isTokenExpired(userTokenData),
        lastUsed: userTokenData.metadata.lastUsed,
        expiresAt: userTokenData.metadata.expiresAt,
        cookieId: userTokenData.metadata.cookieId
      });
    }

    return stats;
  }

  /**
   * Obtener información de debug para un usuario
   */
  getUserDebugInfo(userId) {
    if (!userId) {
      return null;
    }

    const userTokenData = this.userTokens.get(userId.toString());
    
    if (!userTokenData) {
      return {
        userId,
        exists: false,
        message: 'No hay datos de token para este usuario'
      };
    }

    return {
      userId,
      exists: true,
      hasAccessToken: !!userTokenData.tokens.access_token,
      hasRefreshToken: !!userTokenData.tokens.refresh_token,
      tokenType: userTokenData.tokens.token_type,
      expiresAt: new Date(userTokenData.metadata.expiresAt).toISOString(),
      isExpired: this.isTokenExpired(userTokenData),
      lastUsed: new Date(userTokenData.metadata.lastUsed).toISOString(),
      cookieId: userTokenData.metadata.cookieId,
      userAgent: userTokenData.metadata.userAgent,
      scope: userTokenData.tokens.scope
    };
  }

  /**
   * Limpiar todos los tokens (solo para debugging/testing)
   */
  clearAllTokens() {
    const count = this.userTokens.size;
    this.userTokens.clear();
    logger.warn(`🗑️ TODOS los tokens limpiados (${count} usuarios)`);
    return count;
  }

  /**
   * Exportar tokens para persistencia (opcional)
   */
  exportTokensForPersistence() {
    const tokensData = {};
    
    for (const [userId, userTokenData] of this.userTokens.entries()) {
      if (!this.isTokenExpired(userTokenData)) {
        tokensData[userId] = {
          tokens: userTokenData.tokens,
          metadata: userTokenData.metadata
        };
      }
    }
    
    return tokensData;
  }

  /**
   * Importar tokens desde persistencia (opcional)
   */
  importTokensFromPersistence(tokensData) {
    if (!tokensData || typeof tokensData !== 'object') {
      return 0;
    }

    let importedCount = 0;
    
    for (const [userId, userTokenData] of Object.entries(tokensData)) {
      if (userTokenData.tokens && userTokenData.metadata) {
        // Verificar que no estén expirados
        if (!this.isTokenExpired(userTokenData)) {
          this.userTokens.set(userId, userTokenData);
          importedCount++;
        }
      }
    }
    
    logger.info(`📥 Tokens importados: ${importedCount} usuarios`);
    return importedCount;
  }
}

// Exportar instancia singleton
const tokenManager = new TokenManager();

module.exports = tokenManager;