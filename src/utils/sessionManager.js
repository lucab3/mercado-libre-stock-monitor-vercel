/**
 * Gestor de sesiones seguras por usuario CON COOKIES
 * Previene que usuarios diferentes compartan tokens
 * Integrado con el sistema existente
 */

const crypto = require('crypto');
const logger = require('./logger');

class SessionManager {
  constructor() {
    // Almacén de sesiones por cookieId
    this.sessions = new Map(); // cookieId -> sessionData
    this.userSessions = new Map(); // userId -> Set of cookieIds
    this.sessionTimeout = 30 * 60 * 1000; // 30 minutos por seguridad
    
    // Limpiar sesiones expiradas cada hora
    this.cleanupInterval = setInterval(() => this.cleanExpiredSessions(), 60 * 60 * 1000);
    this.lastCleanup = Date.now();
    
    logger.info('🔐 Session Manager con Cookies inicializado');
  }

  /**
   * Propiedad para compatibilidad con debug endpoints
   */
  get activeSessions() {
    return this.sessions;
  }

  /**
   * Genera un ID de cookie único y seguro
   */
  generateCookieId() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * MODIFICADO: Crea una nueva sesión para un usuario EN UN NAVEGADOR ESPECÍFICO
   */
  createSession(userId, tokens, cookieId = null) {
    // Si no hay cookieId, generar uno nuevo
    if (!cookieId) {
      cookieId = this.generateCookieId();
    }
    
    const sessionData = {
      cookieId,
      userId,
      tokens,
      createdAt: Date.now(),
      expiresAt: Date.now() + this.sessionTimeout,
      lastActivity: Date.now(),
      userAgent: null // Se puede agregar después
    };
    
    // Limpiar sesión anterior de este navegador (si existe)
    this.invalidateSession(cookieId);
    
    // Agregar nueva sesión
    this.sessions.set(cookieId, sessionData);
    
    // Registrar qué cookieIds pertenecen a este usuario
    if (!this.userSessions.has(userId)) {
      this.userSessions.set(userId, new Set());
    }
    this.userSessions.get(userId).add(cookieId);
    
    logger.info(`🔑 Sesión creada para usuario ${userId}`);
    
    return cookieId;
  }

  /**
   * NUEVO: Obtiene sesión por cookieId (del navegador específico)
   */
  getSessionByCookie(cookieId) {
    if (!cookieId) {
      return null;
    }

    const session = this.sessions.get(cookieId);
    
    if (!session) {
      return null;
    }

    // Verificar si la sesión ha expirado
    if (Date.now() > session.expiresAt) {
      logger.warn(`⏰ Sesión expirada para usuario`);
      this.invalidateSession(cookieId);
      return null;
    }

    // Actualizar última actividad
    session.lastActivity = Date.now();
    
    return session;
  }

  /**
   * MANTENIDO: Obtiene los datos de una sesión válida (compatibilidad)
   */
  getSession(sessionId) {
    // Para compatibilidad con el código existente
    return this.getSessionByCookie(sessionId);
  }

  /**
   * MODIFICADO: Valida si un cookieId pertenece a un usuario específico
   */
  validateUserSession(cookieId, expectedUserId) {
    const session = this.getSessionByCookie(cookieId);
    
    if (!session) {
      return false;
    }

    if (session.userId !== expectedUserId) {
      logger.error(`🚨 SEGURIDAD: Intento de acceso con sesión incorrecta. Usuario actual: ${session.userId}, esperado: ${expectedUserId}`);
      return false;
    }

    return true;
  }

  /**
   * MODIFICADO: Invalida una sesión específica por cookieId
   */
  invalidateSession(cookieId) {
    const session = this.sessions.get(cookieId);
    if (session) {
      // Remover de sesiones de usuario
      const userCookies = this.userSessions.get(session.userId);
      if (userCookies) {
        userCookies.delete(cookieId);
        if (userCookies.size === 0) {
          this.userSessions.delete(session.userId);
        }
      }
      
      this.sessions.delete(cookieId);
      logger.info(`🗑️ Sesión invalidada para usuario: ${session.userId}`);
    }
  }

  /**
   * MODIFICADO: Invalida TODAS las sesiones de un usuario (todos sus navegadores)
   */
  invalidateUserSessions(userId) {
    const userCookies = this.userSessions.get(userId);
    if (!userCookies) {
      return 0;
    }

    let count = 0;
    for (const cookieId of userCookies) {
      if (this.sessions.has(cookieId)) {
        this.sessions.delete(cookieId);
        count++;
      }
    }
    
    this.userSessions.delete(userId);
    
    if (count > 0) {
      logger.info(`🧹 ${count} sesiones invalidadas para usuario ${userId} (todos los navegadores)`);
    }
    
    return count;
  }

  /**
   * MODIFICADO: Invalida todas las sesiones de un usuario (alias para compatibilidad)
   */
  invalidateAllUserSessions(userId) {
    return this.invalidateUserSessions(userId);
  }

  /**
   * MANTENIDO: Limpia sesiones expiradas
   */
  cleanExpiredSessions() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [cookieId, session] of this.sessions.entries()) {
      if (now > session.expiresAt) {
        this.invalidateSession(cookieId);
        cleaned++;
      }
    }
    
    this.lastCleanup = now;
    
    if (cleaned > 0) {
      logger.info(`🧹 ${cleaned} sesiones expiradas limpiadas`);
    }
  }

  /**
   * MEJORADO: Obtiene estadísticas de sesiones activas
   */
  getStats() {
    const now = Date.now();
    const activeSessions = Array.from(this.sessions.values()).filter(
      session => now <= session.expiresAt
    );

    const uniqueUsers = new Set(activeSessions.map(s => s.userId));
    const sessionsByUser = {};
    
    for (const userId of uniqueUsers) {
      const userCookies = this.userSessions.get(userId) || new Set();
      sessionsByUser[userId] = userCookies.size;
    }

    return {
      totalSessions: this.sessions.size,
      activeSessions: activeSessions.length,
      uniqueUsers: uniqueUsers.size,
      sessionsByUser,
      avgSessionsPerUser: uniqueUsers.size > 0 ? activeSessions.length / uniqueUsers.size : 0
    };
  }

  /**
   * NUEVO: Obtener sesiones de un usuario específico
   */
  getUserSessions(userId) {
    const userCookies = this.userSessions.get(userId);
    if (!userCookies) {
      return [];
    }

    const sessions = [];
    for (const cookieId of userCookies) {
      const session = this.sessions.get(cookieId);
      if (session && Date.now() <= session.expiresAt) {
        sessions.push({
          sessionActive: true,
          createdAt: session.createdAt,
          lastActivity: session.lastActivity,
          userAgent: session.userAgent || 'Unknown'
        });
      }
    }

    return sessions;
  }

  /**
   * MANTENIDO: Obtiene información de sesión (sin tokens sensibles)
   */
  getSessionInfo(sessionId) {
    const session = this.getSessionByCookie(sessionId);
    if (!session) {
      return null;
    }

    return {
      sessionActive: true,
      userId: session.userId,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      lastActivity: session.lastActivity,
      isValid: Date.now() <= session.expiresAt
    };
  }

  /**
   * NUEVO: Alias para generateCookieId para compatibilidad
   */
  generateSessionId() {
    return this.generateCookieId();
  }

  /**
   * NUEVO: Crear sesión temporal para refresh de tokens en webhooks
   */
  createTemporarySession(userId, tokens) {
    const tempCookieId = this.generateCookieId();
    
    const sessionData = {
      cookieId: tempCookieId,
      userId,
      tokens,
      createdAt: Date.now(),
      expiresAt: Date.now() + (5 * 60 * 1000), // 5 minutos
      lastActivity: Date.now(),
      userAgent: 'webhook-temp-session',
      isTemporary: true
    };
    
    this.sessions.set(tempCookieId, sessionData);
    
    // NO agregar a userSessions porque es temporal
    logger.debug(`🔄 Sesión temporal creada para usuario ${userId}`);
    
    return {
      cookieId: tempCookieId,
      session: sessionData
    };
  }
}

module.exports = new SessionManager();