/**
 * Endpoint para obtener categorías reales de la API de MercadoLibre
 * y guardarlas en la base de datos
 */

const databaseService = require('../src/services/databaseService');
const { withAuth } = require('../src/middleware/serverlessAuth');
const logger = require('../src/utils/logger');

async function fetchCategoriesFromML(req, res) {
  try {
    const { categoryIds } = req.body;
    
    if (!categoryIds || !Array.isArray(categoryIds)) {
      return res.status(400).json({
        success: false,
        error: 'categoryIds debe ser un array'
      });
    }

    logger.info(`🔍 Obteniendo ${categoryIds.length} categorías de la API de MercadoLibre`);

    const results = [];
    const errors = [];

    // Procesar categorías en lotes para no saturar la API
    const batchSize = 5;
    for (let i = 0; i < categoryIds.length; i += batchSize) {
      const batch = categoryIds.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (categoryId) => {
        try {
          const response = await fetch(`https://api.mercadolibre.com/categories/${categoryId}`);
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          
          const categoryData = await response.json();
          
          // Extraer información relevante
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
          
          results.push(categoryInfo);
          logger.info(`✅ Categoría guardada: ${categoryId} - ${categoryData.name}`);
          
        } catch (error) {
          logger.error(`❌ Error obteniendo categoría ${categoryId}: ${error.message}`);
          errors.push({ categoryId, error: error.message });
        }
      });

      // Ejecutar batch y esperar
      await Promise.all(batchPromises);
      
      // Pausa entre lotes para no saturar la API
      if (i + batchSize < categoryIds.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    logger.info(`🎉 Proceso completado: ${results.length} éxitos, ${errors.length} errores`);

    res.json({
      success: true,
      processed: categoryIds.length,
      saved: results.length,
      errors: errors.length,
      results: results,
      errors_detail: errors,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error(`❌ Error en fetch-categories: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Error obteniendo categorías de MercadoLibre',
      message: error.message
    });
  }
}

module.exports = withAuth(fetchCategoriesFromML);