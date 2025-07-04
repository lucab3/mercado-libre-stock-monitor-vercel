/**
 * Cliente Supabase optimizado para Vercel
 * Configurado para plan gratuito con connection pooling y retry logic
 */

const { createClient } = require('@supabase/supabase-js');
const logger = require('./logger');

class SupabaseClient {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.connectionAttempts = 0;
    this.maxRetries = 3;
    
    this.init();
  }

  /**
   * Inicializar cliente Supabase con configuración optimizada
   */
  init() {
    try {
      // Usar variables automáticas de Vercel-Supabase integration
      const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_JWT_SECRET;

      if (!supabaseUrl || !supabaseKey) {
        logger.error(`❌ Variables Supabase faltantes:`);
        logger.error(`   SUPABASE_URL: ${supabaseUrl ? '✅' : '❌'}`);
        logger.error(`   SUPABASE_ANON_KEY: ${supabaseKey ? '✅' : '❌'}`);
        logger.error(`   Available env vars: ${Object.keys(process.env).filter(k => k.includes('SUPABASE')).join(', ')}`);
        throw new Error('Variables de entorno de Supabase no configuradas');
      }

      // Usar service role key para operaciones del servidor, anon key como fallback
      const keyToUse = serviceRoleKey || supabaseKey;

      // Configuración optimizada para Vercel + plan gratuito
      this.client = createClient(supabaseUrl, keyToUse, {
        auth: {
          persistSession: false, // No persistir sesiones en servidor
          detectSessionInUrl: false
        },
        db: {
          schema: 'public'
        },
        global: {
          headers: {
            'x-application': 'ml-stock-monitor'
          }
        },
        // Configuración de connection pooling
        realtime: {
          enabled: false // Desactivar realtime para ahorrar conexiones
        }
      });

      this.isConnected = true;
      logger.info('✅ Cliente Supabase inicializado correctamente');
      logger.info(`🔗 URL: ${supabaseUrl}`);
      logger.info(`🔑 Usando: ${serviceRoleKey ? 'SERVICE_ROLE' : 'ANON'} key`);

    } catch (error) {
      logger.error(`❌ Error inicializando Supabase: ${error.message}`);
      this.isConnected = false;
      throw error;
    }
  }

  /**
   * Obtener cliente Supabase con verificación de salud
   */
  getClient() {
    if (!this.isConnected || !this.client) {
      logger.warn('⚠️ Cliente Supabase no conectado, reintentando...');
      this.init();
    }
    return this.client;
  }

  /**
   * Ejecutar query con retry automático y manejo de errores
   */
  async executeQuery(queryFn, operation = 'query') {
    const maxRetries = this.maxRetries;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const client = this.getClient();
        const result = await queryFn(client);
        
        if (result.error) {
          throw new Error(`Supabase error: ${result.error.message}`);
        }
        
        // Log solo en modo debug para queries frecuentes
        if (process.env.NODE_ENV === 'development') {
          logger.debug(`✅ Supabase ${operation} exitoso (intento ${attempt})`);
        }
        
        return result;
        
      } catch (error) {
        logger.error(`❌ Error en ${operation} (intento ${attempt}/${maxRetries}): ${error.message}`);
        
        if (attempt === maxRetries) {
          throw new Error(`Falló ${operation} después de ${maxRetries} intentos: ${error.message}`);
        }
        
        // Pausa exponencial entre reintentos
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        logger.info(`⏳ Reintentando en ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Health check del cliente Supabase
   */
  async healthCheck() {
    try {
      const result = await this.executeQuery(
        async (client) => await client.from('app_config').select('key').limit(1),
        'health_check'
      );
      
      return {
        status: 'OK',
        connected: true,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      logger.error(`❌ Health check falló: ${error.message}`);
      return {
        status: 'ERROR',
        connected: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Obtener estadísticas de uso para monitoreo
   */
  async getUsageStats() {
    try {
      const stats = {};
      
      // Contar registros en tablas principales
      const tables = ['products', 'webhook_events', 'scan_control'];
      
      for (const table of tables) {
        try {
          const result = await this.executeQuery(
            async (client) => await client.from(table).select('*', { count: 'exact', head: true }),
            `count_${table}`
          );
          
          stats[table] = result.count || 0;
        } catch (error) {
          stats[table] = 'error';
          logger.warn(`⚠️ No se pudo contar ${table}: ${error.message}`);
        }
      }
      
      return {
        tables: stats,
        timestamp: new Date().toISOString(),
        status: 'OK'
      };
      
    } catch (error) {
      logger.error(`❌ Error obteniendo estadísticas: ${error.message}`);
      return {
        tables: {},
        error: error.message,
        timestamp: new Date().toISOString(),
        status: 'ERROR'
      };
    }
  }

  /**
   * Limpiar conexiones - llamar al cerrar la aplicación
   */
  async cleanup() {
    try {
      if (this.client) {
        // Supabase JS no requiere cierre explícito de conexiones
        this.client = null;
        this.isConnected = false;
        logger.info('🧹 Cliente Supabase limpiado');
      }
    } catch (error) {
      logger.error(`❌ Error en cleanup de Supabase: ${error.message}`);
    }
  }
}

// Exportar instancia singleton
const supabaseClient = new SupabaseClient();

module.exports = supabaseClient;