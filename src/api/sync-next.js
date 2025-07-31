/**
 * Endpoint simplificado para sync de productos
 * Una llamada pequeña, rápida y simple que guarda productos nuevos
 */

const products = require('./ml-api-products-service');
const logger = require('../utils/logger');
const databaseService = require('../services/databaseService');

// Importar utilidades nativas
const path = require('path');
const fs = require('fs');

// Función simplificada - ya no necesita poblar nada
function populateCategoriesAfterSync(userId) {
  logger.info(`✅ CATEGORIES: Todas disponibles desde archivo estático (12,109+ categorías)`);
  logger.info(`   • Sin procesamiento necesario para usuario ${userId}`);
  return { message: 'Categories available from static file', total_available: 12109 };
}

/**
 * Sync simple: obtener siguiente lote de productos, guardar solo nuevos
 */
async function handleSyncNext(req, res) {
  const startTime = Date.now();
  logger.info('🔄 Sync-next iniciado');

  try {
    // 1. Validar autenticación usando BD
    const cookieId = req.headers.cookie?.match(/ml-session=([^;]+)/)?.[1];
    if (!cookieId) {
      return res.status(401).json({
        success: false,
        error: 'No hay sesión activa',
        needsAuth: true
      });
    }

    const session = await databaseService.getUserSession(cookieId);
    if (!session) {
      return res.status(401).json({
        success: false,
        error: 'Sesión inválida o expirada',
        needsAuth: true
      });
    }

    const userId = session.userId;
    logger.info(`🔄 Sync-next para usuario: ${userId}`);

    // 2. Limpiar webhooks acumulados SIEMPRE al inicio del sync
    logger.info(`🧹 Limpiando webhooks acumulados para usuario ${userId}...`);
    const deletedCount = await databaseService.clearUserWebhooks(userId);
    logger.info(`✅ Eliminados ${deletedCount} webhooks - optimización egress Supabase`);

    // 3. Obtener estado actual del scan
    let scanState = await databaseService.getScanState(userId);
    
    const isFirstCall = !scanState || !scanState.scroll_id;
    if (isFirstCall) {
      // Inicializar scan si es primera vez
      await databaseService.initUserScan(userId);
      scanState = await databaseService.getScanState(userId);
      logger.info('🆕 Scan inicializado - primera llamada');
    } else {
      logger.info(`🔄 Continuando scan desde scroll_id: ${scanState.scroll_id.substring(0, 20)}...`);
    }

    // 4. Llamar ML API para obtener siguiente lote
    const mlResult = isFirstCall
      ? await products.getAllProducts(userId)
      : await products.continueProductScan(userId);

    // 4. Verificar si hay productos
    if (!mlResult || !mlResult.results || mlResult.results.length === 0) {
      // Scan completado
      await databaseService.updateScanProgress(
        userId, 
        null, // scroll_id null = completado
        scanState.total_products || 0,
        scanState.processed_products || 0,
        'completed'
      );

      const totalInDB = await databaseService.getProductCount(userId);
      
      return res.json({
        success: true,
        message: 'Sync completado - no hay más productos',
        hasMore: false,
        scanCompleted: true,
        progress: {
          current: totalInDB,
          total: scanState.total_products || totalInDB,
          percentage: 100,
          newInThisBatch: 0
        },
        executionTime: Date.now() - startTime
      });
    }

    const productIds = mlResult.results;
    logger.info(`📦 Obtenidos ${productIds.length} IDs de ML API`);

    // 5. Procesar productos inmediatamente (restaurado)
    let savedCount = 0;
    if (productIds.length > 0) {
      logger.info(`🔄 Procesando ${productIds.length} productos inmediatamente...`);
      
      // Obtener instancia del procesador
      const productsService = require('./ml-api-products-service');
      const result = await productsService.processProductsDirectly(productIds, userId);
      
      if (result.success) {
        savedCount = result.stats.newProducts + result.stats.updatedProducts;
        logger.info(`✅ Procesamiento completado: ${result.stats.newProducts} nuevos, ${result.stats.updatedProducts} actualizados`);
      } else {
        logger.error(`❌ Error en procesamiento: ${result.message}`);
      }
    }

    // 7. Actualizar progreso en scan_control
    const newTotal = mlResult.total || (scanState.total_products + productIds.length);
    const newProcessed = (scanState.processed_products || 0) + productIds.length;
    const newScrollId = mlResult.scroll_id || null;
    const hasMore = !mlResult.scanCompleted && mlResult.hasMoreProducts && newScrollId !== null;

    await databaseService.updateScanProgress(
      userId,
      newScrollId,
      newTotal,
      newProcessed,
      hasMore ? 'active' : 'completed'
    );

    // 8. Obtener conteo actual de productos en BD
    const totalInDB = await databaseService.getProductCount(userId);

    // 9. Guardar sync control si el scan está completo
    if (!hasMore) {
      logger.info(`📅 Sync completo - guardando control temporal para usuario ${userId}`);
      await databaseService.saveSyncControl(userId, totalInDB);
      
      // 10. Poblar categorías automáticamente cuando termine el scan
      logger.info(`🔍 SYNC-NEXT DEBUG: Scan completado, hasMore=${hasMore}, iniciando poblado automático de categorías`);
      logger.info(`🔍 SYNC-NEXT DEBUG: Ejecutando populateCategoriesAfterSync para usuario ${userId}`);
      await populateCategoriesAfterSync(userId);
      logger.info(`🔍 SYNC-NEXT DEBUG: populateCategoriesAfterSync completado para usuario ${userId}`);
    } else {
      logger.info(`🔍 SYNC-NEXT DEBUG: Scan NO completado, hasMore=${hasMore}, no se ejecuta poblado de categorías`);
    }

    const response = {
      success: true,
      message: `Lote procesado: ${savedCount} productos nuevos guardados`,
      hasMore,
      scanCompleted: !hasMore,
      progress: {
        current: totalInDB,
        total: newTotal,
        percentage: newTotal > 0 ? Math.round((newProcessed / newTotal) * 100) : 0,
        newInThisBatch: savedCount,
        processedInThisBatch: productIds.length
      },
      continueUrl: hasMore ? '/api/sync-next' : null,
      executionTime: Date.now() - startTime
    };

    logger.info(`✅ Sync-next completado: ${savedCount} nuevos, ${totalInDB} total en BD`);
    res.json(response);

    // Procesamiento completado inmediatamente arriba
    logger.info(`ℹ️ Procesamiento sincrónico completado: ${savedCount} productos guardados/actualizados`);

  } catch (error) {
    logger.error(`❌ Error en sync-next: ${error.message}`);
    
    // Si es un error de token, no devolver 500 para evitar logout masivo
    if (error.message.includes('Token expirado') || error.message.includes('No hay tokens válidos')) {
      logger.warn(`⚠️ Error de token en sync-next para usuario - reintentando en próxima llamada`);
      res.status(200).json({
        success: false,
        error: 'Token needs refresh',
        message: 'Token temporal expirando - reintenta sync',
        retryable: true,
        hasMore: true // Permitir reintentar
      });
    } else {
      res.status(500).json({
        success: false,
        error: error.message,
        message: 'Error en sincronización',
        retryable: false
      });
    }
  }
}

module.exports = handleSyncNext;