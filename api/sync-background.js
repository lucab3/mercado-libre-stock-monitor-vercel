/**
 * Endpoint para procesamiento en background de sincronización de productos
 * Optimizado para manejar grandes cantidades de productos (5000+) sin timeout
 */

const products = require('../src/api/products');
const stockMonitor = require('../src/services/stockMonitor');
const logger = require('../src/utils/logger');
const sessionManager = require('../src/utils/sessionManager');

/**
 * Procesamiento background de sincronización con lotes pequeños
 */
async function handleBackgroundSync(req, res) {
  const startTime = Date.now();
  logger.info('🔄 Iniciando sincronización en background');

  try {
    // Validar autenticación
    const cookieId = req.headers.cookie?.match(/session_id=([^;]+)/)?.[1];
    if (!cookieId) {
      return res.status(401).json({
        success: false,
        error: 'No hay sesión activa',
        needsAuth: true
      });
    }

    const session = sessionManager.getSessionByCookie(cookieId);
    if (!session) {
      return res.status(401).json({
        success: false,
        error: 'Sesión inválida',
        needsAuth: true
      });
    }

    const userId = session.userId;
    logger.info(`🔄 Iniciando sync background para usuario: ${userId}`);

    // Configuración optimizada para background processing
    const backgroundConfig = {
      limit: 50, // Páginas pequeñas para evitar timeout
      maxProductsPerBatch: 150, // Lotes muy pequeños para background
      maxRetries: 3,
      retryDelay: 2000, // 2 segundos entre reintentos
      maxExecutionTime: 25000 // 25 segundos máximo (antes del timeout de Vercel)
    };

    let batchNumber = 1;
    let totalProcessed = 0;
    let continueSync = true;
    let lastError = null;
    let syncResults = [];

    // Determinar si es primera llamada o continuación
    const isFirstBatch = !req.query.continue || req.query.continue === 'false';
    
    logger.info(`🎯 Configuración background: ${JSON.stringify(backgroundConfig)}`);
    logger.info(`🔄 Tipo de ejecución: ${isFirstBatch ? 'PRIMERA LLAMADA' : 'CONTINUACIÓN'}`);

    while (continueSync) {
      const batchStartTime = Date.now();
      
      try {
        logger.info(`📦 Procesando lote ${batchNumber} en background...`);

        // Obtener productos (primera llamada o continuación)
        const apiResult = isFirstBatch && batchNumber === 1
          ? await products.getAllProducts(userId)
          : await products.continueProductScan(userId);

        if (!apiResult) {
          logger.warn('⚠️ Sin resultado de API, terminando sync');
          break;
        }

        // Si no hay productos nuevos y el scan está completo, terminar
        if (apiResult.results === null && apiResult.scanCompleted) {
          logger.info('🏁 Sync completado - no hay más productos');
          syncResults.push({
            batchNumber,
            action: 'completed',
            message: 'Sincronización completada - no hay más productos',
            totalProducts: apiResult.total || 0
          });
          break;
        }

        const productIds = apiResult.results || [];
        
        if (productIds.length === 0) {
          logger.warn('⚠️ Sin productos en este lote, terminando');
          break;
        }

        logger.info(`📊 Lote ${batchNumber}: ${productIds.length} productos, scanCompleted: ${apiResult.scanCompleted}`);

        // Sincronizar productos en lotes pequeños
        const syncResult = await stockMonitor.syncProducts(productIds, userId, backgroundConfig);
        
        totalProcessed += syncResult.processed || 0;
        
        syncResults.push({
          batchNumber,
          productsInBatch: productIds.length,
          processed: syncResult.processed || 0,
          hasMoreProducts: apiResult.hasMoreProducts,
          scanCompleted: apiResult.scanCompleted,
          batchCompleted: apiResult.batchCompleted,
          executionTime: Date.now() - batchStartTime
        });

        logger.info(`✅ Lote ${batchNumber} completado: ${syncResult.processed} productos procesados`);

        // Verificar si debemos continuar
        const shouldContinue = apiResult.hasMoreProducts && !apiResult.scanCompleted;
        const timeRemaining = backgroundConfig.maxExecutionTime - (Date.now() - startTime);
        
        if (!shouldContinue) {
          logger.info('🏁 Sync completado - no hay más productos disponibles');
          continueSync = false;
        } else if (timeRemaining < 5000) { // Si quedan menos de 5 segundos
          logger.warn(`⏰ Tiempo agotándose (${timeRemaining}ms restantes), pausando para siguiente ejecución`);
          continueSync = false;
          
          // Indicar que hay más trabajo pendiente
          syncResults.push({
            batchNumber: batchNumber + 1,
            action: 'timeout_continue',
            message: 'Tiempo agotado - continuar en siguiente ejecución',
            hasMoreProducts: true,
            nextContinue: true
          });
        } else {
          batchNumber++;
          
          // Pequeña pausa entre lotes
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

      } catch (batchError) {
        logger.error(`❌ Error en lote ${batchNumber}: ${batchError.message}`);
        lastError = batchError.message;
        
        // Decidir si continuar o abortar
        if (batchNumber === 1) {
          // Si es el primer lote, abortar
          throw batchError;
        } else {
          // Si ya procesamos algunos lotes, registrar error pero devolver progreso
          syncResults.push({
            batchNumber,
            action: 'error',
            error: batchError.message,
            totalProcessedBeforeError: totalProcessed
          });
          break;
        }
      }
    }

    const totalExecutionTime = Date.now() - startTime;
    
    // Determinar próximo paso
    const lastResult = syncResults[syncResults.length - 1];
    const needsContinuation = lastResult?.nextContinue || lastResult?.hasMoreProducts;

    const response = {
      success: true,
      backgroundSync: true,
      totalBatches: batchNumber,
      totalProcessed,
      executionTime: totalExecutionTime,
      batches: syncResults,
      needsContinuation,
      continueUrl: needsContinuation ? '/api/sync-background?continue=true' : null,
      message: needsContinuation 
        ? `Procesados ${totalProcessed} productos en ${batchNumber} lotes. Continuar para más productos.`
        : `Sincronización completada: ${totalProcessed} productos procesados en ${batchNumber} lotes.`,
      lastError
    };

    logger.info(`🎯 Background sync completado: ${totalProcessed} productos en ${totalExecutionTime}ms`);
    
    if (needsContinuation) {
      logger.info('🔄 Más productos disponibles - se necesita continuación');
    }

    res.status(200).json(response);

  } catch (error) {
    const executionTime = Date.now() - startTime;
    logger.error(`❌ Error en background sync después de ${executionTime}ms: ${error.message}`);
    
    res.status(500).json({
      success: false,
      error: error.message,
      executionTime,
      backgroundSync: true,
      message: 'Error en sincronización background'
    });
  }
}

module.exports = handleBackgroundSync;