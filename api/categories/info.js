/**
 * Endpoint /api/categories/info - Usa archivo JSON estático del árbol completo de ML
 * Este es el endpoint que usa el frontend
 */

const path = require('path');
const fs = require('fs');

// Cargar categorías desde archivo JSON estático
let categoriesData = null;

function loadCategoriesData() {
  if (!categoriesData) {
    const categoriesPath = path.join(process.cwd(), 'src/data/categories.json');
    categoriesData = JSON.parse(fs.readFileSync(categoriesPath, 'utf8'));
    console.log(`📂 Categories Info - Categorías cargadas: ${Object.keys(categoriesData).length} desde archivo estático`);
  }
  return categoriesData;
}

/**
 * Obtener información de categorías desde archivo JSON estático
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

    console.log(`📂 Categories Info - Obteniendo ${categoryIds.length} categorías`);

    const allCategories = loadCategoriesData();
    const categoriesInfo = {};
    
    categoryIds.forEach(categoryId => {
      const categoryData = allCategories[categoryId];
      if (categoryData) {
        categoriesInfo[categoryId] = {
          id: categoryData.id,
          name: categoryData.name,
          path_from_root: categoryData.path_from_root || []
        };
      } else {
        // Fallback para categorías no encontradas
        categoriesInfo[categoryId] = {
          id: categoryId,
          name: `Categoría ${categoryId}`,
          path_from_root: []
        };
      }
    });

    const found = categoryIds.filter(id => allCategories[id]).length;
    const missing = categoryIds.filter(id => !allCategories[id]).length;

    console.log(`📦 Categories Info - Procesadas ${Object.keys(categoriesInfo).length} categorías (${found} encontradas, ${missing} fallback)`);

    res.json({
      success: true,
      categories: categoriesInfo,
      total: Object.keys(categoriesInfo).length,
      source: {
        static: found,
        fallback: missing
      }
    });

  } catch (error) {
    console.error(`❌ Categories Info - Error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Error obteniendo información de categorías',
      message: error.message
    });
  }
}

/**
 * Manejador principal de rutas para Vercel
 */
module.exports = async function handler(req, res) {
  const { method } = req;
  
  console.log(`🌐 Categories Info - ${method} request received`);
  
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
};