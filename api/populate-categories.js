/**
 * Endpoint para poblar la tabla categories con datos de productos existentes
 * Independiente del sync-next
 */

const databaseService = require('../src/services/databaseService');
const { withAuth } = require('../src/middleware/serverlessAuth');
const logger = require('../src/utils/logger');

async function populateCategories(req, res) {
  try {
    const userId = req.auth.userId;
    
    logger.info(`🔍 POPULATE-CATEGORIES: Iniciando población de categorías para usuario ${userId}`);
    
    // 1. Obtener todas las categorías únicas de los productos existentes
    const products = await databaseService.getAllProducts(userId);
    const categoryIds = [...new Set(products.map(p => p.category_id).filter(Boolean))];
    
    logger.info(`🔍 POPULATE-CATEGORIES: Encontradas ${categoryIds.length} categorías únicas en ${products.length} productos`);
    logger.info(`🔍 POPULATE-CATEGORIES: Categorías: ${categoryIds.slice(0, 10).join(', ')}...`);
    
    if (categoryIds.length === 0) {
      return res.json({
        success: true,
        message: 'No hay categorías para procesar',
        processed: 0,
        saved: 0
      });
    }
    
    // 2. Verificar cuáles ya existen en la tabla categories
    const existingCategories = await databaseService.getCategoriesByIds(categoryIds);
    const existingIds = new Set(existingCategories.map(c => c.id));
    const newCategoryIds = categoryIds.filter(id => !existingIds.has(id));
    
    logger.info(`🔍 POPULATE-CATEGORIES: ${existingCategories.length} ya existen, ${newCategoryIds.length} son nuevas`);
    
    if (newCategoryIds.length === 0) {
      return res.json({
        success: true,
        message: 'Todas las categorías ya existen en la base de datos',
        processed: categoryIds.length,
        saved: 0,
        existing: existingCategories.length
      });
    }
    
    // 3. Obtener información de las categorías desde ML API
    const results = [];
    const errors = [];
    
    logger.info(`🔍 POPULATE-CATEGORIES: Consultando ML API para ${newCategoryIds.length} categorías`);
    
    // Procesar en lotes para no saturar la API
    const batchSize = 5;
    for (let i = 0; i < newCategoryIds.length; i += batchSize) {
      const batch = newCategoryIds.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (categoryId) => {
        try {
          logger.info(`🔍 POPULATE-CATEGORIES: Consultando ${categoryId}`);
          const response = await fetch(`https://api.mercadolibre.com/categories/${categoryId}`);
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          
          const categoryData = await response.json();
          logger.info(`🔍 POPULATE-CATEGORIES: Obtenida ${categoryId}: ${categoryData.name}`);
          
          // Mapear información de la categoría
          const categoryInfo = {
            id: categoryData.id,
            name: categoryData.name,
            country_code: categoryData.id.substring(0, 2) === 'ML' ? 
              categoryData.id.substring(2, 3) === 'A' ? 'AR' : 
              categoryData.id.substring(2, 3) === 'M' ? 'MX' : 
              categoryData.id.substring(2, 3) === 'B' ? 'BR' : 'AR' : 'AR',
            site_id: categoryData.id.substring(0, 3),
            path_from_root: categoryData.path_from_root || [],
            total_items_in_this_category: categoryData.total_items_in_this_category || 0
          };
          
          // Guardar en base de datos
          await databaseService.upsertCategory(categoryInfo);
          
          results.push({
            categoryId: categoryId,
            name: categoryData.name,
            success: true
          });
          
          logger.info(`✅ POPULATE-CATEGORIES: Guardada ${categoryId}: ${categoryData.name}`);
          
        } catch (error) {
          logger.error(`❌ POPULATE-CATEGORIES: Error con ${categoryId}: ${error.message}`);
          errors.push({
            categoryId: categoryId,
            error: error.message
          });
        }
      });
      
      await Promise.all(batchPromises);
      
      // Pausa entre lotes
      if (i + batchSize < newCategoryIds.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    logger.info(`🎉 POPULATE-CATEGORIES: Completado - ${results.length} éxitos, ${errors.length} errores`);
    
    res.json({
      success: true,
      message: `Poblado completado: ${results.length} categorías guardadas`,
      processed: categoryIds.length,
      saved: results.length,
      errors: errors.length,
      existing: existingCategories.length,
      results: results,
      errors_detail: errors,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error(`❌ POPULATE-CATEGORIES: Error general: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Error poblando categorías',
      message: error.message
    });
  }
}

module.exports = withAuth(populateCategories);