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

    // 5. Por ahora no procesamos productos sincrónicamente (se hace asíncronamente después)
    let savedCount = 0;
    logger.info(`ℹ️ Productos obtenidos: ${productIds.length} (procesamiento inteligente será asíncrono)`);

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

    // PROCESAMIENTO INTELIGENTE ASÍNCRONO: Llamar después de responder
    if (productIds.length > 0) {
      logger.info(`🚀 Iniciando procesamiento inteligente asíncrono para ${productIds.length} productos...`);
      setTimeout(async () => {
        try {
          logger.info(`🔧 ASYNC DEBUG 1: setTimeout ejecutado, importando products-processor...`);
          
          // Importar y ejecutar la función de procesamiento interno
          const { processProductUpdates } = require('./products-processor');
          logger.info(`🔧 ASYNC DEBUG 2: processProductUpdates importado correctamente`);
          
          logger.info(`🔧 ASYNC DEBUG 3: Llamando processProductUpdates con userId=${userId}, productIds.length=${productIds.length}`);
          const result = await processProductUpdates(null, null, userId, productIds);
          logger.info(`🔧 ASYNC DEBUG 4: processProductUpdates completado, result.success=${result.success}`);
          
          if (result.success) {
            logger.info(`📊 Procesamiento asíncrono completado: ${result.stats.newProducts} nuevos, ${result.stats.updatedProducts} actualizados, ${result.stats.unchangedProducts} sin cambios`);
          } else {
            logger.error(`❌ Procesamiento asíncrono falló: ${result.message}`);
          }
          
        } catch (asyncError) {
          logger.error(`❌ Error en procesamiento asíncrono: ${asyncError.message}`);
          logger.error(`❌ Stack trace: ${asyncError.stack}`);
        }
      }, 200); // 200ms después de responder
    }

  } catch (error) {
    logger.error(`❌ Error en sync-next: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error en sincronización'
    });
  }
}

module.exports = handleSyncNext;