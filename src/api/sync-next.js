/**
 * Endpoint simplificado para sync de productos
 * Una llamada pequeña, rápida y simple que guarda productos nuevos
 */

const products = require('./products');
const logger = require('../utils/logger');
const databaseService = require('../services/databaseService');

// Importar utilidades nativas
const path = require('path');
const fs = require('fs');

// ==========================================
// FUNCIONES INTERNAS PARA SYNC INTELIGENTE
// ==========================================

/**
 * Función interna: Procesar actualizaciones de productos
 * Compara ML vs BD y solo actualiza lo que cambió
 */
async function processProductUpdates(productIds, userId) {
  logger.info(`🔄 Procesando ${productIds.length} productos para actualizaciones inteligentes...`);
  
  // 1. Obtener datos actuales de ML para este lote
  const mlProductsData = await products.getMultipleProducts(productIds, false, userId);
  
  if (!mlProductsData || mlProductsData.length === 0) {
    return 0;
  }

  // 2. Obtener datos actuales de BD (solo campos para comparación)
  logger.info(`🔍 Consultando BD: productos existentes para comparación`);
  const dbProducts = await databaseService.getProductsForComparison(productIds, userId);
  
  // 3. Comparar y clasificar productos
  const result = compareProducts(mlProductsData, dbProducts, userId);
  
  // 4. Procesar categorías de productos nuevos/actualizados
  const allRelevantProducts = [...result.newProducts, ...result.updatedProducts];
  if (allRelevantProducts.length > 0) {
    const categoriesSet = new Set();
    allRelevantProducts.forEach(product => {
      if (product.category_id) {
        categoriesSet.add(product.category_id);
      }
    });
    
    if (categoriesSet.size > 0) {
      await saveCategoriesFromProducts(Array.from(categoriesSet));
    }
  }
  
  // 5. Procesar cambios en BD
  let totalSaved = 0;
  
  if (result.newProducts.length > 0) {
    await databaseService.upsertMultipleProducts(result.newProducts);
    totalSaved += result.newProducts.length;
    logger.info(`💾 Guardados ${result.newProducts.length} productos nuevos`);
  }
  
  if (result.updatedProducts.length > 0) {
    await databaseService.updateProductsOptimized(result.updatedProducts);
    totalSaved += result.updatedProducts.length;
    logger.info(`📝 Actualizados ${result.updatedProducts.length} productos con cambios de stock/precio`);
  }
  
  logger.info(`📊 Resumen lote: ${result.newProducts.length} nuevos, ${result.updatedProducts.length} actualizados, ${result.unchangedCount} sin cambios`);
  
  return totalSaved;
}

/**
 * Función interna: Comparar productos ML vs BD
 */
function compareProducts(mlProducts, dbProducts, userId) {
  const dbProductsMap = new Map(dbProducts.map(p => [p.id, p]));
  const newProducts = [];
  const updatedProducts = [];
  let unchangedCount = 0;
  
  mlProducts.forEach(mlProduct => {
    const dbProduct = dbProductsMap.get(mlProduct.id);
    
    if (!dbProduct) {
      // Producto nuevo - mapear completo
      newProducts.push(mapProductForDB(mlProduct, userId));
    } else if (hasStockChanges(mlProduct, dbProduct)) {
      // Solo campos que cambiaron
      updatedProducts.push({
        id: mlProduct.id,
        available_quantity: mlProduct.available_quantity || 0,
        price: mlProduct.price,
        status: mlProduct.status,
        title: mlProduct.title, // Título puede cambiar
        seller_sku: extractSKUFromProduct(mlProduct), // SKU puede cambiar
        last_api_sync: new Date().toISOString()
      });
    } else {
      unchangedCount++;
    }
  });
  
  return { newProducts, updatedProducts, unchangedCount };
}

/**
 * Función interna: Verificar si hay cambios relevantes
 */
function hasStockChanges(mlProduct, dbProduct) {
  return mlProduct.available_quantity !== dbProduct.available_quantity ||
         mlProduct.price !== dbProduct.price ||
         mlProduct.status !== dbProduct.status ||
         mlProduct.title !== dbProduct.title ||
         extractSKUFromProduct(mlProduct) !== dbProduct.seller_sku;
}

/**
 * Función interna: Mapear producto ML a formato BD
 */
function mapProductForDB(productData, userId) {
  const extractedSKU = extractSKUFromProduct(productData);
  return {
    id: productData.id,
    user_id: userId,
    title: productData.title,
    seller_sku: extractedSKU,
    available_quantity: productData.available_quantity || 0,
    price: productData.price,
    status: productData.status,
    permalink: productData.permalink,
    category_id: productData.category_id,
    condition: productData.condition,
    listing_type_id: productData.listing_type_id,
    health: productData.health,
    last_api_sync: new Date().toISOString()
  };
}

/**
 * Función auxiliar para extraer SKU de múltiples fuentes
 */
function extractSKUFromProduct(productData) {
  // 1. Verificar seller_sku directo
  if (productData.seller_sku) {
    return productData.seller_sku;
  }

  // 2. Buscar en attributes si existe
  if (productData.attributes && Array.isArray(productData.attributes)) {
    const skuAttribute = productData.attributes.find(attr => 
      attr.id === 'SELLER_SKU' || 
      attr.id === 'SKU' || 
      (attr.name && attr.name.toLowerCase().includes('sku'))
    );
    
    if (skuAttribute && skuAttribute.value_name) {
      return skuAttribute.value_name;
    }
  }

  // 3. Si no se encuentra, retornar null
  return null;
}

// Función auxiliar para verificar categorías (simplificada - solo log)
function saveCategoriesFromProducts(categoryIds) {
  try {
    logger.info(`🔍 SYNC CATEGORIES: ${categoryIds.length} categorías detectadas en productos`);
    logger.info(`🔍 SYNC CATEGORIES: Todas disponibles desde archivo estático (no requiere procesamiento)`);
    logger.info(`   • Categorías disponibles: 12,109+`);
    logger.info(`   • Ejemplos: ${categoryIds.slice(0, 3).join(', ')}${categoryIds.length > 3 ? '...' : ''}`);
    
    return { 
      total: categoryIds.length, 
      source: 'static_file_available' 
    };
    
  } catch (error) {
    logger.error(`🔍 SYNC CATEGORIES: Error: ${error.message}`);
  }
}

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

    // 5. Procesar productos con sync inteligente (nuevos + actualizaciones)
    let savedCount = 0;
    if (productIds.length > 0) {
      logger.info(`🔄 Procesando ${productIds.length} productos para actualizaciones inteligentes...`);
      try {
        savedCount = await processProductUpdates(productIds, userId);
        logger.info(`✅ Procesamiento completado: ${savedCount} productos guardados/actualizados`);
      } catch (error) {
        logger.error(`❌ Error en processProductUpdates: ${error.message}`);
        savedCount = 0;
      }
    } else {
      logger.info(`ℹ️ No hay productos nuevos que procesar en este lote`);
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