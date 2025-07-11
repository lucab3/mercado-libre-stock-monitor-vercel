/**
 * Endpoint simplificado para sync de productos
 * Una llamada pequeña, rápida y simple que guarda productos nuevos
 */

const products = require('../src/api/products');
const logger = require('../src/utils/logger');
const sessionManager = require('../src/utils/sessionManager');
const databaseService = require('../src/services/databaseService');

/**
 * Sync simple: obtener siguiente lote de productos, guardar solo nuevos
 */
async function handleSyncNext(req, res) {
  const startTime = Date.now();
  logger.info('🔄 Sync-next iniciado');

  try {
    // 1. Validar autenticación
    const cookieId = req.headers.cookie?.match(/ml-session=([^;]+)/)?.[1];
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
    logger.info(`🔄 Sync-next para usuario: ${userId}`);

    // 2. Obtener estado actual del scan
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

    // 3. Llamar ML API para obtener siguiente lote
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

    // 5. Filtrar productos que ya existen en BD
    const existingProducts = await databaseService.getProductsByIds(productIds, userId);
    const existingIds = new Set(existingProducts.map(p => p.id));
    const newProductIds = productIds.filter(id => !existingIds.has(id));
    
    logger.info(`🆕 ${newProductIds.length} productos nuevos de ${productIds.length} total`);

    // 6. Obtener detalles y guardar solo productos nuevos
    let savedCount = 0;
    if (newProductIds.length > 0) {
      const productsData = await products.getMultipleProducts(newProductIds, false, userId);
      
      if (productsData.length > 0) {
        // DEBUG: Log para verificar SKUs antes del mapeo
        logger.info(`🔍 DEBUG SKU - Productos obtenidos: ${productsData.length}`);
        productsData.slice(0, 3).forEach((product, index) => {
          logger.info(`   Producto ${index + 1}: ID=${product.id}, SKU=${product.seller_sku || 'SIN_SKU'}`);
        });
        
        const productsToSave = productsData.map(productData => ({
          id: productData.id,
          user_id: userId,
          title: productData.title,
          seller_sku: productData.seller_sku,
          available_quantity: productData.available_quantity || 0,
          price: productData.price,
          status: productData.status,
          permalink: productData.permalink,
          category_id: productData.category_id,
          condition: productData.condition,
          listing_type_id: productData.listing_type_id,
          health: productData.health,
          last_api_sync: new Date().toISOString()
        }));

        // DEBUG: Log para verificar SKUs después del mapeo
        logger.info(`🔍 DEBUG SKU - Productos mapeados para guardar: ${productsToSave.length}`);
        productsToSave.slice(0, 3).forEach((product, index) => {
          logger.info(`   Producto ${index + 1}: ID=${product.id}, SKU=${product.seller_sku || 'SIN_SKU'}`);
        });

        await databaseService.upsertMultipleProducts(productsToSave);
        savedCount = productsToSave.length;
        logger.info(`💾 Guardados ${savedCount} productos nuevos`);
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