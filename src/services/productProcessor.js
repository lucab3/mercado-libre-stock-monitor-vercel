/**
 * Servicio de procesamiento de productos
 * Función utilitaria pura para comparar ML vs BD y actualizar solo cambios
 * Optimizado para reducir egress de Supabase
 */

/**
 * Función auxiliar: Extraer manufacturing time de sale_terms
 */
function extractManufacturingTime(productData) {
  const logger = require('../utils/logger');
  
  if (!productData.sale_terms || !Array.isArray(productData.sale_terms)) {
    return null;
  }
  
  const manufacturingTerm = productData.sale_terms.find(term => term.id === 'MANUFACTURING_TIME');
  if (!manufacturingTerm) {
    return null;
  }
  
  logger.info(`🎯 MANUFACTURING_TIME encontrado para ${productData.id}:`, {
    value_name: manufacturingTerm.value_name,
    value_struct: manufacturingTerm.value_struct
  });
  
  // Priorizar value_struct.number si existe
  if (manufacturingTerm.value_struct && manufacturingTerm.value_struct.number) {
    const manufacturingDays = parseInt(manufacturingTerm.value_struct.number);
    const manufacturingHours = manufacturingDays * 24;
    logger.info(`✅ Usando value_struct.number = ${manufacturingDays} días = ${manufacturingHours}h`);
    return manufacturingHours;
  } 
  // Fallback a value_name con regex
  else if (manufacturingTerm.value_name) {
    const match = manufacturingTerm.value_name.match(/(\d+)/);
    if (match) {
      const manufacturingDays = parseInt(match[1]);
      const manufacturingHours = manufacturingDays * 24;
      logger.info(`✅ Usando value_name regex = ${manufacturingDays} días = ${manufacturingHours}h`);
      return manufacturingHours;
    }
  }
  
  return null;
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
      // Solo campos que cambiaron + shipping info
      const logger = require('../utils/logger');
      logger.info(`🔧 DEBUG UPDATE: Procesando producto existente ${mlProduct.id} con cambios`);
      logger.info(`🔧 DEBUG UPDATE: sale_terms presente: ${!!(mlProduct.sale_terms && Array.isArray(mlProduct.sale_terms))}`);
      if (mlProduct.sale_terms && Array.isArray(mlProduct.sale_terms)) {
        logger.info(`🔧 DEBUG UPDATE: sale_terms length: ${mlProduct.sale_terms.length}`);
      }
      const manufacturingHours = extractManufacturingTime(mlProduct);
      logger.info(`🔧 DEBUG UPDATE: manufacturingHours calculado: ${manufacturingHours}`);
      
      updatedProducts.push({
        id: mlProduct.id,
        available_quantity: mlProduct.available_quantity || 0,
        price: mlProduct.price,
        status: mlProduct.status,
        title: mlProduct.title, // Título puede cambiar
        seller_sku: extractSKUFromProduct(mlProduct), // SKU puede cambiar
        estimated_handling_time: manufacturingHours, // ⭐ Manufacturing time desde sale_terms
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
  const manufacturingHours = extractManufacturingTime(mlProduct);
  
  // 🔍 DEBUG CRÍTICO: Verificar valores exactos
  const logger = require('../utils/logger');
  logger.info(`🔍 CHANGE CHECK ${mlProduct.id}: manufacturingHours=${manufacturingHours}, dbProduct.estimated_handling_time=${dbProduct.estimated_handling_time}`);
  
  return mlProduct.available_quantity !== dbProduct.available_quantity ||
         mlProduct.price !== dbProduct.price ||
         mlProduct.status !== dbProduct.status ||
         mlProduct.title !== dbProduct.title ||
         extractSKUFromProduct(mlProduct) !== dbProduct.seller_sku ||
         manufacturingHours !== dbProduct.estimated_handling_time; // ⭐ Detectar cambios en manufacturing time
}

/**
 * Función interna: Mapear producto ML a formato BD
 */
function mapProductForDB(productData, userId) {
  const logger = require('../utils/logger');
  const extractedSKU = extractSKUFromProduct(productData);
  
  // 🔍 Log detallado de sale_terms para debug
  if (productData.sale_terms && Array.isArray(productData.sale_terms)) {
    logger.info(`🔍 DEBUG ${productData.id}: sale_terms length=${productData.sale_terms.length}`);
    productData.sale_terms.forEach((term, index) => {
      logger.info(`  • Term ${index}: id="${term.id}", value_name="${term.value_name}"`);
    });
  } else {
    logger.info(`❌ Producto ${productData.id} NO tiene sale_terms o no es array`);
  }
  
  // Extraer manufacturing time usando función centralizada
  const manufacturingHours = extractManufacturingTime(productData);
  
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
    
    // DEBUG: Verificar si mlProductsData es válido
    if (!mlProductsData) {
      logger.error(`🚨 CRITICAL: mlProductsData es null/undefined`);
    } else if (mlProductsData.length === 0) {
      logger.error(`🚨 CRITICAL: mlProductsData está vacío (length = 0)`);
    } else {
      logger.info(`✅ VALID: mlProductsData tiene ${mlProductsData.length} productos válidos`);
    }
    
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