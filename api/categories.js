/**
 * Endpoint serverless para obtener información de categorías
 * Usa la base de datos de Supabase para resolver nombres
 */

// Mapeo estático como fallback mientras se arreglan las dependencias
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

    console.log(`📦 API Categories - Respuesta: ${Object.keys(categoriesInfo).length} categorías procesadas`);

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