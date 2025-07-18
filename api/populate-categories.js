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
    
    // 3. Usar mapeo estático (ML API da error de permisos)
    const categoryNames = {
      'MLA60569': 'Almacenamiento',
      'MLA372015': 'Tarjetas de Video',
      'MLA429387': 'Procesadores',
      'MLA30756': 'Memoria RAM',
      'MLA417317': 'Motherboards',
      'MLA372016': 'Tarjetas de Red',
      'MLA30810': 'Fuentes de Poder',
      'MLA1045': 'Notebooks',
      'MLA380668': 'Cables y Adaptadores',
      'MLA380663': 'Teclados',
      'MLA372014': 'Tarjetas de Sonido',
      'MLA3697': 'Monitores',
      'MLA417042': 'Gabinetes',
      'MLA413321': 'Coolers',
      'MLA431208': 'Mouses',
      'MLA1042': 'PC de Escritorio',
      'MLA48898': 'Impresoras',
      'MLA413480': 'Parlantes',
      'MLA91758': 'Auriculares',
      'MLA417170': 'Webcams',
      'MLA407128': 'Tablets',
      'MLA1055': 'Celulares y Teléfonos',
      'MLA30949': 'Smartphones',
      'MLA60635': 'Smartwatches',
      'MLA411422': 'Consolas',
      'MLA414103': 'Videojuegos',
      'MLA431207': 'Micrófonos',
      'MLA372009': 'Tarjetas de Memoria',
      'MLA44408': 'Cargadores',
      'MLA413475': 'Altavoces',
      'MLA412530': 'Controladores',
      'MLA413463': 'Auriculares Gaming',
      'MLA30763': 'Procesadores Gráficos',
      'MLA431019': 'Fundas y Estuches',
      'MLA58727': 'Cámaras Web',
      'MLA431218': 'Mousepads',
      'MLA416985': 'Sillas Gaming',
      'MLA4625': 'Soportes',
      'MLA431206': 'Ventiladores',
      'MLA373345': 'Memorias USB',
      'MLA431209': 'Luces LED',
      'MLA380665': 'Cables HDMI',
      'MLA430611': 'Streaming',
      'MLA435492': 'Proyectores',
      'MLA372999': 'Drivers',
      'MLA30788': 'Discos Duros',
      'MLA412586': 'Accesorios Gaming',
      'MLA30811': 'UPS',
      'MLA434737': 'Cámaras Digitales',
      'MLA69930': 'Televisores',
      'MLA12812': 'Electrodomésticos',
      'MLA392132': 'Accesorios para Celulares',
      'MLA91746': 'Parlantes Bluetooth',
      'MLA372007': 'Tarjetas WiFi',
      'MLA412582': 'Joysticks',
      'MLA455196': 'Reproductores',
      'MLA412362': 'Controles Remotos',
      'MLA456926': 'Drones',
      'MLA380652': 'Adaptadores',
      'MLA430537': 'Bases de Carga',
      'MLA47781': 'Cámaras de Seguridad',
      'MLA1659': 'Componentes Electrónicos',
      'MLA30764': 'Memorias de Video',
      'MLA30798': 'Tarjetas Madre',
      'MLA455202': 'Equipos de Audio',
      'MLA30789': 'Discos SSD',
      'MLA383867': 'Estabilizadores',
      'MLA387583': 'Lectores de Tarjetas',
      'MLA412529': 'Mandos',
      'MLA2893': 'Radios',
      'MLA5337': 'Batería y Energía',
      'MLA90322': 'Equipos de Sonido',
      'MLA413548': 'Sillas de Oficina',
      'MLA6049': 'Pilas y Baterías',
      'MLA10072': 'Limpieza',
      'MLA417778': 'Refrigeración',
      'MLA435491': 'Iluminación',
      'MLA372030': 'Conectores',
      'MLA1652': 'Herramientas',
      'MLA30809': 'Reguladores',
      'MLA352001': 'Convertidores',
      'MLA378182': 'Extensores',
      'MLA380650': 'Splitters',
      'MLA412006': 'Switches',
      'MLA413985': 'Routers',
      'MLA438566': 'Antenas',
      'MLA30759': 'Tarjetas Gráficas',
      'MLA412577': 'Bases y Soportes',
      'MLA416524': 'Organizadores',
      'MLA442422': 'Protectores',
      'MLA5959': 'Limpiadores',
      'MLA60567': 'Accesorios',
      'MLA380657': 'Distribuidores',
      'MLA429749': 'Sensores',
      'MLA457051': 'Herramientas de Red',
      'MLA1714': 'Telescopios',
      'MLA408023': 'Lentes',
      'MLA416680': 'Trípodes',
      'MLA434918': 'Filtros',
      'MLA73039': 'Flashes'
    };
    
    const results = [];
    const errors = [];
    
    logger.info(`🔍 POPULATE-CATEGORIES: Usando mapeo estático para ${newCategoryIds.length} categorías`);
    
    // Procesar categorías usando mapeo estático
    for (const categoryId of newCategoryIds) {
      try {
        const categoryName = categoryNames[categoryId];
        
        if (categoryName) {
          // Mapear información de la categoría
          const categoryInfo = {
            id: categoryId,
            name: categoryName,
            country_code: categoryId.substring(0, 2) === 'ML' ? 
              categoryId.substring(2, 3) === 'A' ? 'AR' : 
              categoryId.substring(2, 3) === 'M' ? 'MX' : 
              categoryId.substring(2, 3) === 'B' ? 'BR' : 'AR' : 'AR',
            site_id: categoryId.substring(0, 3),
            path_from_root: [],
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
        } else {
          // Categoría no encontrada en mapeo estático
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
        }
      } catch (error) {
        logger.error(`❌ POPULATE-CATEGORIES: Error con ${categoryId}: ${error.message}`);
        errors.push({
          categoryId: categoryId,
          error: error.message
        });
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