/**
 * Endpoint simplificado para sync de productos
 * Una llamada pequeña, rápida y simple que guarda productos nuevos
 */

const products = require('./products');
const logger = require('../utils/logger');
const sessionManager = require('../utils/sessionManager');
const databaseService = require('../services/databaseService');

// Importar la función estática de categorías
const { getCategoriesFromStatic } = require('../../api/categories');

// Función auxiliar para extraer SKU de múltiples fuentes
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

// Función auxiliar para verificar categorías desde los productos (usando archivo estático)
function saveCategoriesFromProducts(categoryIds) {
  try {
    logger.info(`🔍 SYNC CATEGORIES: Procesando ${categoryIds.length} categorías desde archivo estático`);
    logger.info(`🔍 SYNC CATEGORIES: IDs: ${categoryIds.slice(0, 5).join(', ')}${categoryIds.length > 5 ? '...' : ''}`);
    
    // Usar archivo estático (instantáneo, sin consultas externas)
    const result = getCategoriesFromStatic(categoryIds);
    
    logger.info(`🔍 SYNC CATEGORIES: Procesamiento completado:`);
    logger.info(`   • Total procesadas: ${result.stats.total}`);
    logger.info(`   • Encontradas en archivo: ${result.stats.found}`);
    logger.info(`   • Fallback usado: ${result.stats.missing}`);
    
    return result.stats;
    
  } catch (error) {
    logger.error(`🔍 SYNC CATEGORIES: Error en saveCategoriesFromProducts: ${error.message}`);
    // No lanzar error para que no interrumpa el sync principal
  }
}

// Función para verificar categorías automáticamente después del sync (usando archivo estático)
function populateCategoriesAfterSync(userId) {
  try {
    logger.info(`🔍 AUTO-POPULATE: Verificando disponibilidad de categorías desde archivo estático`);
    logger.info(`🔍 AUTO-POPULATE: userId: ${userId}`);
    
    // Ya no necesitamos obtener productos ni hacer consultas
    // El archivo estático contiene todas las categorías de ML
    logger.info(`🎉 AUTO-POPULATE: Todas las categorías disponibles desde archivo estático (12,109+ categorías)`);
    logger.info(`   • Sin consultas a BD ni API externa`);
    logger.info(`   • Respuesta instantánea`);
    logger.info(`   • Datos siempre actualizados del árbol de ML`);
    
    return { 
      message: 'Categories available from static file',
      total_available: 12109,
      source: 'static_file'
    };
    
  } catch (error) {
    logger.error(`❌ AUTO-POPULATE: Error: ${error.message}`);
    // No lanzar error para que no interrumpa el sync principal
  }
}

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
          const extractedSKU = extractSKUFromProduct(product);
          logger.info(`   Producto ${index + 1}: ID=${product.id}, SKU_original=${product.seller_sku || 'SIN_SKU'}, SKU_extraido=${extractedSKU || 'SIN_SKU'}`);
        });
        
        // Extraer categorías únicas de los productos
        const categoriesSet = new Set();
        productsData.forEach(product => {
          if (product.category_id) {
            categoriesSet.add(product.category_id);
          }
        });
        
        logger.info(`🔍 SYNC-NEXT DEBUG: Encontradas ${categoriesSet.size} categorías únicas en ${productsData.length} productos`);
        logger.info(`🔍 SYNC-NEXT DEBUG: Categorías: ${Array.from(categoriesSet).slice(0, 10).join(', ')}`);
        
        // Guardar categorías si las hay
        if (categoriesSet.size > 0) {
          logger.info(`🔍 SYNC-NEXT DEBUG: Iniciando guardado de categorías...`);
          await saveCategoriesFromProducts(Array.from(categoriesSet));
          logger.info(`🔍 SYNC-NEXT DEBUG: Guardado de categorías completado`);
        } else {
          logger.info(`🔍 SYNC-NEXT DEBUG: No hay categorías para guardar`);
        }
        
        const productsToSave = productsData.map(productData => {
          const extractedSKU = extractSKUFromProduct(productData);
          return {
            id: productData.id,
            user_id: userId,
            title: productData.title,
            seller_sku: extractedSKU, // CORREGIDO: Usar SKU extraído
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
        });

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