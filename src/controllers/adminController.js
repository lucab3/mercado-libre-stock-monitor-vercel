/**
 * Controlador de administración
 * Manejo de login, panel de control y operaciones administrativas
 */

const adminService = require('../services/adminService');
const logger = require('../utils/logger');

class AdminController {

  /**
   * Mostrar página de login de administrador
   */
  async showLoginPage(req, res) {
    if (!adminService.isAdminEnabled()) {
      return res.status(404).send(`
        <html>
          <head><title>Administración No Disponible</title></head>
          <body style="font-family: Arial; text-align: center; padding: 50px;">
            <h1>🚫 Administración No Disponible</h1>
            <p>El sistema de administración está deshabilitado.</p>
            <a href="/">Volver al inicio</a>
          </body>
        </html>
      `);
    }

    const errorMsg = req.query.error ? decodeURIComponent(req.query.error) : '';

    res.send(`
      <html>
        <head>
          <title>Administración - Login</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { 
              font-family: Arial, sans-serif; 
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              margin: 0; 
              padding: 0; 
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            .login-container {
              background: white;
              padding: 40px;
              border-radius: 10px;
              box-shadow: 0 10px 25px rgba(0,0,0,0.2);
              width: 100%;
              max-width: 400px;
            }
            .login-header {
              text-align: center;
              margin-bottom: 30px;
              color: #333;
            }
            .form-group {
              margin-bottom: 20px;
            }
            label {
              display: block;
              margin-bottom: 5px;
              font-weight: bold;
              color: #555;
            }
            input[type="text"], input[type="password"] {
              width: 100%;
              padding: 12px;
              border: 2px solid #ddd;
              border-radius: 5px;
              font-size: 16px;
              box-sizing: border-box;
            }
            input[type="text"]:focus, input[type="password"]:focus {
              outline: none;
              border-color: #667eea;
            }
            .login-btn {
              width: 100%;
              padding: 12px;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              border: none;
              border-radius: 5px;
              font-size: 16px;
              font-weight: bold;
              cursor: pointer;
              transition: transform 0.2s;
            }
            .login-btn:hover {
              transform: translateY(-2px);
            }
            .error-msg {
              background: #ffe6e6;
              color: #d00;
              padding: 10px;
              border-radius: 5px;
              margin-bottom: 20px;
              text-align: center;
            }
            .back-link {
              text-align: center;
              margin-top: 20px;
            }
            .back-link a {
              color: #667eea;
              text-decoration: none;
            }
          </style>
        </head>
        <body>
          <div class="login-container">
            <div class="login-header">
              <h1>🔐 Administración</h1>
              <p>Panel de Control del Sistema</p>
            </div>
            
            ${errorMsg ? `<div class="error-msg">${errorMsg}</div>` : ''}
            
            <form method="POST" action="/admin/login">
              <div class="form-group">
                <label for="username">Usuario:</label>
                <input type="text" id="username" name="username" required autocomplete="username">
              </div>
              
              <div class="form-group">
                <label for="password">Contraseña:</label>
                <input type="password" id="password" name="password" required autocomplete="current-password">
              </div>
              
              <button type="submit" class="login-btn">Iniciar Sesión</button>
            </form>
            
            <div class="back-link">
              <a href="/">← Volver al sistema principal</a>
            </div>
          </div>
        </body>
      </html>
    `);
  }

  /**
   * Procesar login de administrador
   */
  async processLogin(req, res) {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.redirect('/admin/login?error=' + encodeURIComponent('Usuario y contraseña requeridos'));
      }

      // Verificar credenciales
      const isValid = await adminService.verifyAdminCredentials(username, password);
      if (!isValid) {
        logger.warn(`🚨 Intento de login admin fallido: ${username} desde ${req.ip}`);
        return res.redirect('/admin/login?error=' + encodeURIComponent('Credenciales incorrectas'));
      }

      // Crear sesión
      const sessionId = adminService.createAdminSession(username);

      // Establecer cookie segura
      res.cookie('admin-session', sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: adminService.sessionTimeout
      });

      logger.info(`✅ Login admin exitoso: ${username} desde ${req.ip}`);
      res.redirect('/admin/dashboard');

    } catch (error) {
      logger.error(`❌ Error en login admin: ${error.message}`);
      res.redirect('/admin/login?error=' + encodeURIComponent('Error interno del servidor'));
    }
  }

  /**
   * Mostrar dashboard de administración
   */
  async showDashboard(req, res) {
    try {
      logger.info('🔍 Admin Dashboard: iniciando carga...');
      
      const [systemStats, userSessions] = await Promise.all([
        adminService.getSystemStats(),
        adminService.getAllUserSessions()
      ]);

      logger.info('🔍 Admin Dashboard: systemStats =', JSON.stringify(systemStats, null, 2));
      logger.info('🔍 Admin Dashboard: userSessions =', JSON.stringify(userSessions, null, 2));

      const adminSessions = adminService.getAdminSessionsInfo();
      logger.info('🔍 Admin Dashboard: adminSessions =', JSON.stringify(adminSessions, null, 2));

      res.send(`
        <html>
          <head>
            <title>Panel de Administración</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
              body { 
                font-family: Arial, sans-serif; 
                margin: 0; 
                padding: 20px; 
                background: #f5f5f5;
              }
              .header {
                background: white;
                padding: 20px;
                border-radius: 5px;
                margin-bottom: 20px;
                box-shadow: 0 2px 5px rgba(0,0,0,0.1);
              }
              .stats-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                gap: 20px;
                margin-bottom: 30px;
              }
              .stat-card {
                background: white;
                padding: 20px;
                border-radius: 5px;
                box-shadow: 0 2px 5px rgba(0,0,0,0.1);
              }
              .stat-card h3 {
                margin: 0 0 10px 0;
                color: #333;
              }
              .stat-number {
                font-size: 24px;
                font-weight: bold;
                color: #667eea;
              }
              .sessions-table {
                background: white;
                padding: 20px;
                border-radius: 5px;
                box-shadow: 0 2px 5px rgba(0,0,0,0.1);
                overflow-x: auto;
              }
              table {
                width: 100%;
                border-collapse: collapse;
              }
              th, td {
                padding: 12px;
                text-align: left;
                border-bottom: 1px solid #ddd;
              }
              th {
                background: #f8f9fa;
                font-weight: bold;
              }
              .btn {
                padding: 8px 16px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                text-decoration: none;
                display: inline-block;
                font-size: 14px;
              }
              .btn-danger {
                background: #dc3545;
                color: white;
              }
              .btn-primary {
                background: #007bff;
                color: white;
              }
              .logout-btn {
                float: right;
              }
              .refresh-btn {
                margin-left: 10px;
              }
            </style>
            <script>
              function revokeUserSessions(userId) {
                if (confirm('¿Estás seguro de revocar todas las sesiones del usuario ' + userId + '?')) {
                  fetch('/admin/api/revoke-sessions', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ userId: userId })
                  })
                  .then(response => response.json())
                  .then(data => {
                    if (data.success) {
                      alert('Sesiones revocadas exitosamente');
                      location.reload();
                    } else {
                      alert('Error: ' + data.error);
                    }
                  })
                  .catch(error => {
                    alert('Error de conexión: ' + error.message);
                  });
                }
              }
            </script>
          </head>
          <body>
            <div class="header">
              <h1>🔐 Panel de Administración</h1>
              <p>Bienvenido, <strong>${req.admin.username}</strong></p>
              <a href="/admin/logout" class="btn btn-danger logout-btn">Cerrar Sesión</a>
              <a href="/admin/dashboard" class="btn btn-primary refresh-btn">Actualizar</a>
            </div>

            <div class="stats-grid">
              <div class="stat-card">
                <h3>👥 Usuarios Activos</h3>
                <div class="stat-number">${userSessions?.uniqueUsers || 0}</div>
                <p>Usuarios con sesiones activas</p>
              </div>
              
              <div class="stat-card">
                <h3>🔗 Sesiones Totales</h3>
                <div class="stat-number">${userSessions?.activeSessions || 0}</div>
                <p>Promedio: ${(userSessions?.avgSessionsPerUser || 0).toFixed(1)} por usuario</p>
              </div>
              
              <div class="stat-card">
                <h3>📊 Base de Datos</h3>
                <div class="stat-number">${systemStats?.database?.totalProducts || 'N/A'}</div>
                <p>Productos almacenados</p>
              </div>
              
              <div class="stat-card">
                <h3>⚡ Sistema</h3>
                <div class="stat-number">${Math.round((systemStats?.system?.uptime || 0) / 3600)}h</div>
                <p>Tiempo de actividad</p>
              </div>
            </div>

            <div class="sessions-table">
              <h2>🔗 Sesiones de Usuarios Activas</h2>
              <table>
                <thead>
                  <tr>
                    <th>Usuario ID</th>
                    <th>Estado</th>
                    <th>Última Actividad</th>
                    <th>Creada</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  ${(userSessions?.sessions || []).map(session => `
                    <tr>
                      <td><code>${session.userId}</code></td>
                      <td>
                        <span class="badge ${session.sessionActive ? 'bg-success' : 'bg-secondary'}">
                          ${session.status || (session.sessionActive ? 'Activa' : 'Expirada')}
                        </span>
                      </td>
                      <td>${new Date(session.lastActivity).toLocaleString()}</td>
                      <td>${new Date(session.createdAt).toLocaleString()}</td>
                      <td>
                        <button class="btn btn-danger" onclick="revokeUserSessions('${session.userId}')">
                          Revocar Sesiones
                        </button>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
              
              ${(userSessions?.sessions || []).length === 0 ? '<p><em>No hay sesiones de usuarios activas</em></p>' : ''}
            </div>

            <div class="sessions-table" style="margin-top: 20px;">
              <h2>🔐 Sesiones de Administradores</h2>
              <table>
                <thead>
                  <tr>
                    <th>ID Sesión</th>
                    <th>Usuario</th>
                    <th>Creada</th>
                    <th>Último Uso</th>
                    <th>Expira</th>
                  </tr>
                </thead>
                <tbody>
                  ${adminSessions.map(session => `
                    <tr>
                      <td><code>${session.sessionId}</code></td>
                      <td>${session.username}</td>
                      <td>${new Date(session.createdAt).toLocaleString()}</td>
                      <td>${new Date(session.lastUsed).toLocaleString()}</td>
                      <td>${new Date(session.expiresAt).toLocaleString()}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </body>
        </html>
      `);

    } catch (error) {
      logger.error(`❌ Error mostrando dashboard admin: ${error.message}`);
      res.status(500).send('Error interno del servidor');
    }
  }

  /**
   * API para revocar sesiones de usuario
   */
  async revokeUserSessions(req, res) {
    try {
      const { userId } = req.body;

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: 'ID de usuario requerido'
        });
      }

      const revokedCount = await adminService.revokeUserSessions(userId);

      logger.info(`🚨 Admin ${req.admin.username} revocó ${revokedCount} sesiones del usuario ${userId}`);

      res.json({
        success: true,
        message: `${revokedCount} sesiones revocadas exitosamente`,
        revokedCount
      });

    } catch (error) {
      logger.error(`❌ Error revocando sesiones: ${error.message}`);
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor'
      });
    }
  }

  /**
   * Cerrar sesión de administrador
   */
  async logout(req, res) {
    try {
      const sessionId = req.cookies?.['admin-session'];
      if (sessionId) {
        adminService.logoutAdmin(sessionId);
      }

      res.clearCookie('admin-session');
      res.redirect('/admin/login');

    } catch (error) {
      logger.error(`❌ Error en logout admin: ${error.message}`);
      res.redirect('/admin/login');
    }
  }

  /**
   * API para obtener estadísticas (JSON)
   */
  async getStats(req, res) {
    try {
      const stats = await adminService.getSystemStats();
      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      logger.error(`❌ Error obteniendo estadísticas: ${error.message}`);
      res.status(500).json({
        success: false,
        error: 'Error obteniendo estadísticas'
      });
    }
  }

  /**
   * Debug: verificar sesiones directamente desde BD
   */
  async debugSessions(req, res) {
    try {
      const databaseService = require('../services/databaseService');
      const supabaseClient = require('../utils/supabaseClient');
      const sessionManager = require('../utils/sessionManager');
      const adminService = require('../services/adminService');
      
      logger.info('🔍 Debug: iniciando análisis completo de sesiones...');
      
      // === PARTE 1: ANÁLISIS DE BASE DE DATOS ===
      
      // Total count
      const totalCount = await supabaseClient.executeQuery(
        async (client) => {
          const { count } = await client
            .from('user_sessions')
            .select('*', { count: 'exact', head: true });
          return count;
        },
        'debug_total_count'
      );
      
      // Todas las sesiones (muestra)
      const allSessions = await supabaseClient.executeQuery(
        async (client) => {
          return await client
            .from('user_sessions')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(5);
        },
        'debug_all_sessions'
      );
      
      // Solo no revocadas
      const nonRevokedSessions = await supabaseClient.executeQuery(
        async (client) => {
          return await client
            .from('user_sessions')
            .select('*')
            .eq('revoked', false)
            .order('created_at', { ascending: false })
            .limit(5);
        },
        'debug_non_revoked_sessions'
      );
      
      // Solo revocadas
      const revokedSessions = await supabaseClient.executeQuery(
        async (client) => {
          return await client
            .from('user_sessions')
            .select('*')
            .eq('revoked', true)
            .order('created_at', { ascending: false })
            .limit(5);
        },
        'debug_revoked_sessions'
      );
      
      // Sesiones según filtros actuales de admin
      const adminFilteredSessions = await databaseService.getAllActiveSessions();
      
      // === PARTE 2: ANÁLISIS DE MEMORIA ===
      
      const sessionManagerData = {
        activeSessions: sessionManager.activeSessions?.size || 0,
        sessionKeys: sessionManager.activeSessions ? 
          Array.from(sessionManager.activeSessions.keys()).slice(0, 3) : [],
        hasCleanupTimer: !!sessionManager.cleanupInterval,
        lastCleanup: sessionManager.lastCleanup || 'never'
      };
      
      // === PARTE 3: ANÁLISIS DE ADMIN SESSIONS ===
      
      const adminSessionsInfo = adminService.getAdminSessionsInfo();
      const currentAdminSession = req.cookies?.['admin-session'];
      
      // === PARTE 4: ANÁLISIS ESPECÍFICO DEL PROBLEMA ===
      
      // Verificar la sesión admin actual
      let adminSessionValid = false;
      let adminSessionDetails = null;
      
      if (currentAdminSession) {
        adminSessionValid = adminService.validateAdminSession(currentAdminSession);
        adminSessionDetails = adminService.getAdminSessionDetails(currentAdminSession);
      }
      
      // Buscar sesiones que podrían estar causando conflictos
      const potentialConflicts = await supabaseClient.executeQuery(
        async (client) => {
          return await client
            .from('user_sessions')
            .select('*')
            .eq('revoked', false)
            .gte('expires_at', new Date().toISOString())
            .order('created_at', { ascending: false });
        },
        'debug_potential_conflicts'
      );
      
      const now = new Date().toISOString();
      
      res.json({
        success: true,
        timestamp: now,
        analysis: {
          // Datos de BD
          database: {
            totalSessionsInDB: totalCount,
            sampleAllSessions: allSessions.data || [],
            nonRevokedCount: (nonRevokedSessions.data || []).length,
            nonRevokedSample: nonRevokedSessions.data || [],
            revokedCount: (revokedSessions.data || []).length,
            revokedSample: revokedSessions.data || [],
            adminFilteredSessions: adminFilteredSessions,
            adminFilteredCount: adminFilteredSessions.length,
            potentialConflicts: potentialConflicts.data || [],
            potentialConflictsCount: (potentialConflicts.data || []).length
          },
          
          // Datos de memoria
          memory: sessionManagerData,
          
          // Datos de admin
          admin: {
            currentSessionCookie: currentAdminSession ? 
              currentAdminSession.substring(0, 8) + '...' : 'NONE',
            isCurrentSessionValid: adminSessionValid,
            currentSessionDetails: adminSessionDetails,
            allAdminSessions: adminSessionsInfo,
            adminSessionsCount: adminSessionsInfo.length
          },
          
          // Detección de problemas
          issues: {
            memoryVsDatabaseMismatch: sessionManagerData.activeSessions !== (nonRevokedSessions.data || []).length,
            adminSessionsConflicts: adminSessionsInfo.length > 1,
            revokedSessionsStillActive: revokedSessions.data?.some(s => 
              sessionManager.activeSessions?.has(s.session_token)
            ) || false,
            expiredSessionsNotCleaned: (nonRevokedSessions.data || []).filter(s => 
              new Date(s.expires_at) < new Date()
            ).length
          }
        }
      });
      
    } catch (error) {
      logger.error(`❌ Error en debug comprehensivo: ${error.message}`);
      res.status(500).json({
        success: false,
        error: error.message,
        stack: error.stack
      });
    }
  }

  /**
   * Debug: investigar problemas de revocación de sesiones
   */
  async debugRevocation(req, res) {
    try {
      const databaseService = require('../services/databaseService');
      const supabaseClient = require('../utils/supabaseClient');
      const adminService = require('../services/adminService');
      const sessionManager = require('../utils/sessionManager');
      
      logger.info('🔍 Debug: analizando proceso de revocación...');
      
      const currentAdminSession = req.cookies?.['admin-session'];
      const { userId } = req.query; // userId a investigar para revocación
      
      // === PARTE 1: ESTADO ANTES DE LA OPERACIÓN ===
      
      // Verificar estado actual admin
      const adminSessionDetails = currentAdminSession ? 
        adminService.getAdminSessionDetails(currentAdminSession) : null;
      
      // Verificar sesiones del usuario target
      let targetUserSessions = [];
      if (userId) {
        targetUserSessions = await supabaseClient.executeQuery(
          async (client) => {
            return await client
              .from('user_sessions')
              .select('*')
              .eq('user_id', userId)
              .eq('revoked', false);
          },
          'debug_target_user_sessions'
        );
      }
      
      // Verificar todas las sesiones activas
      const allActiveSessions = await supabaseClient.executeQuery(
        async (client) => {
          return await client
            .from('user_sessions')
            .select('*')
            .eq('revoked', false)
            .order('created_at', { ascending: false });
        },
        'debug_all_active_sessions'
      );
      
      // === PARTE 2: ANÁLISIS DE MEMORIA ===
      
      const memoryState = {
        sessionManagerKeys: sessionManager.activeSessions ? 
          Array.from(sessionManager.activeSessions.keys()).slice(0, 5) : [],
        sessionManagerSize: sessionManager.activeSessions?.size || 0,
        adminSessionInMemory: adminService.adminSessions.has(currentAdminSession || ''),
        adminSessionsCount: adminService.adminSessions.size
      };
      
      // === PARTE 3: ANÁLISIS DE CONFLICTOS POTENCIALES ===
      
      // Verificar si hay confusión entre user_sessions y admin_sessions
      const potentialConflicts = {
        adminSessionIdInUserSessions: false,
        userSessionIdsInAdminMemory: false,
        sharedSessionTokens: []
      };
      
      if (currentAdminSession) {
        // Verificar si el admin session está en user_sessions (MAL)
        const adminInUserSessions = await supabaseClient.executeQuery(
          async (client) => {
            return await client
              .from('user_sessions')
              .select('*')
              .eq('session_token', currentAdminSession);
          },
          'debug_admin_in_user_sessions'
        );
        
        potentialConflicts.adminSessionIdInUserSessions = (adminInUserSessions.data || []).length > 0;
      }
      
      // Verificar si hay tokens compartidos entre sistemas
      const allUserTokens = (allActiveSessions.data || []).map(s => s.session_token);
      const allAdminTokens = Array.from(adminService.adminSessions.keys());
      
      potentialConflicts.sharedSessionTokens = allUserTokens.filter(token => 
        allAdminTokens.some(adminToken => adminToken === token)
      );
      
      // === PARTE 4: SIMULACIÓN DE REVOCACIÓN (SIN EJECUTAR) ===
      
      let revocationSimulation = {};
      if (userId) {
        const targetSessions = targetUserSessions.data || [];
        revocationSimulation = {
          targetUserId: userId,
          sessionsToRevoke: targetSessions.length,
          sessionTokensToRevoke: targetSessions.map(s => s.session_token.substring(0, 8) + '...'),
          wouldAffectAdminSession: targetSessions.some(s => s.session_token === currentAdminSession),
          potentialMemoryCleanup: targetSessions.filter(s => 
            sessionManager.activeSessions?.has(s.session_token)
          ).length
        };
      }
      
      res.json({
        success: true,
        timestamp: new Date().toISOString(),
        analysis: {
          adminSession: {
            cookie: currentAdminSession ? currentAdminSession.substring(0, 8) + '...' : 'NONE',
            details: adminSessionDetails,
            isValid: adminSessionDetails?.isActive || false
          },
          
          targetUser: {
            userId: userId || 'NOT_SPECIFIED',
            activeSessions: (targetUserSessions.data || []).length,
            sessionTokens: (targetUserSessions.data || []).map(s => s.session_token.substring(0, 8) + '...')
          },
          
          globalState: {
            totalActiveUserSessions: (allActiveSessions.data || []).length,
            memoryState,
            conflicts: potentialConflicts
          },
          
          revocationSimulation,
          
          recommendations: {
            suspectedIssues: [
              potentialConflicts.adminSessionIdInUserSessions ? 
                'CRÍTICO: Admin session está en user_sessions tabla' : null,
              potentialConflicts.sharedSessionTokens.length > 0 ? 
                'CRÍTICO: Tokens compartidos entre sistemas' : null,
              revocationSimulation.wouldAffectAdminSession ? 
                'CRÍTICO: Revocación afectaría sesión admin' : null
            ].filter(Boolean),
            
            nextSteps: [
              'Verificar que admin sessions sean completamente independientes',
              'Asegurar que revokeAllUserSessions solo afecte user_sessions',
              'Implementar validación para prevenir cross-contamination'
            ]
          }
        }
      });
      
    } catch (error) {
      logger.error(`❌ Error en debug de revocación: ${error.message}`);
      res.status(500).json({
        success: false,
        error: error.message,
        stack: error.stack
      });
    }
  }
}

module.exports = new AdminController();