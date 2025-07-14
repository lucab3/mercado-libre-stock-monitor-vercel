/**
 * Procesador de webhooks de MercadoLibre
 * Optimizado para Vercel con respuesta rápida y procesamiento asíncrono
 */

const databaseService = require('./databaseService');
const logger = require('../utils/logger');
const auth = require('../api/auth');
const mlApiClient = require('../api/ml-api-client');

class WebhookProcessor {
  constructor() {
    // IPs autorizadas de MercadoLibre (según documentación)
    this.allowedIPs = [
      '54.88.218.97',
      '18.215.140.160', 
      '18.213.114.129',
      '18.206.34.84'
    ];
    
    this.supportedTopics = [
      'stock-location',
      'stock-locations', // ML envía ambas versiones
      'items',
      'items_prices'
    ];
    
    // Topics que recibimos pero ignoramos (no causan error 400)
    this.ignoredTopics = [
      'orders_v2',
      'shipments',
      'messages',
      'price_suggestion',
      'fbm_stock_operations',
      'questions'
    ];
  }

  /**
   * Validar origen del webhook
   */
  validateWebhookOrigin(clientIP, headers) {
    try {
      // En desarrollo, permitir cualquier IP
      if (process.env.NODE_ENV === 'development' || process.env.MOCK_ML_API === 'true') {
        logger.debug(`🧪 Modo desarrollo: IP ${clientIP} permitida`);
        return { valid: true, reason: 'development_mode' };
      }

      // Verificar Content-Type
      const contentType = headers['content-type'];
      if (!contentType || !contentType.includes('application/json')) {
        return { 
          valid: false, 
          reason: 'invalid_content_type',
          details: `Expected application/json, got ${contentType}` 
        };
      }

      // Verificar IP si está en la lista de permitidas
      if (this.allowedIPs.includes(clientIP)) {
        return { valid: true, reason: 'authorized_ip' };
      }

      // Si no es IP conocida, permitir pero loggear
      logger.warn(`⚠️ IP no reconocida: ${clientIP} - Permitiendo webhook`);
      return { valid: true, reason: 'unknown_ip_allowed', warning: true };

    } catch (error) {
      logger.error(`❌ Error validando origen: ${error.message}`);
      return { valid: false, reason: 'validation_error', error: error.message };
    }
  }

  /**
   * Validar estructura del webhook según documentación ML
   */
  validateWebhookData(webhookData) {
    try {
      // Debug: Log de los datos recibidos
      logger.info(`🔍 Webhook data recibido: ${JSON.stringify(webhookData, null, 2)}`);
      
      const required = ['_id', 'topic', 'resource', 'user_id', 'application_id'];
      const missing = required.filter(field => !webhookData[field]);
      
      if (missing.length > 0) {
        logger.error(`❌ Campos faltantes en webhook: ${missing.join(', ')}`);
        return {
          valid: false,
          reason: 'missing_required_fields',
          missing: missing
        };
      }

      // Validar topic soportado o ignorado
      if (!this.supportedTopics.includes(webhookData.topic)) {
        // Si es un topic ignorado, lo aceptamos pero no lo procesamos
        if (this.ignoredTopics.includes(webhookData.topic)) {
          logger.info(`ℹ️ Topic ignorado: ${webhookData.topic} - webhook aceptado pero no procesado`);
          return {
            valid: true,
            ignored: true,
            extractedData: {
              productId: null,
              topic: webhookData.topic,
              resource: webhookData.resource,
              userId: webhookData.user_id.toString()
            }
          };
        }
        
        logger.error(`❌ Topic no soportado: ${webhookData.topic}. Soportados: ${this.supportedTopics.join(', ')}`);
        return {
          valid: false,
          reason: 'unsupported_topic',
          topic: webhookData.topic,
          supported: this.supportedTopics
        };
      }

      // Extraer product_id del resource si es posible
      let productId = null;
      if (webhookData.resource) {
        // Para stock-location: /user-products/$USER_PRODUCT_ID/stock
        // Para items: /items/MLA123456789
        const resourceMatch = webhookData.resource.match(/\/(user-products|items)\/([^\/]+)/);
        if (resourceMatch) {
          productId = resourceMatch[2];
        }
      }

      return {
        valid: true,
        extractedData: {
          productId,
          topic: webhookData.topic,
          resource: webhookData.resource,
          userId: webhookData.user_id.toString()
        }
      };

    } catch (error) {
      logger.error(`❌ Error validando datos del webhook: ${error.message}`);
      return { valid: false, reason: 'validation_error', error: error.message };
    }
  }

  /**
   * Guardar webhook en base de datos INMEDIATAMENTE
   */
  async saveWebhookEvent(webhookData, clientIP, headers) {
    try {
      const validation = this.validateWebhookData(webhookData);
      
      const webhookEvent = {
        webhook_id: webhookData._id,
        topic: webhookData.topic,
        resource: webhookData.resource,
        user_id: parseInt(webhookData.user_id),
        product_id: validation.valid ? validation.extractedData?.productId : null,
        processed: false,
        received_at: new Date().toISOString(),
        sent_at: webhookData.sent ? new Date(webhookData.sent).toISOString() : null,
        webhook_received_at: webhookData.received ? new Date(webhookData.received).toISOString() : null,
        attempts: webhookData.attempts || 1,
        client_ip: clientIP,
        request_headers: JSON.stringify({
          'content-type': headers['content-type'],
          'user-agent': headers['user-agent'],
          'x-forwarded-for': headers['x-forwarded-for']
        })
      };

      const result = await databaseService.saveWebhookEvent(webhookEvent);
      
      logger.info(`💾 Webhook guardado: ${webhookData._id} (topic: ${webhookData.topic})`);
      return { success: true, id: result?.id, webhook_id: webhookData._id };

    } catch (error) {
      logger.error(`❌ Error guardando webhook: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Procesar webhook específico de stock-location
   */
  async processStockLocationWebhook(webhookData, extractedData) {
    try {
      const { productId, userId } = extractedData;
      
      if (!productId) {
        throw new Error('No se pudo extraer product_id del resource');
      }

      logger.info(`🔄 Procesando stock webhook: ${productId} para usuario ${userId}`);
      logger.info(`📍 Recurso ML: ${webhookData.resource}`);

      // Llamar al stock monitor para procesar el producto
      const stockMonitor = require('./stockMonitor');
      const result = await stockMonitor.processProductFromWebhook(productId, userId);
      
      logger.info(`✅ Stock webhook procesado exitosamente para ${productId}`);
      
      return {
        success: true,
        action: 'product_updated',
        productId,
        userId,
        resource: webhookData.resource,
        finalStock: result.available_quantity,
        updatedFields: Object.keys(result)
      };

    } catch (error) {
      logger.error(`❌ Error procesando stock webhook: ${error.message}`);
      throw error;
    }
  }

  /**
   * Procesar webhook específico de items
   */
  async processItemsWebhook(webhookData, extractedData) {
    try {
      const { productId, userId } = extractedData;
      
      logger.info(`📦 PROCESS ITEMS WEBHOOK START: ${productId}`);
      logger.info(`   • Product ID: ${productId}`);
      logger.info(`   • User ID: ${userId}`);
      logger.info(`   • Resource: ${webhookData.resource}`);
      logger.info(`   • Topic: ${webhookData.topic}`);
      logger.info(`   • Timestamp: ${new Date().toISOString()}`);
      
      // Validar que tenemos los datos necesarios
      if (!productId) {
        throw new Error('Product ID no disponible en webhook');
      }
      
      if (!userId) {
        throw new Error('User ID no disponible en webhook');
      }
      
      // Llamar al stock monitor para procesar el producto
      logger.info(`🔄 Llamando a stockMonitor.processProductFromWebhook...`);
      const stockMonitor = require('./stockMonitor');
      const result = await stockMonitor.processProductFromWebhook(productId, userId);
      
      logger.info(`✅ PROCESS ITEMS WEBHOOK SUCCESS: ${productId}`);
      logger.info(`   • Final stock: ${result.available_quantity}`);
      logger.info(`   • Updated fields: ${Object.keys(result).join(', ')}`);
      
      return {
        success: true,
        action: 'product_updated',
        productId,
        userId,
        resource: webhookData.resource,
        finalStock: result.available_quantity,
        updatedFields: Object.keys(result)
      };

    } catch (error) {
      logger.error(`❌ PROCESS ITEMS WEBHOOK FAILED: ${error.message}`);
      logger.error(`   • Product ID: ${extractedData?.productId || 'unknown'}`);
      logger.error(`   • User ID: ${extractedData?.userId || 'unknown'}`);
      logger.error(`   • Error stack: ${error.stack}`);
      throw error;
    }
  }

  /**
   * Procesar webhook de forma asíncrona (llamar después de responder HTTP 200)
   */
  async processWebhookAsync(webhookId) {
    const startTime = Date.now();
    
    try {
      logger.info(`🔄 ASYNC PROCESSING START: ${webhookId}`);
      logger.info(`   • Timestamp: ${new Date().toISOString()}`);
      logger.info(`   • Process ID: ${process.pid}`);

      // STEP 1: Obtener webhook de la base de datos
      logger.info(`📋 STEP 1: Buscando webhook ${webhookId} en BD...`);
      const webhooks = await databaseService.getPendingWebhooks(50); // Buscar en más webhooks
      logger.info(`   • Webhooks pendientes encontrados: ${webhooks.length}`);
      
      if (webhooks.length > 0) {
        logger.info(`   • Primeros 3 webhooks pendientes:`);
        webhooks.slice(0, 3).forEach((w, i) => {
          logger.info(`     ${i + 1}. ${w.webhook_id} - ${w.topic} - ${w.received_at}`);
        });
      }
      
      const webhook = webhooks.find(w => w.webhook_id === webhookId);
      
      if (!webhook) {
        logger.error(`❌ STEP 1 FAILED: Webhook ${webhookId} no encontrado`);
        logger.info(`🔍 Buscando webhook por ID exacto...`);
        
        // Buscar todos los webhooks para debug
        const allWebhooks = await databaseService.getPendingWebhooks(100);
        logger.info(`   • Total webhooks pendientes: ${allWebhooks.length}`);
        
        const exactMatch = allWebhooks.find(w => w.webhook_id === webhookId);
        if (exactMatch) {
          logger.info(`✅ Webhook encontrado en lista extendida: ${exactMatch.webhook_id}`);
        } else {
          logger.error(`❌ Webhook ${webhookId} no existe en BD o ya fue procesado`);
          return;
        }
      }

      logger.info(`✅ STEP 1 SUCCESS: Webhook encontrado`);
      logger.info(`   • Topic: ${webhook.topic}`);
      logger.info(`   • Resource: ${webhook.resource}`);
      logger.info(`   • Product ID: ${webhook.product_id}`);
      logger.info(`   • User ID: ${webhook.user_id}`);
      logger.info(`   • Received at: ${webhook.received_at}`);

      // STEP 2: Procesar según topic
      logger.info(`🔄 STEP 2: Procesando según topic '${webhook.topic}'...`);
      let result = null;
      
      // Procesar según topic
      switch (webhook.topic) {
        case 'stock-location':
        case 'stock-locations': // Manejar ambas versiones
          logger.info(`📦 STEP 2A: Procesando stock-location webhook...`);
          result = await this.processStockLocationWebhook(
            { 
              _id: webhook.webhook_id,
              topic: webhook.topic,
              resource: webhook.resource,
              user_id: webhook.user_id
            },
            {
              productId: webhook.product_id,
              userId: webhook.user_id.toString()
            }
          );
          logger.info(`✅ STEP 2A SUCCESS: Stock-location procesado`);
          break;
          
        case 'items':
        case 'items_prices':
          logger.info(`📦 STEP 2B: Procesando ${webhook.topic} webhook...`);
          logger.info(`   • Product ID: ${webhook.product_id}`);
          logger.info(`   • User ID: ${webhook.user_id}`);
          result = await this.processItemsWebhook(
            {
              _id: webhook.webhook_id,
              topic: webhook.topic, 
              resource: webhook.resource,
              user_id: webhook.user_id
            },
            {
              productId: webhook.product_id,
              userId: webhook.user_id.toString()
            }
          );
          logger.info(`✅ STEP 2B SUCCESS: ${webhook.topic} webhook procesado`);
          break;
          
        default:
          logger.error(`❌ STEP 2 FAILED: Topic no soportado: ${webhook.topic}`);
          throw new Error(`Topic no soportado: ${webhook.topic}`);
      }

      // STEP 3: Marcar como procesado
      logger.info(`💾 STEP 3: Marcando webhook como procesado...`);
      logger.info(`   • Webhook ID: ${webhookId}`);
      logger.info(`   • Result: ${JSON.stringify(result, null, 2)}`);
      
      await databaseService.markWebhookProcessed(webhookId, true, result);
      
      const processingTime = Date.now() - startTime;
      logger.info(`✅ STEP 3 SUCCESS: Webhook marcado como procesado`);
      logger.info(`🎉 ASYNC PROCESSING COMPLETE: ${webhookId} (${processingTime}ms)`);

    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error(`❌ ASYNC PROCESSING FAILED: ${webhookId} (${processingTime}ms)`);
      logger.error(`   • Error: ${error.message}`);
      logger.error(`   • Stack: ${error.stack}`);
      
      // Marcar como fallido
      try {
        logger.info(`💾 Marcando webhook como fallido...`);
        await databaseService.markWebhookProcessed(webhookId, false, {
          error: error.message,
          stack: error.stack,
          timestamp: new Date().toISOString(),
          processingTime
        });
        logger.info(`✅ Webhook marcado como fallido en BD`);
      } catch (dbError) {
        logger.error(`❌ Error marcando webhook como fallido: ${dbError.message}`);
        logger.error(`   • DB Error Stack: ${dbError.stack}`);
      }
    }
  }

  /**
   * Punto de entrada principal para procesar webhook
   */
  async handleWebhook(webhookData, clientIP, headers) {
    const startTime = Date.now();
    
    try {
      // 1. Validar origen
      const originValidation = this.validateWebhookOrigin(clientIP, headers);
      if (!originValidation.valid) {
        return {
          success: false,
          httpCode: 403,
          error: 'Unauthorized origin',
          details: originValidation,
          processingTime: Date.now() - startTime
        };
      }

      // 2. Validar datos del webhook
      const dataValidation = this.validateWebhookData(webhookData);
      if (!dataValidation.valid) {
        return {
          success: false,
          httpCode: 400,
          error: 'Invalid webhook data',
          details: dataValidation,
          processingTime: Date.now() - startTime
        };
      }
      
      // Si es un topic ignorado, responder 200 pero no procesar
      if (dataValidation.ignored) {
        logger.info(`⏭️ Webhook ignorado: ${webhookData._id} (topic: ${webhookData.topic})`);
        return {
          success: true,
          httpCode: 200,
          message: 'Webhook received but ignored (topic not relevant for stock monitoring)',
          webhook_id: webhookData._id,
          ignored: true,
          processingTime: Date.now() - startTime
        };
      }

      // 3. Guardar inmediatamente en BD
      const saveResult = await this.saveWebhookEvent(webhookData, clientIP, headers);
      if (!saveResult.success) {
        return {
          success: false,
          httpCode: 500,
          error: 'Failed to save webhook',
          details: saveResult,
          processingTime: Date.now() - startTime
        };
      }

      // 4. Programar procesamiento asíncrono (no esperar)
      setImmediate(() => {
        this.processWebhookAsync(webhookData._id).catch(error => {
          logger.error(`❌ Error en procesamiento asíncrono: ${error.message}`);
        });
      });

      const processingTime = Date.now() - startTime;
      
      logger.info(`⚡ Webhook ${webhookData._id} procesado en ${processingTime}ms`);

      return {
        success: true,
        httpCode: 200,
        message: 'Webhook received and queued for processing',
        webhook_id: webhookData._id,
        processingTime
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error(`❌ Error handling webhook: ${error.message} (${processingTime}ms)`);
      
      return {
        success: false,
        httpCode: 500,
        error: 'Internal server error',
        message: error.message,
        processingTime
      };
    }
  }

  /**
   * Obtener estadísticas de webhooks
   */
  async getWebhookStats() {
    try {
      const stats = await databaseService.getStats();
      
      return {
        pendingWebhooks: stats.pendingWebhooks || 0,
        totalWebhooks: stats.tables?.webhook_events || 0,
        supportedTopics: this.supportedTopics,
        allowedIPs: this.allowedIPs,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      logger.error(`❌ Error obteniendo stats de webhooks: ${error.message}`);
      return { error: error.message };
    }
  }
}

// Exportar instancia singleton
const webhookProcessor = new WebhookProcessor();

module.exports = webhookProcessor;