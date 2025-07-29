/**
 * Servicio de procesamiento de productos
 * Función utilitaria pura para comparar ML vs BD y actualizar solo cambios
 * Optimizado para reducir egress de Supabase
 */

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
      // Solo campos que cambiaron + shipping info
      const manufacturingHours = mlProduct.manufacturing_time ? mlProduct.manufacturing_time * 24 : null;
      
      updatedProducts.push({
        id: mlProduct.id,
        available_quantity: mlProduct.available_quantity || 0,
        price: mlProduct.price,
        status: mlProduct.status,
        title: mlProduct.title, // Título puede cambiar
        seller_sku: extractSKUFromProduct(mlProduct), // SKU puede cambiar
        estimated_handling_time: manufacturingHours, // ⭐ DIRECTO: Manufacturing time
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
  const manufacturingHours = mlProduct.manufacturing_time ? mlProduct.manufacturing_time * 24 : null;
  
  return mlProduct.available_quantity !== dbProduct.available_quantity ||
         mlProduct.price !== dbProduct.price ||
         mlProduct.status !== dbProduct.status ||
         mlProduct.title !== dbProduct.title ||
         extractSKUFromProduct(mlProduct) !== dbProduct.seller_sku ||
         manufacturingHours !== dbProduct.estimated_handling_time; // ⭐ DIRECTO: Detectar cambios en manufacturing time
}

/**
 * Función interna: Mapear producto ML a formato BD
 */
function mapProductForDB(productData, userId) {
  const logger = require('../utils/logger');
  const extractedSKU = extractSKUFromProduct(productData);
  const manufacturingHours = productData.manufacturing_time ? productData.manufacturing_time * 24 : null;
  
  // 🔍 DEBUG: Logging para manufacturing time
  if (productData.manufacturing_time) {
    logger.info(`✅ Producto ${productData.id} tiene manufacturing_time: ${productData.manufacturing_time} (${manufacturingHours}h)`);
  } else {
    logger.debug(`❌ Producto ${productData.id} NO tiene manufacturing_time`);
  }
  
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
    // ⭐ DIRECTO: Manufacturing time desde productData
    estimated_handling_time: manufacturingHours,
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


/**
 * Función principal: Procesar lote de productos
 * Compara ML vs BD y actualiza solo lo que cambió
 */
async function processProductsBatch(productIds, userId, dependencies) {
  const { databaseService, mlApiService, logger } = dependencies;
  const startTime = Date.now();
  
  try {
    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      return { success: false, error: 'Se requiere un array de productIds' };
    }

    logger.info(`🔄 PROCESS: Procesando ${productIds.length} productos para actualizaciones inteligentes...`);
    
    // STEP 1: Obtener datos actuales de ML para este lote
    logger.info(`📡 PROCESS STEP 1: Obteniendo ${productIds.length} productos desde ML API...`);
    const mlProductsData = await mlApiService.getMultipleProducts(productIds, false, userId);
    logger.info(`📡 PROCESS STEP 1 RESULT: Obtenidos ${mlProductsData?.length || 0} productos desde ML API`);
    
    if (!mlProductsData || mlProductsData.length === 0) {
      return {
        success: true,
        message: 'No se pudieron obtener productos de ML API',
        processed: 0,
        processingTime: Date.now() - startTime
      };
    }

    // STEP 2: Obtener datos actuales de BD (solo campos para comparación)
    logger.info(`🔍 PROCESS STEP 2: Consultando BD para ${productIds.length} productos...`);
    const dbProducts = await databaseService.getProductsForComparison(productIds, userId);
    logger.info(`🔍 PROCESS STEP 2 RESULT: Obtenidos ${dbProducts?.length || 0} productos desde BD`);
    
    // STEP 3: Comparar y clasificar productos
    logger.info(`⚖️ PROCESS STEP 3: Comparando ${mlProductsData.length} productos ML vs ${dbProducts.length} productos BD...`);
    const result = compareProducts(mlProductsData, dbProducts, userId);
    logger.info(`⚖️ PROCESS STEP 3 RESULT: ${result.newProducts.length} nuevos, ${result.updatedProducts.length} actualizados, ${result.unchangedCount} sin cambios`);
    
    // STEP 3.1: Log detallado de productos con cambios (para verificar actualizaciones de stock)
    if (result.updatedProducts.length > 0) {
      logger.info(`📊 STOCK UPDATES: Detectados ${result.updatedProducts.length} productos con cambios:`);
      result.updatedProducts.slice(0, 3).forEach(product => {
        logger.info(`  • ${product.id}: Stock=${product.available_quantity}, Price=${product.price}`);
      });
      if (result.updatedProducts.length > 3) {
        logger.info(`  • ... y ${result.updatedProducts.length - 3} productos más`);
      }
    }
    
    // STEP 4: Procesar cambios en BD
    let totalSaved = 0;
    
    if (result.newProducts.length > 0) {
      logger.info(`💾 PROCESS STEP 4A: Guardando ${result.newProducts.length} productos nuevos en BD...`);
      await databaseService.upsertMultipleProducts(result.newProducts);
      totalSaved += result.newProducts.length;
      logger.info(`✅ PROCESS STEP 4A RESULT: Guardados ${result.newProducts.length} productos nuevos`);
    }
    
    if (result.updatedProducts.length > 0) {
      logger.info(`📝 PROCESS STEP 4B: Actualizando ${result.updatedProducts.length} productos en BD...`);
      await databaseService.updateProductsOptimized(result.updatedProducts);
      totalSaved += result.updatedProducts.length;
      logger.info(`✅ PROCESS STEP 4B RESULT: Actualizados ${result.updatedProducts.length} productos con cambios`);
    }
    
    const processingTime = Date.now() - startTime;
    logger.info(`📊 PROCESS RESUMEN: ${result.newProducts.length} nuevos, ${result.updatedProducts.length} actualizados, ${result.unchangedCount} sin cambios (${processingTime}ms)`);
    
    return {
      success: true,
      message: 'Procesamiento inteligente completado',
      stats: {
        total: productIds.length,
        processed: mlProductsData.length,
        newProducts: result.newProducts.length,
        updatedProducts: result.updatedProducts.length,
        unchangedProducts: result.unchangedCount,
        saved: totalSaved
      },
      processingTime
    };

  } catch (error) {
    const processingTime = Date.now() - startTime;
    logger.error(`❌ PROCESS ERROR: ${error.message} (${processingTime}ms)`);
    logger.error(`❌ PROCESS STACK: ${error.stack}`);
    
    return {
      success: false,
      error: 'Error en procesamiento inteligente',
      message: error.message,
      processingTime
    };
  }
}

/**
 * Función para limpiar productos que ya no existen en ML API
 * Se ejecuta cuando el scan está completo
 */
async function cleanupDeletedProducts(allCurrentMLIds, userId, dependencies) {
  const { databaseService, logger } = dependencies;
  const startTime = Date.now();
  
  try {
    logger.info(`🧹 CLEANUP: Iniciando limpieza de productos eliminados...`);
    
    // Obtener todos los IDs que tenemos en BD
    const dbProductIds = await databaseService.getAllProductIds(userId);
    logger.info(`🧹 CLEANUP: BD tiene ${dbProductIds.length} productos, ML API tiene ${allCurrentMLIds.length}`);
    
    // Encontrar productos que están en BD pero no en ML API
    const mlIdsSet = new Set(allCurrentMLIds);
    const productsToDelete = dbProductIds.filter(dbId => !mlIdsSet.has(dbId));
    
    if (productsToDelete.length > 0) {
      logger.info(`🗑️ CLEANUP: Eliminando ${productsToDelete.length} productos que ya no existen en ML API`);
      await databaseService.deleteProducts(productsToDelete, userId);
      logger.info(`✅ CLEANUP: ${productsToDelete.length} productos eliminados exitosamente`);
    } else {
      logger.info(`✅ CLEANUP: No hay productos para eliminar - BD sincronizada con ML API`);
    }
    
    const processingTime = Date.now() - startTime;
    return {
      success: true,
      deletedCount: productsToDelete.length,
      processingTime
    };
    
  } catch (error) {
    const processingTime = Date.now() - startTime;
    logger.error(`❌ CLEANUP ERROR: ${error.message} (${processingTime}ms)`);
    
    return {
      success: false,
      error: 'Error en limpieza de productos eliminados',
      message: error.message,
      processingTime
    };
  }
}

module.exports = {
  processProductsBatch,
  cleanupDeletedProducts
};