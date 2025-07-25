/**
 * Middleware de validación de entrada para APIs
 * Previene inyecciones y valida tipos de datos
 */

const logger = require('../utils/logger');

/**
 * Esquemas de validación para diferentes endpoints
 */
const validationSchemas = {
  // Validación para IDs
  id: {
    type: 'string',
    pattern: /^[a-zA-Z0-9_-]{1,50}$/,
    required: true
  },
  
  // Validación para user IDs (números como string)
  userId: {
    type: 'string',
    pattern: /^\d{1,20}$/,
    required: true
  },
  
  // Validación para paginación
  pagination: {
    page: {
      type: 'number',
      min: 1,
      max: 1000,
      default: 1
    },
    limit: {
      type: 'number',
      min: 1,
      max: 100,
      default: 20
    },
    offset: {
      type: 'number',
      min: 0,
      max: 10000,
      default: 0
    }
  },
  
  // Validación para filtros
  filters: {
    status: {
      type: 'string',
      enum: ['active', 'inactive', 'paused', 'all'],
      default: 'all'
    },
    priority: {
      type: 'string',
      enum: ['low', 'medium', 'high', 'all'],
      default: 'all'
    }
  },
  
  // Validación para arrays de IDs
  arrayIds: {
    type: 'array',
    maxLength: 500,
    items: {
      type: 'string',
      pattern: /^[a-zA-Z0-9_-]{1,50}$/
    }
  }
};

/**
 * Sanitiza una cadena removiendo caracteres peligrosos
 */
function sanitizeString(str) {
  if (typeof str !== 'string') return str;
  
  return str
    .replace(/[<>\"']/g, '') // Remover caracteres HTML peligrosos
    .replace(/[\x00-\x1f\x7f-\x9f]/g, '') // Remover caracteres de control
    .trim()
    .substring(0, 1000); // Limitar longitud
}

/**
 * Valida un valor contra un esquema específico
 */
function validateValue(value, schema, fieldName) {
  // Validar requerido
  if (schema.required && (value === undefined || value === null || value === '')) {
    throw new Error(`Campo '${fieldName}' es requerido`);
  }
  
  // Si es opcional y no está presente, usar valor por defecto
  if (value === undefined || value === null) {
    return schema.default !== undefined ? schema.default : value;
  }
  
  // Validar tipo
  if (schema.type) {
    switch (schema.type) {
      case 'string':
        if (typeof value !== 'string') {
          value = String(value);
        }
        value = sanitizeString(value);
        
        // Validar patrón
        if (schema.pattern && !schema.pattern.test(value)) {
          throw new Error(`Campo '${fieldName}' tiene formato inválido`);
        }
        
        // Validar enum
        if (schema.enum && !schema.enum.includes(value)) {
          throw new Error(`Campo '${fieldName}' debe ser uno de: ${schema.enum.join(', ')}`);
        }
        
        // Validar longitud
        if (schema.minLength && value.length < schema.minLength) {
          throw new Error(`Campo '${fieldName}' debe tener al menos ${schema.minLength} caracteres`);
        }
        if (schema.maxLength && value.length > schema.maxLength) {
          throw new Error(`Campo '${fieldName}' debe tener máximo ${schema.maxLength} caracteres`);
        }
        break;
        
      case 'number':
        const num = Number(value);
        if (isNaN(num)) {
          throw new Error(`Campo '${fieldName}' debe ser un número válido`);
        }
        value = num;
        
        // Validar rango
        if (schema.min !== undefined && value < schema.min) {
          throw new Error(`Campo '${fieldName}' debe ser mayor o igual a ${schema.min}`);
        }
        if (schema.max !== undefined && value > schema.max) {
          throw new Error(`Campo '${fieldName}' debe ser menor o igual a ${schema.max}`);
        }
        break;
        
      case 'array':
        if (!Array.isArray(value)) {
          throw new Error(`Campo '${fieldName}' debe ser un array`);
        }
        
        // Validar longitud del array
        if (schema.maxLength && value.length > schema.maxLength) {
          throw new Error(`Campo '${fieldName}' puede tener máximo ${schema.maxLength} elementos`);
        }
        
        // Validar elementos del array
        if (schema.items) {
          value = value.map((item, index) => {
            try {
              return validateValue(item, schema.items, `${fieldName}[${index}]`);
            } catch (error) {
              throw new Error(`${error.message}`);
            }
          });
        }
        break;
        
      case 'boolean':
        if (typeof value === 'string') {
          value = value.toLowerCase() === 'true';
        } else {
          value = Boolean(value);
        }
        break;
    }
  }
  
  return value;
}

/**
 * Middleware para validar parámetros de query
 */
function validateQuery(schema) {
  return (req, res, next) => {
    try {
      const validated = {};
      
      for (const [field, fieldSchema] of Object.entries(schema)) {
        validated[field] = validateValue(req.query[field], fieldSchema, field);
      }
      
      // Reemplazar query original con datos validados
      req.query = { ...req.query, ...validated };
      next();
    } catch (error) {
      logger.warn(`Validación query falló: ${error.message}`, {
        path: req.path,
        query: req.query
      });
      
      return res.status(400).json({
        error: 'Validación de parámetros falló',
        message: error.message,
        field: error.field || 'unknown'
      });
    }
  };
}

/**
 * Middleware para validar body de requests
 */
function validateBody(schema) {
  return (req, res, next) => {
    try {
      const validated = {};
      
      for (const [field, fieldSchema] of Object.entries(schema)) {
        validated[field] = validateValue(req.body[field], fieldSchema, field);
      }
      
      // Reemplazar body original con datos validados
      req.body = { ...req.body, ...validated };
      next();
    } catch (error) {
      logger.warn(`Validación body falló: ${error.message}`, {
        path: req.path,
        bodyKeys: Object.keys(req.body || {})
      });
      
      return res.status(400).json({
        error: 'Validación de datos falló',
        message: error.message,
        field: error.field || 'unknown'
      });
    }
  };
}

/**
 * Middleware para validar parámetros de ruta
 */
function validateParams(schema) {
  return (req, res, next) => {
    try {
      const validated = {};
      
      for (const [field, fieldSchema] of Object.entries(schema)) {
        validated[field] = validateValue(req.params[field], fieldSchema, field);
      }
      
      // Reemplazar params original con datos validados
      req.params = { ...req.params, ...validated };
      next();
    } catch (error) {
      logger.warn(`Validación params falló: ${error.message}`, {
        path: req.path,
        params: req.params
      });
      
      return res.status(400).json({
        error: 'Validación de parámetros falló',
        message: error.message,
        field: error.field || 'unknown'
      });
    }
  };
}

/**
 * Middleware para validación combinada (query + body + params)
 */
function validate(config) {
  return (req, res, next) => {
    try {
      // Validar query si está configurado
      if (config.query) {
        const validated = {};
        for (const [field, fieldSchema] of Object.entries(config.query)) {
          validated[field] = validateValue(req.query[field], fieldSchema, field);
        }
        req.query = { ...req.query, ...validated };
      }
      
      // Validar body si está configurado
      if (config.body) {
        const validated = {};
        for (const [field, fieldSchema] of Object.entries(config.body)) {
          validated[field] = validateValue(req.body[field], fieldSchema, field);
        }
        req.body = { ...req.body, ...validated };
      }
      
      // Validar params si está configurado
      if (config.params) {
        const validated = {};
        for (const [field, fieldSchema] of Object.entries(config.params)) {
          validated[field] = validateValue(req.params[field], fieldSchema, field);
        }
        req.params = { ...req.params, ...validated };
      }
      
      next();
    } catch (error) {
      logger.warn(`Validación falló: ${error.message}`, {
        path: req.path,
        method: req.method
      });
      
      return res.status(400).json({
        error: 'Validación de datos falló',
        message: error.message
      });
    }
  };
}

/**
 * Esquemas predefinidos comunes
 */
const commonValidations = {
  // Para endpoints de paginación
  pagination: validateQuery(validationSchemas.pagination),
  
  // Para endpoints con filtros
  filters: validateQuery(validationSchemas.filters),
  
  // Para endpoints que requieren ID de usuario
  requireUserId: validateParams({ userId: validationSchemas.userId }),
  
  // Para endpoints que requieren ID genérico
  requireId: validateParams({ id: validationSchemas.id }),
  
  // Para endpoints que reciben arrays de IDs
  arrayIds: validateBody({ ids: validationSchemas.arrayIds })
};

module.exports = {
  validate,
  validateQuery,
  validateBody,
  validateParams,
  validateValue,
  sanitizeString,
  validationSchemas,
  commonValidations
};