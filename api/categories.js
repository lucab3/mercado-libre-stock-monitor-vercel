/**
 * Endpoint serverless para obtener información de categorías
 * Versión simplificada para testing
 */

// Mapeo estático como fallback
const categoryNames = {
  'MLM1055': 'Celulares y Teléfonos',
  'MLM1648': 'Computación', 
  'MLM1144': 'Consolas y Videojuegos',
  'MLM1000': 'Electrónicos',
  'MLM1403': 'Instrumentos Musicales',
  'MLM1276': 'Deportes y Fitness',
  'MLM1430': 'Ropa y Accesorios',
  'MLM1132': 'Juegos y Juguetes',
  'MLM1367': 'Industrias y Oficinas',
  'MLM1039': 'Cámaras y Accesorios',
  'MLA10626': 'Hogar y Jardín',
  'MLA1144': 'Consolas y Videojuegos',
  'MLA1648': 'Computación',
  'MLA1000': 'Electrónicos',
  'MLA1055': 'Celulares y Teléfonos',
  'MLA1403': 'Instrumentos Musicales',
  'MLA1276': 'Deportes y Fitness',
  'MLA1430': 'Ropa y Accesorios',
  'MLA1132': 'Juegos y Juguetes',
  'MLA1367': 'Industrias y Oficinas',
  'MLA1039': 'Cámaras y Accesorios'
};

/**
 * Obtener información de categorías
 */
async function getCategoriesInfo(req, res) {
  try {
    const { categoryIds } = req.body;
    
    if (!categoryIds || !Array.isArray(categoryIds)) {
      return res.status(400).json({
        success: false,
        error: 'categoryIds debe ser un array'
      });
    }

    console.log(`📂 API Categories - Obteniendo información de ${categoryIds.length} categorías:`, categoryIds);

    const categoriesInfo = {};
    
    // Usar mapeo estático por ahora
    categoryIds.forEach(categoryId => {
      categoriesInfo[categoryId] = {
        id: categoryId,
        name: categoryNames[categoryId] || `Categoría ${categoryId}`,
        path_from_root: []
      };
    });

    console.log('📦 API Categories - Respuesta:', categoriesInfo);

    res.json({
      success: true,
      categories: categoriesInfo,
      total: Object.keys(categoriesInfo).length
    });

  } catch (error) {
    console.error(`❌ API Categories - Error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Error obteniendo información de categorías',
      message: error.message
    });
  }
}

/**
 * Manejador principal de rutas
 */
async function handleCategories(req, res) {
  const { method } = req;
  
  console.log(`🌐 API Categories - ${method} request received`);
  
  switch (method) {
    case 'POST':
      return await getCategoriesInfo(req, res);
    
    default:
      return res.status(405).json({
        success: false,
        error: 'Método no permitido',
        allowedMethods: ['POST']
      });
  }
}

// Export directo sin middleware
module.exports = handleCategories;