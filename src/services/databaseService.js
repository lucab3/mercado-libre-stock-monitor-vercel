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
            .select('id,title,seller_sku,category_id,available_quantity,price,status,health,permalink,condition,listing_type_id,last_webhook_sync,last_api_sync,last_webhook_update,updated_at,created_at')
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
            .select('id,title,seller_sku,category_id,available_quantity,price,status,health,permalink,condition,listing_type_id,last_webhook_sync,last_api_sync,last_webhook_update,updated_at,created_at')
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
   * Limpiar webhooks procesados más antiguos que X días
   */
  async cleanupProcessedWebhooks(daysOld = 7) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);
      
      const result = await supabaseClient.executeQuery(
        async (client) => {
          return await client
            .from(this.webhookTableName)
            .delete()
            .eq('processed', true)
            .lt('processed_at', cutoffDate.toISOString());
        },
        'cleanup_processed_webhooks'
      );
      
      const deletedCount = result.count || 0;
      logger.info(`🧹 Eliminados ${deletedCount} webhooks procesados antiguos (>${daysOld} días) - Optimización egress`);
      return deletedCount;
      
    } catch (error) {
      logger.error(`❌ Error limpiando webhooks procesados: ${error.message}`);
      throw error;
    }
  }

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
      
      // Limpiar webhooks procesados antiguos para optimizar egress
      await this.cleanupProcessedWebhooks(7);
      
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
   * Limpiar todos los webhooks de un usuario específico
   */
  async clearUserWebhooks(userId) {
    try {
      const result = await supabaseClient.executeQuery(
        async (client) => {
          return await client
            .from(this.webhookTableName)
            .delete()
            .eq('user_id', userId);
        },
        'clear_user_webhooks'
      );
      
      const deletedCount = result.count || 0;
      logger.info(`🧹 Eliminados ${deletedCount} webhooks para usuario ${userId} - Optimización egress Supabase`);
      return deletedCount;
      
    } catch (error) {
      logger.error(`❌ Error limpiando webhooks para usuario ${userId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Inicializar o resetear scan para un usuario
   * Incluye limpieza de webhooks para optimizar Supabase egress
   */
  async initUserScan(userId) {
    try {
      // 1. Limpiar webhooks existentes del usuario para reducir egress
      logger.info(`🧹 Limpiando webhooks existentes para usuario ${userId}...`);
      await this.clearUserWebhooks(userId);
      
      // 2. Inicializar scan
      await supabaseClient.executeQuery(
        async (client) => {
          return await client.rpc('init_user_scan', { p_user_id: userId });
        },
        'init_user_scan'
      );
      
      logger.info(`✅ Scan inicializado para usuario: ${userId} (webhooks limpiados para optimización)`);
      
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

  // ==========================================
  // OPERACIONES TOKENS PERSISTENTES
  // ==========================================

  /**
   * Guardar tokens de usuario en BD
   */
  async saveTokens(userId, tokens, metadata = {}) {
    try {
      const tokenData = {
        user_id: userId,
        access_token_encrypted: tokens.access_token, // Sin encriptación por ahora
        refresh_token_encrypted: tokens.refresh_token || null,
        token_type: tokens.token_type || 'Bearer',
        expires_at: new Date(tokens.expires_at).toISOString(),
        scope: tokens.scope || null,
        metadata: {
          ...metadata,
          saved_at: new Date().toISOString()
        },
        updated_at: new Date().toISOString(),
        last_used: new Date().toISOString()
      };

      const result = await supabaseClient.executeQuery(
        async (client) => {
          return await client
            .from('tokens_storage')
            .upsert(tokenData, { 
              onConflict: 'user_id',
              returning: 'minimal' 
            });
        },
        'save_tokens'
      );

      logger.info(`🔑 Tokens guardados en BD para usuario ${userId}`);
      return { success: true, data: result.data };
      
    } catch (error) {
      logger.error(`❌ Error guardando tokens en BD: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtener tokens de usuario desde BD
   */
  async getTokens(userId) {
    try {
      const result = await supabaseClient.executeQuery(
        async (client) => {
          return await client
            .from('tokens_storage')
            .select('access_token_encrypted,refresh_token_encrypted,token_type,expires_at,scope')
            .eq('user_id', userId)
            .single();
        },
        'get_tokens'
      );

      if (!result.data) {
        return null;
      }

      const tokenData = result.data;
      
      // Verificar si el token ha expirado
      if (new Date() >= new Date(tokenData.expires_at)) {
        logger.warn(`⏰ Token expirado para usuario ${userId}`);
        return null;
      }

      // Actualizar last_used
      await this.updateTokensLastUsed(userId);

      return {
        access_token: tokenData.access_token_encrypted,
        refresh_token: tokenData.refresh_token_encrypted,
        token_type: tokenData.token_type,
        expires_at: new Date(tokenData.expires_at).getTime(),
        scope: tokenData.scope,
        user_id: userId
      };
      
    } catch (error) {
      if (error.message.includes('No rows returned')) {
        logger.debug(`📭 No hay tokens en BD para usuario ${userId}`);
        return null;
      }
      logger.error(`❌ Error obteniendo tokens desde BD: ${error.message}`);
      throw error;
    }
  }

  /**
   * Actualizar última vez que se usaron los tokens
   */
  async updateTokensLastUsed(userId) {
    try {
      await supabaseClient.executeQuery(
        async (client) => {
          return await client
            .from('tokens_storage')
            .update({ 
              last_used: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('user_id', userId);
        },
        'update_tokens_last_used'
      );
    } catch (error) {
      logger.error(`❌ Error actualizando last_used: ${error.message}`);
      // No lanzar error, es solo metadata
    }
  }

  /**
   * Limpiar tokens expirados de BD
   */
  async cleanupExpiredTokens() {
    try {
      const result = await supabaseClient.executeQuery(
        async (client) => {
          return await client
            .from('tokens_storage')
            .delete()
            .lt('expires_at', new Date().toISOString());
        },
        'cleanup_expired_tokens'
      );

      const deletedCount = result.data?.length || 0;
      if (deletedCount > 0) {
        logger.info(`🧹 Limpiados ${deletedCount} tokens expirados de BD`);
      }
      
      return deletedCount;
      
    } catch (error) {
      logger.error(`❌ Error limpiando tokens expirados: ${error.message}`);
      throw error;
    }
  }

  /**
   * Eliminar tokens de un usuario específico
   */
  async clearUserTokens(userId) {
    try {
      const result = await supabaseClient.executeQuery(
        async (client) => {
          return await client
            .from('tokens_storage')
            .delete()
            .eq('user_id', userId);
        },
        'clear_user_tokens'
      );

      logger.info(`🗑️ Tokens eliminados de BD para usuario ${userId}`);
      return { success: true, data: result.data };
      
    } catch (error) {
      logger.error(`❌ Error eliminando tokens de BD: ${error.message}`);
      throw error;
    }
  }

  // ==========================================
  // OPERACIONES SYNC CONTROL
  // ==========================================

  /**
   * Guardar/actualizar timestamp de sync inicial por usuario
   */
  async saveSyncControl(userId, productsCount = 0) {
    try {
      const syncData = {
        user_id: userId,
        last_full_sync: new Date().toISOString(),
        products_count: productsCount,
        updated_at: new Date().toISOString()
      };

      const result = await supabaseClient.executeQuery(
        async (client) => {
          return await client
            .from('sync_control')
            .upsert(syncData, { 
              onConflict: 'user_id',
              returning: 'minimal' 
            });
        },
        'save_sync_control'
      );

      logger.info(`📅 Sync control guardado para usuario ${userId}: ${syncData.last_full_sync}`);
      return { success: true, data: result.data };
      
    } catch (error) {
      logger.error(`❌ Error guardando sync control: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtener timestamp del último sync completo de un usuario
   */
  async getLastSyncTime(userId) {
    try {
      const result = await supabaseClient.executeQuery(
        async (client) => {
          return await client
            .from('sync_control')
            .select('last_full_sync, products_count')
            .eq('user_id', userId)
            .single();
        },
        'get_last_sync_time'
      );

      if (!result.data) {
        return null;
      }

      return {
        lastSync: new Date(result.data.last_full_sync),
        productsCount: result.data.products_count
      };
      
    } catch (error) {
      if (error.message.includes('No rows returned')) {
        logger.debug(`📭 No hay sync control para usuario ${userId}`);
        return null;
      }
      logger.error(`❌ Error obteniendo último sync: ${error.message}`);
      throw error;
    }
  }

  /**
   * Verificar si webhook debe ser procesado (posterior al último sync)
   */
  async shouldProcessWebhook(userId, webhookTimestamp) {
    try {
      const syncInfo = await this.getLastSyncTime(userId);
      
      if (!syncInfo) {
        logger.info(`⚠️ No hay sync inicial para usuario ${userId} - procesando webhook`);
        return true; // Si no hay sync, procesar
      }

      const webhookTime = new Date(webhookTimestamp);
      const shouldProcess = webhookTime > syncInfo.lastSync;

      logger.info(`🕐 VALIDACIÓN TEMPORAL:`);
      logger.info(`   • Último sync: ${syncInfo.lastSync.toISOString()}`);
      logger.info(`   • Webhook time: ${webhookTime.toISOString()}`);
      logger.info(`   • Procesar: ${shouldProcess ? 'SÍ' : 'NO (anterior al sync)'}`);

      return shouldProcess;
      
    } catch (error) {
      logger.error(`❌ Error validando webhook temporal: ${error.message}`);
      return true; // En caso de error, procesar para no perder webhooks
    }
  }

  // ==========================================
  // OPERACIONES USER SESSIONS
  // ==========================================

  /**
   * Crear nueva sesión de usuario en BD
   */
  async createUserSession(sessionId, userId, ipAddress = null, userAgent = null) {
    try {
      const sessionData = {
        session_id: sessionId,
        user_id: userId,
        created_at: new Date().toISOString(),
        last_used: new Date().toISOString(),
        expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(), // 6 horas
        ip_address: ipAddress,
        user_agent: userAgent,
        revoked: false
      };

      const result = await supabaseClient.executeQuery(
        async (client) => {
          return await client
            .from('user_sessions')
            .insert([sessionData])
            .select('session_id');
        },
        'create_user_session'
      );

      logger.info(`🔐 Sesión creada en BD: ${sessionId.substring(0, 8)}... para usuario ${userId}`);
      return result.data?.[0];
      
    } catch (error) {
      logger.error(`❌ Error creando sesión en BD: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtener sesión válida desde BD
   */
  async getUserSession(sessionId) {
    try {
      const result = await supabaseClient.executeQuery(
        async (client) => {
          return await client
            .from('user_sessions')
            .select('*')
            .eq('session_id', sessionId)
            .eq('revoked', false)
            .gt('expires_at', new Date().toISOString())
            .single();
        },
        'get_user_session'
      );

      if (result.data) {
        // Actualizar last_used
        await this.updateSessionLastUsed(sessionId);
        
        logger.debug(`✅ Sesión válida encontrada: ${sessionId.substring(0, 8)}... para usuario ${result.data.user_id}`);
        return {
          sessionId: result.data.session_id,
          userId: result.data.user_id,
          createdAt: result.data.created_at,
          lastUsed: result.data.last_used,
          expiresAt: result.data.expires_at,
          ipAddress: result.data.ip_address,
          userAgent: result.data.user_agent
        };
      }

      return null;
      
    } catch (error) {
      if (error.message.includes('No rows returned')) {
        logger.debug(`📭 No hay sesión válida para ${sessionId.substring(0, 8)}...`);
        return null;
      }
      logger.error(`❌ Error obteniendo sesión: ${error.message}`);
      throw error;
    }
  }

  /**
   * Actualizar último uso de sesión
   */
  async updateSessionLastUsed(sessionId) {
    try {
      await supabaseClient.executeQuery(
        async (client) => {
          return await client
            .from('user_sessions')
            .update({ 
              last_used: new Date().toISOString()
            })
            .eq('session_id', sessionId);
        },
        'update_session_last_used'
      );
    } catch (error) {
      logger.error(`❌ Error actualizando last_used de sesión: ${error.message}`);
      // No lanzar error, es solo metadata
    }
  }

  /**
   * Revocar sesión específica
   */
  async revokeUserSession(sessionId) {
    try {
      const result = await supabaseClient.executeQuery(
        async (client) => {
          return await client
            .from('user_sessions')
            .update({ 
              revoked: true,
              revoked_at: new Date().toISOString()
            })
            .eq('session_id', sessionId);
        },
        'revoke_user_session'
      );

      logger.info(`🚫 Sesión revocada: ${sessionId.substring(0, 8)}...`);
      return result;
      
    } catch (error) {
      logger.error(`❌ Error revocando sesión: ${error.message}`);
      throw error;
    }
  }

  /**
   * Revocar todas las sesiones de un usuario
   */
  async revokeAllUserSessions(userId) {
    try {
      const result = await supabaseClient.executeQuery(
        async (client) => {
          return await client
            .from('user_sessions')
            .update({ 
              revoked: true,
              revoked_at: new Date().toISOString()
            })
            .eq('user_id', userId)
            .eq('revoked', false);
        },
        'revoke_all_user_sessions'
      );

      logger.info(`🚫 Todas las sesiones revocadas para usuario ${userId}`);
      return result;
      
    } catch (error) {
      logger.error(`❌ Error revocando todas las sesiones: ${error.message}`);
      throw error;
    }
  }

  /**
   * Limpiar sesiones expiradas
   */
  async cleanExpiredSessions() {
    try {
      const result = await supabaseClient.executeQuery(
        async (client) => {
          return await client
            .from('user_sessions')
            .delete()
            .lt('expires_at', new Date().toISOString());
        },
        'clean_expired_sessions'
      );

      const deletedCount = result.data?.length || 0;
      if (deletedCount > 0) {
        logger.info(`🧹 Limpiadas ${deletedCount} sesiones expiradas`);
      }
      
      return deletedCount;
      
    } catch (error) {
      logger.error(`❌ Error limpiando sesiones expiradas: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtener sesiones activas de un usuario
   */
  async getUserActiveSessions(userId) {
    try {
      const result = await supabaseClient.executeQuery(
        async (client) => {
          return await client
            .from('user_sessions')
            .select('session_id, created_at, last_used, ip_address, user_agent')
            .eq('user_id', userId)
            .eq('revoked', false)
            .gt('expires_at', new Date().toISOString())
            .order('last_used', { ascending: false });
        },
        'get_user_active_sessions'
      );

      return result.data || [];
      
    } catch (error) {
      logger.error(`❌ Error obteniendo sesiones activas: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtener todos los productos de un usuario
   */
  async getAllProducts(userId) {
    try {
      const result = await supabaseClient.executeQuery(
        async (client) => {
          return await client
            .from(this.tableName)
            .select('id,category_id')
            .eq('user_id', userId);
        },
        'get_all_products'
      );
      
      return result.data || [];
      
    } catch (error) {
      logger.error(`❌ Error obteniendo productos para usuario ${userId}: ${error.message}`);
      throw error;
    }
  }

  // ==========================================
  // OPERACIONES CATEGORÍAS
  // ==========================================

  /**
   * Obtener categorías por IDs
   */
  async getCategoriesByIds(categoryIds) {
    try {
      if (!categoryIds || categoryIds.length === 0) {
        return [];
      }

      const result = await supabaseClient.executeQuery(
        async (client) => {
          return await client
            .from('categories')
            .select('*')
            .in('id', categoryIds);
        },
        'get_categories_by_ids'
      );
      
      logger.info(`📂 Obtenidas ${result.data?.length || 0} categorías de ${categoryIds.length} solicitadas`);
      return result.data || [];
      
    } catch (error) {
      logger.error(`❌ Error obteniendo categorías por IDs: ${error.message}`);
      throw error;
    }
  }

  /**
   * Guardar/actualizar categoría
   */
  async upsertCategory(categoryData) {
    try {
      logger.info(`🔍 DB DEBUG: Iniciando upsert para categoría ${categoryData.id}: ${categoryData.name}`);
      
      const dataToInsert = {
        ...categoryData,
        updated_at: new Date().toISOString()
      };
      
      logger.info(`🔍 DB DEBUG: Datos a insertar: ${JSON.stringify(dataToInsert)}`);
      
      const result = await supabaseClient.executeQuery(
        async (client) => {
          return await client
            .from('categories')
            .upsert(dataToInsert, { 
              onConflict: 'id',
              returning: 'minimal'
            });
        },
        'upsert_category'
      );
      
      logger.info(`🔍 DB DEBUG: Resultado del upsert: ${JSON.stringify(result)}`);
      logger.info(`📂 Categoría ${categoryData.id} guardada/actualizada exitosamente`);
      return result;
      
    } catch (error) {
      logger.error(`🔍 DB DEBUG: Error detallado guardando categoría ${categoryData.id}: ${error.message}`);
      logger.error(`🔍 DB DEBUG: Stack trace: ${error.stack}`);
      throw error;
    }
  }
}

// Exportar instancia singleton
const databaseService = new DatabaseService();

module.exports = databaseService;