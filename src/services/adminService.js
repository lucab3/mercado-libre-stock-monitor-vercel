/**
 * Servicio de administración
 * Manejo de autenticación, sesiones y operaciones administrativas
 */

const crypto = require('crypto');
const logger = require('../utils/logger');
const config = require('../../config/config');
const sessionManager = require('../utils/sessionManager');
const databaseService = require('./databaseService');

class AdminService {
  constructor() {
    this.adminSessions = new Map(); // adminSessionId -> { username, createdAt, expiresAt, lastUsed }
    this.sessionTimeout = config.admin.sessionTimeout;
    
    // Limpiar sesiones expiradas cada 10 minutos
    setInterval(() => this.cleanupExpiredSessions(), 10 * 60 * 1000);
    
    logger.info('🔐 AdminService inicializado');
  }

  /**
   * Verificar si el sistema de admin está habilitado
   */
  isAdminEnabled() {
    return config.admin.enabled;
  }


  /**
   * Verificar credenciales de administrador
   */
  async verifyAdminCredentials(username, password) {
    if (!this.isAdminEnabled()) {
      throw new Error('Sistema de administración deshabilitado');
    }

    if (!config.admin.username || !config.admin.password) {
      throw new Error('Credenciales de administrador no configuradas');
    }

    // Verificar username
    if (username !== config.admin.username) {
      logger.warn(`🚨 Intento de login admin con username incorrecto: ${username}`);
      return false;
    }

    // Verificar password (comparación directa para Vercel)
    try {
      return password === config.admin.password;
    } catch (error) {
      logger.error(`❌ Error verificando credenciales admin: ${error.message}`);
      return false;
    }
  }

  /**
   * Crear sesión de administrador
   */
  createAdminSession(username) {
    const sessionId = crypto.randomBytes(32).toString('hex');
    const now = Date.now();
    
    const sessionData = {
      sessionId,
      username,
      createdAt: now,
      expiresAt: now + this.sessionTimeout,
      lastUsed: now,
      ipAddress: null, // Se puede agregar después
      userAgent: null
    };

    this.adminSessions.set(sessionId, sessionData);
    
    logger.info(`🔑 Sesión admin creada para ${username}: ${sessionId.substring(0, 8)}...`);
    
    return sessionId;
  }

  /**
   * Validar sesión de administrador
   */
  validateAdminSession(sessionId) {
    if (!sessionId || !this.adminSessions.has(sessionId)) {
      return null;
    }

    const session = this.adminSessions.get(sessionId);
    const now = Date.now();

    // Verificar expiración
    if (now > session.expiresAt) {
      this.adminSessions.delete(sessionId);
      logger.info(`⏰ Sesión admin expirada: ${sessionId.substring(0, 8)}...`);
      return null;
    }

    // Actualizar último uso
    session.lastUsed = now;
    
    return session;
  }

  /**
   * Cerrar sesión de administrador
   */
  logoutAdmin(sessionId) {
    if (this.adminSessions.has(sessionId)) {
      const session = this.adminSessions.get(sessionId);
      this.adminSessions.delete(sessionId);
      logger.info(`👋 Sesión admin cerrada para ${session.username}: ${sessionId.substring(0, 8)}...`);
      return true;
    }
    return false;
  }

  /**
   * Limpiar sesiones expiradas
   */
  cleanupExpiredSessions() {
    const now = Date.now();
    let cleaned = 0;

    for (const [sessionId, session] of this.adminSessions.entries()) {
      if (now > session.expiresAt) {
        this.adminSessions.delete(sessionId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info(`🧹 ${cleaned} sesiones admin expiradas limpiadas`);
    }
  }

  /**
   * Obtener todas las sesiones de usuarios activas desde la base de datos
   */
  async getAllUserSessions() {
    try {
      logger.debug('🔍 Admin: obteniendo sesiones desde base de datos...');
      return await databaseService.getSessionStats();
    } catch (error) {
      logger.error(`❌ Error obteniendo sesiones de usuarios: ${error.message}`);
      // Devolver datos por defecto en caso de error
      return {
        totalSessions: 0,
        activeSessions: 0,
        uniqueUsers: 0,
        avgSessionsPerUser: 0,
        sessions: []
      };
    }
  }

  /**
   * Revocar todas las sesiones de un usuario desde la base de datos
   */
  async revokeUserSessions(userId) {
    try {
      return await databaseService.revokeAllUserSessions(userId);
    } catch (error) {
      logger.error(`❌ Error revocando sesiones para usuario ${userId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtener estadísticas del sistema
   */
  async getSystemStats() {
    try {
      const [dbStats, sessionStats] = await Promise.all([
        databaseService.getStats(),
        this.getAllUserSessions()
      ]);

      return {
        database: dbStats,
        sessions: {
          totalUserSessions: sessionStats.totalSessions,
          activeUserSessions: sessionStats.activeSessions,
          uniqueUsers: sessionStats.uniqueUsers,
          avgSessionsPerUser: sessionStats.avgSessionsPerUser,
          totalAdminSessions: this.adminSessions.size
        },
        system: {
          uptime: process.uptime(),
          memoryUsage: process.memoryUsage(),
          nodeVersion: process.version,
          platform: process.platform
        }
      };
    } catch (error) {
      logger.error(`❌ Error obteniendo estadísticas del sistema: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtener información de sesiones admin activas
   */
  getAdminSessionsInfo() {
    const sessions = [];
    const now = Date.now();

    for (const [sessionId, session] of this.adminSessions.entries()) {
      if (now <= session.expiresAt) {
        sessions.push({
          sessionId: sessionId.substring(0, 8) + '...',
          username: session.username,
          createdAt: session.createdAt,
          lastUsed: session.lastUsed,
          expiresAt: session.expiresAt,
          isActive: true
        });
      }
    }

    return sessions.sort((a, b) => b.lastUsed - a.lastUsed);
  }

  /**
   * Obtener detalles de una sesión admin específica
   */
  getAdminSessionDetails(sessionId) {
    if (!sessionId || !this.adminSessions.has(sessionId)) {
      return null;
    }

    const session = this.adminSessions.get(sessionId);
    const now = Date.now();

    return {
      sessionId: sessionId.substring(0, 8) + '...',
      fullSessionId: sessionId,
      username: session.username,
      createdAt: session.createdAt,
      lastUsed: session.lastUsed,
      expiresAt: session.expiresAt,
      isExpired: now > session.expiresAt,
      remainingTime: Math.max(0, session.expiresAt - now),
      isActive: now <= session.expiresAt
    };
  }
}

module.exports = new AdminService();