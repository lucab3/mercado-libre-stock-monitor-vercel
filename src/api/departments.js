/**
 * API endpoint para gestión de configuración de departamentos
 * Permite crear botones personalizados que filtran por múltiples categorías
 */

const { withAuth } = require('../middleware/serverlessAuth');
const logger = require('../utils/logger');

// Almacenamiento temporal en memoria (en producción sería en base de datos)
const departmentStorage = new Map();

/**
 * Obtener configuración de departamentos del usuario
 */
async function getDepartments(req, res) {
  try {
    const userId = req.auth.userId;
    
    logger.info(`📁 Obteniendo configuración de departamentos para usuario: ${userId}`);
    
    // Obtener configuración del usuario (por ahora desde memoria, después desde BD)
    const userDepartments = departmentStorage.get(userId) || [];
    
    logger.info(`📁 Encontrados ${userDepartments.length} departamentos configurados`);
    
    res.json({
      success: true,
      departments: userDepartments,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error(`❌ Error obteniendo departamentos: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Error obteniendo configuración de departamentos',
      message: error.message
    });
  }
}

/**
 * Guardar configuración de departamentos del usuario
 */
async function saveDepartments(req, res) {
  try {
    const userId = req.auth.userId;
    const { departments } = req.body;
    
    if (!Array.isArray(departments)) {
      return res.status(400).json({
        success: false,
        error: 'Formato inválido',
        message: 'departments debe ser un array'
      });
    }
    
    // Validar estructura de departamentos
    for (const dept of departments) {
      if (!dept.id || !dept.name || !Array.isArray(dept.categories)) {
        return res.status(400).json({
          success: false,
          error: 'Estructura de departamento inválida',
          message: 'Cada departamento debe tener id, name y categories (array)'
        });
      }
    }
    
    logger.info(`💾 Guardando ${departments.length} departamentos para usuario: ${userId}`);
    
    // Guardar en memoria (por ahora)
    departmentStorage.set(userId, departments);
    
    // Log de los departamentos guardados
    departments.forEach(dept => {
      logger.info(`  📁 ${dept.name}: ${dept.categories.length} categorías [${dept.categories.map(c => c.name).join(', ')}]`);
    });
    
    res.json({
      success: true,
      message: 'Configuración de departamentos guardada correctamente',
      departments: departments,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error(`❌ Error guardando departamentos: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Error guardando configuración de departamentos',
      message: error.message
    });
  }
}

/**
 * Manejador principal de rutas
 */
async function handleDepartments(req, res) {
  const { method } = req;
  
  switch (method) {
    case 'GET':
      return await getDepartments(req, res);
    
    case 'POST':
      return await saveDepartments(req, res);
    
    default:
      return res.status(405).json({
        success: false,
        error: 'Método no permitido',
        allowedMethods: ['GET', 'POST']
      });
  }
}

// Export con middleware de autenticación
module.exports = withAuth(handleDepartments);