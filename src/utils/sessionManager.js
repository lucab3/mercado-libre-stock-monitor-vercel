/**
 * Gestor de sesiones seguras por usuario
 * Previene que usuarios diferentes compartan tokens
 */

const crypto = require('crypto');
const logger = require('./logger');

class SessionManager {
  constructor() {
    // Almacén temporal de sesiones (en memoria para Vercel)
    this.sessions = new Map();
    this.sessionTimeout = 6 * 60 * 60 * 1000; // 6 horas como ML tokens
    
    // Limpiar sesiones expiradas cada hora
    setInterval(() => this.cleanExpiredSessions(), 60 * 60 * 1000);
    
    logger.info('🔐 Session Manager inicializado');
  }

  /**
   * Genera un ID de sesión único y seguro
   */
  generateSessionId() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Crea una nueva sesión para un usuario
   */
  createSession(userId, tokens) {
    const sessionId = this.generateSessionId();
    
    const sessionData = {
      sessionId,
      userId,
      tokens,
      createdAt: Date.now(),
      expiresAt: Date.now() + this.sessionTimeout,
      lastActivity: Date.now()
    };
    
    // Invalidar sesiones anteriores del mismo usuario (opcional)
    this.invalidateUserSessions(userId);
    
    this.sessions.set(sessionId, sessionData);
    
    logger.info(`🔑 Nueva sesión creada para usuario ${userId}: ${sessionId.substring(0, 8)}...`);
    
    return sessionId;
  }

  /**
   * Obtiene los datos de una sesión válida
   */
  getSession(sessionId) {
    if (!sessionId) {
      return null;
    }

    const session = this.sessions.get(sessionId);
    
    if (!session) {
      logger.warn(`⚠️ Sesión no encontrada: ${sessionId.substring(0, 8)}...`);
      return null;
    }

    // Verificar si la sesión ha expirado
    if (Date.now() > session.expiresAt) {
      logger.warn(`⏰ Sesión expirada: ${sessionId.substring(0, 8)}...`);
      this.sessions.delete(sessionId);
      return null;
    }

    // Actualizar última actividad
    session.lastActivity = Date.now();
    
    return session;
  }

  /**
   * Valida si una sesión pertenece a un usuario específico
   */
  validateUserSession(sessionId, expectedUserId) {
    const session = this.getSession(sessionId);
    
    if (!session) {
      return false;
    }

    if (session.userId !== expectedUserId) {
      logger.error(`🚨 SEGURIDAD: Intento de acceso con sesión incorrecta. Sesión: ${session.userId}, Esperado: ${expectedUserId}`);
      return false;
    }

    return true;
  }

  /**
   * Invalida una sesión específica
   */
  invalidateSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.sessions.delete(sessionId);
      logger.info(`🗑️ Sesión invalidada: ${sessionId.substring(0, 8)}... (Usuario: ${session.userId})`);
    }
  }

  /**
   * Invalida todas las sesiones de un usuario
   */
  invalidateUserSessions(userId) {
    let count = 0;
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.userId === userId) {
        this.sessions.delete(sessionId);
        count++;
      }
    }
    
    if (count > 0) {
      logger.info(`🧹 ${count} sesiones invalidadas para usuario ${userId}`);
    }
  }

  /**
   * Limpia sesiones expiradas
   */
  cleanExpiredSessions() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [sessionId, session] of this.sessions.entries()) {
      if (now > session.expiresAt) {
        this.sessions.delete(sessionId);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      logger.info(`🧹 ${cleaned} sesiones expiradas limpiadas`);
    }
  }

  /**
   * Obtiene estadísticas de sesiones activas
   */
  getStats() {
    const now = Date.now();
    const activeSessions = Array.from(this.sessions.values()).filter(
      session => now <= session.expiresAt
    );

    return {
      totalSessions: this.sessions.size,
      activeSessions: activeSessions.length,
      uniqueUsers: new Set(activeSessions.map(s => s.userId)).size
    };
  }

  /**
   * Obtiene información de sesión (sin tokens sensibles)
   */
  getSessionInfo(sessionId) {
    const session = this.getSession(sessionId);
    if (!session) {
      return null;
    }

    return {
      sessionId: session.sessionId.substring(0, 8) + '...',
      userId: session.userId,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      lastActivity: session.lastActivity,
      isValid: Date.now() <= session.expiresAt
    };
  }
}

module.exports = new SessionManager();