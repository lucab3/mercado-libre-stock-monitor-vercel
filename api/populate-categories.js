/**
 * Endpoint para poblar la tabla categories con datos de productos existentes
 * Independiente del sync-next
 */

const databaseService = require('../src/services/databaseService');
const sessionManager = require('../src/utils/sessionManager');
const logger = require('../src/utils/logger');

async function populateCategories(req, res) {
  try {
    // Validar autenticación
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
    
    // 3. Obtener categorías usando search de items ML API
    const results = [];
    const errors = [];
    
    logger.info(`🔍 POPULATE-CATEGORIES: Obteniendo categorías desde ML API usando search`);
    
    try {
      // Usar nuestro endpoint de productos que ya tiene acceso a ML API
      const sessionManager = require('../src/utils/sessionManager');
      const session = sessionManager.getSessionByCookie(req.headers.cookie?.match(/ml-session=([^;]+)/)?.[1]);
      
      if (!session || !session.accessToken) {
        throw new Error('No se encontró token de acceso válido');
      }
      
      // Consultar los items del usuario para obtener categorías de los filters
      const response = await fetch(`https://api.mercadolibre.com/users/${userId}/items/search?limit=100`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.accessToken}`,
          'Accept': 'application/json'
        }
      });
      
      logger.info(`🔍 POPULATE-CATEGORIES: Respuesta search items: ${response.status}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`🔍 POPULATE-CATEGORIES: Error en search: ${errorText}`);
        throw new Error(`Error en search: ${response.status} ${response.statusText}`);
      }
      
      const searchData = await response.json();
      logger.info(`🔍 POPULATE-CATEGORIES: Obtenidos ${searchData.results?.length || 0} items`);
      
      // Extraer categorías de los items
      const categoriesFromItems = new Set();
      if (searchData.results) {
        searchData.results.forEach(item => {
          if (item.category_id) {
            categoriesFromItems.add(item.category_id);
          }
        });
      }
      
      logger.info(`🔍 POPULATE-CATEGORIES: Categorías encontradas en items: ${categoriesFromItems.size}`);
      
      // Procesar cada categoría única encontrada
      for (const categoryId of Array.from(categoriesFromItems)) {
        try {
          // Hacer búsqueda por categoría para obtener info en filters
          const categorySearchResponse = await fetch(`https://api.mercadolibre.com/sites/MLA/search?category=${categoryId}&limit=1`, {
            method: 'GET',
            headers: {
              'Accept': 'application/json'
            }
          });
          
          if (!categorySearchResponse.ok) {
            logger.warn(`⚠️ POPULATE-CATEGORIES: Error search categoría ${categoryId}: ${categorySearchResponse.status}`);
            continue;
          }
          
          const categorySearchData = await categorySearchResponse.json();
          
          // Buscar info de categoría en filters
          let categoryName = null;
          let pathFromRoot = [];
          
          if (categorySearchData.filters) {
            const categoryFilter = categorySearchData.filters.find(f => f.id === 'category');
            if (categoryFilter && categoryFilter.values) {
              const categoryValue = categoryFilter.values.find(v => v.id === categoryId);
              if (categoryValue) {
                categoryName = categoryValue.name;
                pathFromRoot = categoryValue.path_from_root || [];
              }
            }
          }
          
          // Si no encontramos en filters, usar nombre genérico
          if (!categoryName) {
            categoryName = `Categoría ${categoryId}`;
            logger.warn(`⚠️ POPULATE-CATEGORIES: No se encontró nombre para ${categoryId}, usando genérico`);
          }
          
          // Mapear información de la categoría
          const categoryInfo = {
            id: categoryId,
            name: categoryName,
            country_code: categoryId.substring(0, 2) === 'ML' ? 
              categoryId.substring(2, 3) === 'A' ? 'AR' : 
              categoryId.substring(2, 3) === 'M' ? 'MX' : 
              categoryId.substring(2, 3) === 'B' ? 'BR' : 'AR' : 'AR',
            site_id: categoryId.substring(0, 3),
            path_from_root: pathFromRoot,
            total_items_in_this_category: 0
          };
          
          // Guardar en base de datos
          await databaseService.upsertCategory(categoryInfo);
          
          results.push({
            categoryId: categoryId,
            name: categoryName,
            success: true
          });
          
          logger.info(`✅ POPULATE-CATEGORIES: Guardada ${categoryId}: ${categoryName}`);
          
        } catch (error) {
          logger.error(`❌ POPULATE-CATEGORIES: Error procesando ${categoryId}: ${error.message}`);
          errors.push({
            categoryId: categoryId,
            error: error.message
          });
        }
      }
      
    } catch (error) {
      logger.error(`❌ POPULATE-CATEGORIES: Error general en search: ${error.message}`);
      
      // Fallback: procesar categorías que encontramos en productos con nombre genérico
      for (const categoryId of newCategoryIds.slice(0, 10)) { // Limitamos a 10 para no saturar
        try {
          const fallbackName = `Categoría ${categoryId}`;
          const categoryInfo = {
            id: categoryId,
            name: fallbackName,
            country_code: categoryId.substring(0, 2) === 'ML' ? 
              categoryId.substring(2, 3) === 'A' ? 'AR' : 
              categoryId.substring(2, 3) === 'M' ? 'MX' : 
              categoryId.substring(2, 3) === 'B' ? 'BR' : 'AR' : 'AR',
            site_id: categoryId.substring(0, 3),
            path_from_root: [],
            total_items_in_this_category: 0
          };
          
          await databaseService.upsertCategory(categoryInfo);
          
          results.push({
            categoryId: categoryId,
            name: fallbackName,
            success: true
          });
          
          logger.info(`⚠️ POPULATE-CATEGORIES: Guardada con nombre genérico ${categoryId}: ${fallbackName}`);
        } catch (fallbackError) {
          logger.error(`❌ POPULATE-CATEGORIES: Error en fallback ${categoryId}: ${fallbackError.message}`);
          errors.push({
            categoryId: categoryId,
            error: fallbackError.message
          });
        }
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

module.exports = async function handler(req, res) {
  const { method } = req;
  
  console.log(`🌐 API populate-categories - ${method} request received`);
  
  switch (method) {
    case 'POST':
      return await populateCategories(req, res);
    
    default:
      return res.status(405).json({
        success: false,
        error: 'Método no permitido',
        allowedMethods: ['POST']
      });
  }
};