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
        
        // DEBUG: Log para verificar SKUs en el lote antes de guardar
        logger.info(`🔍 DEBUG SKU - Lote ${i / batchSize + 1}: ${batch.length} productos`);
        batch.slice(0, 2).forEach((product, index) => {
          logger.info(`   Producto ${index + 1}: ID=${product.id}, SKU=${product.seller_sku || 'SIN_SKU'}`);
        });
        
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
            .order('received_at', { ascending: false })
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

  // ==========================================
  // OPERACIONES SCAN CONTROL
  // ==========================================

  /**
   * Inicializar o resetear scan para un usuario
   */
  async initUserScan(userId) {
    try {
      await supabaseClient.executeQuery(
        async (client) => {
          return await client.rpc('init_user_scan', { p_user_id: userId });
        },
        'init_user_scan'
      );
      
      logger.info(`✅ Scan inicializado para usuario: ${userId}`);
      
    } catch (error) {
      logger.error(`❌ Error inicializando scan para usuario ${userId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtener estado actual del scan
   */
  async getScanState(userId) {
    try {
      const result = await supabaseClient.executeQuery(
        async (client) => {
          return await client.rpc('get_scan_state', { p_user_id: userId });
        },
        'get_scan_state'
      );
      
      return result.data && result.data.length > 0 ? result.data[0] : null;
      
    } catch (error) {
      logger.error(`❌ Error obteniendo estado de scan para usuario ${userId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Actualizar progreso del scan
   */
  async updateScanProgress(userId, scrollId, totalProducts, processedProducts, status = 'active') {
    try {
      await supabaseClient.executeQuery(
        async (client) => {
          return await client.rpc('update_scan_progress', {
            p_user_id: userId,
            p_scroll_id: scrollId,
            p_total_products: totalProducts,
            p_processed_products: processedProducts,
            p_status: status
          });
        },
        'update_scan_progress'
      );
      
      logger.debug(`📊 Progreso actualizado para usuario ${userId}: ${processedProducts}/${totalProducts}`);
      
    } catch (error) {
      logger.error(`❌ Error actualizando progreso de scan para usuario ${userId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtener productos por IDs (para filtrar existentes)
   * OPTIMIZADO: Procesa en lotes para evitar límites de Supabase
   */
  async getProductsByIds(productIds, userId) {
    try {
      if (!productIds || productIds.length === 0) {
        return [];
      }

      // Si hay muchos productos, dividir en lotes
      const BATCH_SIZE = 500; // Límite seguro para Supabase IN clause
      if (productIds.length > BATCH_SIZE) {
        logger.info(`🔄 Procesando ${productIds.length} productos en lotes de ${BATCH_SIZE}`);
        const batches = [];
        for (let i = 0; i < productIds.length; i += BATCH_SIZE) {
          batches.push(productIds.slice(i, i + BATCH_SIZE));
        }
        
        const allResults = [];
        for (let i = 0; i < batches.length; i++) {
          const batch = batches[i];
          logger.debug(`📦 Procesando lote ${i + 1}/${batches.length} (${batch.length} productos)`);
          
          const result = await supabaseClient.executeQuery(
            async (client) => {
              return await client
                .from(this.tableName)
                .select('id')
                .eq('user_id', userId)
                .in('id', batch);
            },
            `get_products_by_ids_batch_${i + 1}`
          );
          
          if (result.data) {
            allResults.push(...result.data);
          }
        }
        
        logger.info(`✅ Procesados ${batches.length} lotes, encontrados ${allResults.length} productos existentes`);
        return allResults;
      }

      // Para lotes pequeños, usar consulta directa
      const result = await supabaseClient.executeQuery(
        async (client) => {
          return await client
            .from(this.tableName)
            .select('id')
            .eq('user_id', userId)
            .in('id', productIds);
        },
        'get_products_by_ids'
      );
      
      return result.data || [];
      
    } catch (error) {
      logger.error(`❌ Error obteniendo productos por IDs para usuario ${userId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtener conteo total de productos por usuario
   */
  async getProductCount(userId) {
    try {
      const result = await supabaseClient.executeQuery(
        async (client) => {
          return await client
            .from(this.tableName)
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId);
        },
        'get_product_count'
      );
      
      return result.count || 0;
      
    } catch (error) {
      logger.error(`❌ Error obteniendo conteo de productos para usuario ${userId}: ${error.message}`);
      throw error;
    }
  }

  // ==========================================
  // OPERACIONES ALERTAS DE STOCK
  // ==========================================

  /**
   * Guardar alerta de cambio de stock
   */
  async saveStockAlert(alertData) {
    try {
      const result = await supabaseClient.executeQuery(
        async (client) => {
          return await client
            .from('stock_alerts')
            .insert([alertData])
            .select('id');
        },
        'save_stock_alert'
      );
      
      logger.info(`🚨 Alerta de stock guardada: ${alertData.alert_type} - ${alertData.product_id}`);
      return result.data?.[0];
      
    } catch (error) {
      logger.error(`❌ Error guardando alerta de stock: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtener alertas de stock por usuario
   */
  async getStockAlerts(userId, filters = {}) {
    try {
      const { limit = 50, offset = 0, alertType } = filters;
      
      const result = await supabaseClient.executeQuery(
        async (client) => {
          let query = client
            .from('stock_alerts')
            .select('*')
            .eq('user_id', userId);
          
          if (alertType) {
            query = query.eq('alert_type', alertType);
          }
          
          query = query
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);
          
          return await query;
        },
        'get_stock_alerts'
      );
      
      logger.info(`📋 Obtenidas ${result.data?.length || 0} alertas para usuario ${userId}`);
      return result.data || [];
      
    } catch (error) {
      logger.error(`❌ Error obteniendo alertas de stock: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtener conteo de alertas por tipo
   */
  async getAlertsCount(userId) {
    try {
      const result = await supabaseClient.executeQuery(
        async (client) => {
          return await client
            .from('stock_alerts')
            .select('alert_type')
            .eq('user_id', userId);
        },
        'get_alerts_count'
      );
      
      const alerts = result.data || [];
      const count = {
        total: alerts.length,
        LOW_STOCK: alerts.filter(a => a.alert_type === 'LOW_STOCK').length,
        STOCK_DECREASE: alerts.filter(a => a.alert_type === 'STOCK_DECREASE').length,
        STOCK_INCREASE: alerts.filter(a => a.alert_type === 'STOCK_INCREASE').length
      };
      
      return count;
      
    } catch (error) {
      logger.error(`❌ Error obteniendo conteo de alertas: ${error.message}`);
      throw error;
    }
  }
}

// Exportar instancia singleton
const databaseService = new DatabaseService();

module.exports = databaseService;