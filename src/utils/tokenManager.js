/**
 * Gestor de tokens por usuario para MercadoLibre
 * VERSIÓN PERSISTENTE - Usa BD como almacenamiento principal con cache en memoria
 */

const logger = require('./logger');
const databaseService = require('../services/databaseService');

class TokenManager {
  constructor() {
    // Cache en memoria por usuario (opcional, para rendimiento)
    this.userTokens = new Map(); // userId -> { tokens, metadata }
    
    // Configuración
    this.tokenExpiryBuffer = 5 * 60 * 1000; // 5 minutos antes de expirar
    this.maxUsersInMemory = 10; // Máximo usuarios en memoria simultáneamente
    this.cacheEnabled = true; // Habilitar cache en memoria
    
    logger.info('🔐 TokenManager PERSISTENTE inicializado - BD + cache en memoria');
  }

  /**
   * Guardar tokens para un usuario específico (BD + cache)
   */
  async saveTokens(userId, tokens, metadata = {}) {
    try {
      logger.info(`🔍 DEBUG - saveTokens llamado para usuario: ${userId}`);
      
      if (!userId || !tokens) {
        logger.error(`❌ DEBUG - userId o tokens faltantes. userId: ${userId}, tokens: ${!!tokens}`);
        throw new Error('userId y tokens son requeridos');
      }

      const userIdString = userId.toString();
      logger.info(`🔍 DEBUG - Guardando tokens para userId: ${userIdString}`);
      logger.info(`🔍 DEBUG - Access token preview: ${tokens.access_token ? tokens.access_token.substring(0, 20) + '...' : 'NO_TOKEN'}`);
      logger.info(`🔍 DEBUG - Expires in: ${tokens.expires_in} segundos`);

      // 1. GUARDAR EN BD (persistente)
      try {
        await databaseService.saveTokens(userIdString, tokens, metadata);
        logger.info(`✅ DEBUG - Tokens guardados en BD para usuario ${userIdString}`);
      } catch (dbError) {
        logger.error(`❌ DEBUG - Error guardando en BD: ${dbError.message}`);
        throw dbError;
      }

      // 2. GUARDAR EN CACHE (opcional, para rendimiento)
      if (this.cacheEnabled) {
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
            expiresAt: tokens.expires_at || (Date.now() + (tokens.expires_in * 1000) - this.tokenExpiryBuffer),
            userAgent: metadata.userAgent,
            cookieId: metadata.cookieId,
            lastUsed: Date.now(),
            ...metadata
          }
        };

        // Limpiar memoria si hay demasiados usuarios
        this.cleanupOldTokens();

        this.userTokens.set(userIdString, userTokenData);
        logger.info(`📊 DEBUG - Tokens cacheados en memoria: ${this.userTokens.size}/${this.maxUsersInMemory}`);
      }
      
      logger.info(`🔑 DEBUG - Tokens guardados exitosamente para usuario ${userIdString} (BD + cache)`);
      return true;
    } catch (error) {
      logger.error(`❌ DEBUG - Error guardando tokens para usuario ${userId}: ${error.message}`);
      return false;
    }
  }

  /**
   * Obtener tokens para un usuario específico (BD + cache)
   */
  async getTokens(userId) {
    try {
      logger.info(`🔍 DEBUG - getTokens llamado para usuario: ${userId}`);
      
      if (!userId) {
        logger.warn(`⚠️ DEBUG - userId es null/undefined`);
        return null;
      }

      const userIdString = userId.toString();
      logger.info(`🔍 DEBUG - Buscando tokens para userId: ${userIdString}`);
      
      // 1. INTENTAR CACHE PRIMERO (si está habilitado)
      if (this.cacheEnabled) {
        logger.info(`🔍 DEBUG - Total usuarios en memoria: ${this.userTokens.size}`);
        
        const userTokenData = this.userTokens.get(userIdString);
        if (userTokenData && !this.isTokenExpired(userTokenData)) {
          logger.info(`✅ DEBUG - Tokens encontrados en CACHE para usuario ${userIdString}`);
          userTokenData.metadata.lastUsed = Date.now();
          return userTokenData.tokens;
        }
      }

      // 2. CONSULTAR BD (fuente de verdad)
      logger.info(`🔍 DEBUG - Consultando BD para usuario ${userIdString}`);
      const tokensFromDB = await databaseService.getTokens(userIdString);
      
      if (!tokensFromDB) {
        logger.warn(`📭 DEBUG - No hay tokens en BD para usuario ${userIdString}`);
        return null;
      }

      logger.info(`✅ DEBUG - Tokens encontrados en BD para usuario ${userIdString}`);
      
      // 3. ACTUALIZAR CACHE (si está habilitado)
      if (this.cacheEnabled) {
        const userTokenData = {
          tokens: tokensFromDB,
          metadata: {
            savedAt: Date.now(),
            expiresAt: tokensFromDB.expires_at,
            lastUsed: Date.now(),
            fromDB: true
          }
        };

        this.cleanupOldTokens();
        this.userTokens.set(userIdString, userTokenData);
        logger.info(`📊 DEBUG - Tokens cacheados desde BD: ${this.userTokens.size}/${this.maxUsersInMemory}`);
      }
      
      logger.info(`✅ DEBUG - Tokens válidos recuperados para usuario ${userIdString} (BD)`);
      return tokensFromDB;
    } catch (error) {
      logger.error(`❌ DEBUG - Error obteniendo tokens para usuario ${userId}: ${error.message}`);
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
   * Limpiar tokens para un usuario específico (BD + cache)
   */
  async clearTokens(userId) {
    if (!userId) {
      return false;
    }

    const userIdString = userId.toString();

    try {
      // 1. LIMPIAR DE BD
      await databaseService.clearUserTokens(userIdString);
      logger.info(`🗑️ Tokens limpiados de BD para usuario ${userIdString}`);
      
      // 2. LIMPIAR DE CACHE
      const existedInCache = this.userTokens.delete(userIdString);
      if (existedInCache) {
        logger.info(`🗑️ Tokens limpiados de cache para usuario ${userIdString}`);
      }
      
      return true;
    } catch (error) {
      logger.error(`❌ Error limpiando tokens para usuario ${userIdString}: ${error.message}`);
      return false;
    }
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