/**
 * API endpoint para gestión de configuración de departamentos
 * Permite crear botones personalizados que filtran por múltiples categorías
 */

const { withAuth } = require('../middleware/serverlessAuth');
const logger = require('../utils/logger');
const databaseService = require('../services/databaseService');

/**
 * Obtener configuración de departamentos del usuario
 */
async function getDepartments(req, res) {
  try {
    const userId = req.auth.userId;
    
    logger.info(`📁 Obteniendo configuración de departamentos para usuario: ${userId}`);
    
    // Obtener configuración del usuario desde Supabase
    const configKey = `departments_${userId}`;
    const userDepartments = await databaseService.getConfig(configKey) || [];
    
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
    const { departments: rawDepartments } = req.body;
    
    // Validación de seguridad para departments
    if (!Array.isArray(rawDepartments)) {
      logger.warn(`🚨 departments no es array desde IP: ${req.ip}`);
      return res.status(400).json({
        success: false,
        error: 'Formato inválido',
        message: 'departments debe ser un array'
      });
    }
    
    // Validar límite de departamentos para prevenir DoS
    if (rawDepartments.length > 50) {
      logger.warn(`🚨 Demasiados departamentos (${rawDepartments.length}) desde IP: ${req.ip}`);
      return res.status(400).json({
        success: false,
        error: 'Límite excedido',
        message: 'Máximo 50 departamentos permitidos'
      });
    }
    
    // Validar y sanitizar cada departamento
    const departments = [];
    for (let i = 0; i < rawDepartments.length; i++) {
      const dept = rawDepartments[i];
      
      // Validar estructura básica
      if (!dept || typeof dept !== 'object') {
        logger.warn(`🚨 Departamento ${i} no es objeto desde IP: ${req.ip}`);
        return res.status(400).json({
          success: false,
          error: 'Estructura de departamento inválida',
          message: `Departamento ${i} debe ser un objeto`
        });
      }
      
      // Validar y sanitizar campos
      const id = typeof dept.id === 'string' ? dept.id.slice(0, 50).replace(/[<>\"']/g, '') : null;
      const name = typeof dept.name === 'string' ? dept.name.slice(0, 100).replace(/[<>\"']/g, '') : null;
      
      if (!id || !name) {
        logger.warn(`🚨 Departamento ${i} campos faltantes desde IP: ${req.ip}`);
        return res.status(400).json({
          success: false,
          error: 'Estructura de departamento inválida',
          message: `Departamento ${i} debe tener id y name válidos`
        });
      }
      
      // Validar categorías
      if (!Array.isArray(dept.categories)) {
        logger.warn(`🚨 Departamento ${i} categories no es array desde IP: ${req.ip}`);
        return res.status(400).json({
          success: false,
          error: 'Estructura de departamento inválida',
          message: `Departamento ${i} categories debe ser un array`
        });
      }
      
      // Validar límite de categorías
      if (dept.categories.length > 100) {
        logger.warn(`🚨 Departamento ${i} demasiadas categorías (${dept.categories.length}) desde IP: ${req.ip}`);
        return res.status(400).json({
          success: false,
          error: 'Límite excedido',
          message: `Departamento ${i} máximo 100 categorías permitidas`
        });
      }
      
      // Validar y sanitizar categorías
      const categories = [];
      for (let j = 0; j < dept.categories.length; j++) {
        const cat = dept.categories[j];
        if (!cat || typeof cat !== 'object') {
          logger.warn(`🚨 Categoría ${j} en departamento ${i} inválida desde IP: ${req.ip}`);
          continue; // Skip categoría inválida
        }
        
        const catId = typeof cat.id === 'string' ? cat.id.slice(0, 50).replace(/[<>\"']/g, '') : null;
        const catName = typeof cat.name === 'string' ? cat.name.slice(0, 200).replace(/[<>\"']/g, '') : null;
        
        if (catId && catName) {
          categories.push({ id: catId, name: catName });
        }
      }
      
      departments.push({
        id,
        name,
        categories
      });
    }
    
    logger.info(`💾 Guardando ${departments.length} departamentos para usuario: ${userId}`);
    
    // Guardar en Supabase
    const configKey = `departments_${userId}`;
    await databaseService.updateConfig(configKey, departments);
    
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
 * Obtener departamento seleccionado del usuario
 */
async function getSelectedDepartment(req, res) {
  try {
    const userId = req.auth.userId;
    
    logger.info(`🔍 Obteniendo departamento seleccionado para usuario: ${userId}`);
    
    const configKey = `selected_department_${userId}`;
    const selectedDepartment = await databaseService.getConfig(configKey) || 'all';
    
    logger.info(`🔍 Departamento seleccionado: ${selectedDepartment}`);
    
    res.json({
      success: true,
      selectedDepartment,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error(`❌ Error obteniendo departamento seleccionado: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Error obteniendo departamento seleccionado',
      message: error.message
    });
  }
}

/**
 * Guardar departamento seleccionado del usuario
 */
async function saveSelectedDepartment(req, res) {
  try {
    const userId = req.auth.userId;
    const { selectedDepartment } = req.body;
    
    if (typeof selectedDepartment !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'selectedDepartment debe ser un string'
      });
    }
    
    logger.info(`💾 Guardando departamento seleccionado para usuario ${userId}: ${selectedDepartment}`);
    
    const configKey = `selected_department_${userId}`;
    await databaseService.updateConfig(configKey, selectedDepartment);
    
    res.json({
      success: true,
      message: 'Departamento seleccionado guardado',
      selectedDepartment,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error(`❌ Error guardando departamento seleccionado: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Error guardando departamento seleccionado',
      message: error.message
    });
  }
}

/**
 * Manejador principal de rutas
 */
async function handleDepartments(req, res) {
  const { method, url } = req;
  const path = url.split('?')[0];
  
  // GET /api/departments/selected - obtener departamento seleccionado
  if (method === 'GET' && path.endsWith('/selected')) {
    return await getSelectedDepartment(req, res);
  }
  
  // POST /api/departments/selected - guardar departamento seleccionado
  if (method === 'POST' && path.endsWith('/selected')) {
    return await saveSelectedDepartment(req, res);
  }
  
  // Rutas principales
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