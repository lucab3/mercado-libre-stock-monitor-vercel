const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Configuración básica de logger sin dependencias circulares
const logLevel = process.env.LOG_LEVEL || 'info';
const environment = process.env.NODE_ENV || 'development';

// ARREGLO PARA VERCEL: Solo crear directorio de logs si no estamos en Vercel
const logsDir = path.join(__dirname, '../../logs');
if (!process.env.VERCEL && !fs.existsSync(logsDir)) {
  try {
    fs.mkdirSync(logsDir, { recursive: true });
  } catch (error) {
    console.warn('No se pudo crear directorio de logs:', error.message);
  }
}

const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'mercadolibre-stock-monitor' },
  transports: []
});

// ARREGLO PARA VERCEL: Solo agregar file transports si NO estamos en Vercel
if (!process.env.VERCEL) {
  try {
    logger.add(new winston.transports.File({ 
      filename: path.join(logsDir, 'error.log'), 
      level: 'error' 
    }));
    logger.add(new winston.transports.File({ 
      filename: path.join(logsDir, 'combined.log') 
    }));
  } catch (error) {
    console.warn('No se pudieron configurar logs de archivo:', error.message);
  }
}

// Siempre agregar console transport
logger.add(new winston.transports.Console({
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.simple()
  )
}));

module.exports = logger;
