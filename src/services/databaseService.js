/**
 * Servicio de base de datos para operaciones con Supabase
 * Optimizado para plan gratuito con queries eficientes
 */

const supabaseClient = require('../utils/supabaseClient');
const logger = require('../utils/logger');

class DatabaseService {
  constructor() {
    this.tableName = 'products';
    this.webhookTableName = 'webhook_events';
    this.scanTableName = 'scan_control';
    this.configTableName = 'app_config';
  }

  // ==========================================
  // OPERACIONES PRODUCTOS
  // ==========================================

  /**
   * Obtener todos los productos de un usuario con filtros opcionales
   */
  async getProducts(userId, filters = {}) {
    try {
      const { status, limit, offset } = filters;
      
      const result = await supabaseClient.executeQuery(
        async (client) => {
          let query = client
            .from(this.tableName)
            .select('*')
            .eq('user_id', userId);
          
          if (status) {
            query = query.eq('status', status);
          }
          
          if (limit) {
            query = query.limit(limit);
          }
          
          if (offset) {
            query = query.range(offset, offset + (limit || 100) - 1);
          }
          
          // Ordenar por fecha de actualización más reciente
          query = query.order('updated_at', { ascending: false });
          
          return await query;
        },
        'get_products'
      );
      
      logger.info(`📋 Obtenidos ${result.data?.length || 0} productos para usuario ${userId}`);
      return result.data || [];
      
    } catch (error) {
      logger.error(`❌ Error obteniendo productos: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtener productos con stock bajo
   */
  async getLowStockProducts(userId, threshold = 5) {
    try {
      const result = await supabaseClient.executeQuery(
        async (client) => {
          return await client
            .from(this.tableName)
            .select('*')
            .eq('user_id', userId)
            // Removed status filter - show all products regardless of status
            .lte('available_quantity', threshold)
            .order('available_quantity', { ascending: true });
        },
        'get_low_stock_products'
      );
      
      logger.info(`📉 Encontrados ${result.data?.length || 0} productos con stock bajo para usuario ${userId}`);
      return result.data || [];
      
    } catch (error) {
      logger.error(`❌ Error obteniendo productos con stock bajo: ${error.message}`);
      throw error;
    }
  }

  /**
   * Insertar o actualizar un producto (UPSERT)
   */
  async upsertProduct(productData) {
    try {
      // Preparar datos con timestamps
      const dataToInsert = {
        ...productData,
        updated_at: new Date().toISOString()
      };
      
      const result = await supabaseClient.executeQuery(
        async (client) => {
          return await client
            .from(this.tableName)
            .upsert(dataToInsert, { 
              onConflict: 'id',
              returning: 'minimal' // Reducir transferencia de datos
            });
        },
        'upsert_product'
      );
      
      logger.debug(`💾 Producto ${productData.id} guardado/actualizado`);
      return result;
      
    } catch (error) {
      logger.error(`❌ Error guardando producto ${productData.id}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Insertar múltiples productos de forma eficiente
   */
  async upsertMultipleProducts(productsData) {
    try {
      if (!productsData || productsData.length === 0) {
        return { data: [], count: 0 };
      }
      
      // Procesar en lotes para evitar timeouts
      const batchSize = 100;
      const results = [];
      
      for (let i = 0; i < productsData.length; i += batchSize) {
        const batch = productsData.slice(i, i + batchSize);
        
        // Preparar lote con timestamps
        const batchWithTimestamps = batch.map(product => ({
          ...product,
          updated_at: new Date().toISOString()
        }));
        
        const result = await supabaseClient.executeQuery(
          async (client) => {
            return await client
              .from(this.tableName)
              .upsert(batchWithTimestamps, { 
                onConflict: 'id',
                returning: 'minimal'
              });
          },
          `upsert_batch_${i / batchSize + 1}`
        );
        
        results.push(result);
        
        // Pequeña pausa entre lotes para no saturar
        if (i + batchSize < productsData.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      logger.info(`💾 Guardados/actualizados ${productsData.length} productos en ${Math.ceil(productsData.length / batchSize)} lotes`);
      return { success: true, batches: results.length };
      
    } catch (error) {
      logger.error(`❌ Error guardando múltiples productos: ${error.message}`);
      throw error;
    }
  }

  /**
   * Actualizar última sincronización de productos
   */
  async updateLastSync(productIds, syncType = 'api') {
    try {
      const timestamp = new Date().toISOString();
      const updateField = syncType === 'webhook' ? 'last_webhook_sync' : 'last_api_sync';
      
      const result = await supabaseClient.executeQuery(
        async (client) => {
          return await client
            .from(this.tableName)
            .update({ 
              [updateField]: timestamp,
              updated_at: timestamp 
            })
            .in('id', productIds);
        },
        'update_last_sync'
      );
      
      logger.debug(`🔄 Actualizada última sincronización ${syncType} para ${productIds.length} productos`);
      return result;
      
    } catch (error) {
      logger.error(`❌ Error actualizando última sincronización: ${error.message}`);
      throw error;
    }
  }

  // ==========================================
  // OPERACIONES WEBHOOKS
  // ==========================================

  /**
   * Guardar evento de webhook
   */
  async saveWebhookEvent(webhookData) {
    try {
      const result = await supabaseClient.executeQuery(
        async (client) => {
          return await client
            .from(this.webhookTableName)
            .insert([webhookData])
            .select('id');
        },
        'save_webhook_event'
      );
      
      logger.info(`🔔 Webhook guardado: ${webhookData.webhook_id}`);
      return result.data?.[0];
      
    } catch (error) {
      // Si es error de duplicado, no es crítico
      if (error.message.includes('unique_webhook_id')) {
        logger.warn(`⚠️ Webhook duplicado ignorado: ${webhookData.webhook_id}`);
        return null;
      }
      
      logger.error(`❌ Error guardando webhook: ${error.message}`);
      throw error;
    }
  }

  /**
   * Marcar webhook como procesado
   */
  async markWebhookProcessed(webhookId, success = true, result = null) {
    try {
      const updateData = {
        processed: true,
        processed_at: new Date().toISOString(),
        processing_status: success ? 'completed' : 'failed'
      };
      
      if (result) {
        updateData.processing_result = result;
      }
      
      await supabaseClient.executeQuery(
        async (client) => {
          return await client
            .from(this.webhookTableName)
            .update(updateData)
            .eq('webhook_id', webhookId);
        },
        'mark_webhook_processed'
      );
      
      logger.debug(`✅ Webhook ${webhookId} marcado como procesado`);
      
    } catch (error) {
      logger.error(`❌ Error marcando webhook como procesado: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtener webhooks no procesados
   */
  async getPendingWebhooks(limit = 50) {
    try {
      const result = await supabaseClient.executeQuery(
        async (client) => {
          return await client
            .from(this.webhookTableName)
            .select('*')
            .eq('processed', false)
            .order('received_at', { ascending: true })
            .limit(limit);
        },
        'get_pending_webhooks'
      );
      
      return result.data || [];
      
    } catch (error) {
      logger.error(`❌ Error obteniendo webhooks pendientes: ${error.message}`);
      throw error;
    }
  }

  // ==========================================
  // OPERACIONES CONFIGURACIÓN
  // ==========================================

  /**
   * Obtener configuración
   */
  async getConfig(key) {
    try {
      const result = await supabaseClient.executeQuery(
        async (client) => {
          return await client
            .from(this.configTableName)
            .select('value')
            .eq('key', key)
            .single();
        },
        'get_config'
      );
      
      return result.data?.value;
      
    } catch (error) {
      logger.warn(`⚠️ Configuración '${key}' no encontrada`);
      return null;
    }
  }

  /**
   * Actualizar configuración
   */
  async updateConfig(key, value) {
    try {
      const result = await supabaseClient.executeQuery(
        async (client) => {
          return await client
            .from(this.configTableName)
            .upsert({ 
              key, 
              value, 
              updated_at: new Date().toISOString() 
            });
        },
        'update_config'
      );
      
      logger.info(`⚙️ Configuración '${key}' actualizada`);
      return result;
      
    } catch (error) {
      logger.error(`❌ Error actualizando configuración '${key}': ${error.message}`);
      throw error;
    }
  }

  // ==========================================
  // OPERACIONES DE MANTENIMIENTO
  // ==========================================

  /**
   * Ejecutar limpieza automática
   */
  async runMaintenance() {
    try {
      logger.info('🧹 Iniciando mantenimiento automático...');
      
      // Ejecutar funciones de limpieza
      await supabaseClient.executeQuery(
        async (client) => await client.rpc('cleanup_old_webhooks'),
        'cleanup_webhooks'
      );
      
      await supabaseClient.executeQuery(
        async (client) => await client.rpc('cleanup_old_scans'),
        'cleanup_scans'
      );
      
      logger.info('✅ Mantenimiento automático completado');
      
    } catch (error) {
      logger.error(`❌ Error en mantenimiento: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtener estadísticas de la base de datos
   */
  async getStats() {
    try {
      const stats = await supabaseClient.getUsageStats();
      
      // Agregar estadísticas adicionales específicas
      const lowStockCount = await supabaseClient.executeQuery(
        async (client) => {
          return await client
            .from(this.tableName)
            .select('*', { count: 'exact', head: true })
            .eq('status', 'active')
            .lte('available_quantity', 5);
        },
        'count_low_stock'
      );
      
      const pendingWebhooks = await supabaseClient.executeQuery(
        async (client) => {
          return await client
            .from(this.webhookTableName)
            .select('*', { count: 'exact', head: true })
            .eq('processed', false);
        },
        'count_pending_webhooks'
      );
      
      return {
        ...stats,
        lowStockProducts: lowStockCount.count || 0,
        pendingWebhooks: pendingWebhooks.count || 0
      };
      
    } catch (error) {
      logger.error(`❌ Error obteniendo estadísticas: ${error.message}`);
      throw error;
    }
  }
}

// Exportar instancia singleton
const databaseService = new DatabaseService();

module.exports = databaseService;