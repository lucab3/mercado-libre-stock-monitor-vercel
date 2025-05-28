#!/usr/bin/env node

/**
 * Script para probar la aplicación localmente
 * Valida que todas las importaciones, configuraciones y funcionalidades básicas funcionen
 */

const path = require('path');
const fs = require('fs');

// Configurar variables de entorno antes de importar cualquier módulo
process.env.NODE_ENV = 'development';
process.env.MOCK_ML_API = 'true';
process.env.PORT = '3000';
process.env.LOG_LEVEL = 'error'; // Silenciar logs durante tests
process.env.NOTIFICATION_METHOD = 'console';
process.env.STOCK_THRESHOLD = '5';
process.env.STOCK_CHECK_INTERVAL = '60000';

// Colores para output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

function log(message, color = 'reset') {
  console.log(colors[color] + message + colors.reset);
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'blue');
}

async function runTests() {
  log('\n🧪 Iniciando pruebas locales de la aplicación\n', 'blue');
  
  let allTestsPassed = true;
  
  try {
    // Test 1: Verificar estructura de archivos
    logInfo('Test 1: Verificando estructura de archivos...');
    await testFileStructure();
    logSuccess('Estructura de archivos correcta');
    
    // Test 2: Verificar dependencias básicas
    logInfo('Test 2: Verificando dependencias básicas...');
    await testBasicDependencies();
    logSuccess('Dependencias básicas disponibles');
    
    // Test 3: Verificar configuración
    logInfo('Test 3: Verificando configuración...');
    await testConfiguration();
    logSuccess('Configuración cargada correctamente');
    
    // Test 4: Verificar sistema de cifrado
    logInfo('Test 4: Verificando sistema de cifrado...');
    await testCrypto();
    logSuccess('Sistema de cifrado funcionando');
    
    // Test 5: Verificar logger
    logInfo('Test 5: Verificando sistema de logging...');
    await testLogger();
    logSuccess('Sistema de logging funcionando');
    
    // Test 6: Verificar módulos principales
    logInfo('Test 6: Verificando módulos principales...');
    await testMainModules();
    logSuccess('Módulos principales funcionando');
    
    // Test 7: Verificar API Mock
    logInfo('Test 7: Verificando API Mock...');
    await testMockAPI();
    logSuccess('API Mock funcionando correctamente');
    
    // Test 8: Verificar sistema de notificaciones
    logInfo('Test 8: Verificando sistema de notificaciones...');
    await testNotifications();
    logSuccess('Sistema de notificaciones funcionando');
    
    // Test 9: Verificar monitor de stock
    logInfo('Test 9: Verificando monitor de stock...');
    await testStockMonitor();
    logSuccess('Monitor de stock funcionando');
    
  } catch (error) {
    logError(`Test falló: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
    allTestsPassed = false;
  }
  
  // Resumen final
  console.log('\n' + '='.repeat(50));
  if (allTestsPassed) {
    logSuccess('🎉 ¡Todos los tests pasaron! La aplicación está lista para usar.');
    logInfo('Para iniciar en modo desarrollo: npm run dev');
    logInfo('Para iniciar en modo producción: npm start');
  } else {
    logError('❌ Algunos tests fallaron. Revisa los errores anteriores.');
  }
  console.log('='.repeat(50) + '\n');
  
  return allTestsPassed;
}

async function testFileStructure() {
  const requiredFiles = [
    'package.json',
    'src/index.js',
    'src/api/auth.js',
    'src/api/products.js',
    'src/models/product.js',
    'src/services/stockMonitor.js',
    'src/utils/logger.js',
    'src/utils/notifier.js',
    'src/utils/cryptoHelper.js',
    'config/config.js'
  ];
  
  for (const file of requiredFiles) {
    if (!fs.existsSync(file)) {
      throw new Error(`Archivo requerido no encontrado: ${file}`);
    }
  }
}

async function testBasicDependencies() {
  const requiredDeps = ['express', 'axios', 'dotenv', 'winston', 'node-cron', 'nodemailer'];
  
  for (const dep of requiredDeps) {
    try {
      require(dep);
    } catch (error) {
      throw new Error(`No se pudo cargar dependencia: ${dep} - ${error.message}`);
    }
  }
}

async function testConfiguration() {
  try {
    const config = require('../config/config');
    
    if (!config.app || !config.mercadolibre || !config.monitoring) {
      throw new Error('Configuración incompleta - faltan secciones principales');
    }
    
    // Verificar propiedades específicas
    if (typeof config.app.port !== 'number') {
      throw new Error('Puerto no configurado correctamente');
    }
    
    if (!config.app.logLevel) {
      throw new Error('Nivel de log no configurado');
    }
    
    logInfo(`Puerto configurado: ${config.app.port}`);
    logInfo(`Ambiente: ${config.app.environment}`);
    logInfo(`Nivel de log: ${config.app.logLevel}`);
    
  } catch (error) {
    throw new Error(`Error en configuración: ${error.message}`);
  }
}

async function testCrypto() {
  try {
    const cryptoHelper = require('../src/utils/cryptoHelper');
    
    const testString = 'test-encryption-string-12345';
    const encrypted = cryptoHelper.encrypt(testString);
    const decrypted = cryptoHelper.decrypt(encrypted);
    
    if (decrypted !== testString) {
      throw new Error('Sistema de cifrado/descifrado no funciona correctamente');
    }
    
    if (!cryptoHelper.isEncrypted(encrypted)) {
      throw new Error('Detección de cifrado no funciona correctamente');
    }
    
    if (cryptoHelper.isEncrypted(testString)) {
      throw new Error('Falso positivo en detección de cifrado');
    }
    
    logInfo('Cifrado/descifrado funcionando correctamente');
    
  } catch (error) {
    throw new Error(`Error en sistema de cifrado: ${error.message}`);
  }
}

async function testLogger() {
  try {
    const logger = require('../src/utils/logger');
    
    // Test básico del logger
    logger.info('Test de logger funcionando');
    logger.debug('Test de debug');
    logger.warn('Test de warning');
    
    if (typeof logger.info !== 'function' || typeof logger.error !== 'function') {
      throw new Error('Logger no tiene métodos requeridos');
    }
    
  } catch (error) {
    throw new Error(`Error en sistema de logging: ${error.message}`);
  }
}

async function testMainModules() {
  try {
    // Test de importación de módulos principales
    const auth = require('../src/api/auth');
    const products = require('../src/api/products');
    const stockMonitor = require('../src/services/stockMonitor');
    const notifier = require('../src/utils/notifier');
    
    // Verificar que los módulos tienen los métodos esperados
    if (typeof auth.getAuthUrl !== 'function') {
      throw new Error('Módulo auth no tiene método getAuthUrl');
    }
    
    if (typeof stockMonitor.start !== 'function') {
      throw new Error('Módulo stockMonitor no tiene método start');
    }
    
    if (typeof notifier.sendLowStockAlert !== 'function') {
      throw new Error('Módulo notifier no tiene método sendLowStockAlert');
    }
    
    // Test URL de autorización
    const authUrl = auth.getAuthUrl();
    if (!authUrl.includes('authorization')) {
      throw new Error('URL de autorización no es válida');
    }
    
  } catch (error) {
    throw new Error(`Error en módulos principales: ${error.message}`);
  }
}

async function testMockAPI() {
  try {
    const mockAPI = require('../src/api/mock-ml-api');
    
    // Test de autenticación mock
    const tokens = await mockAPI.getTokensFromCode('test-code');
    if (!tokens.access_token) {
      throw new Error('Mock API no devolvió tokens válidos');
    }
    
    // Test de obtener usuario
    const user = await mockAPI.getUser();
    if (!user.id) {
      throw new Error('Mock API no devolvió usuario válido');
    }
    
    // Test de obtener productos
    const products = await mockAPI.getUserProducts(user.id);
    if (!products.results || products.results.length === 0) {
      throw new Error('Mock API no devolvió productos');
    }
    
    // Test de obtener producto específico
    const product = await mockAPI.getProduct(products.results[0]);
    if (!product.id || !product.title) {
      throw new Error('Mock API no devolvió detalles de producto válidos');
    }
    
    logInfo(`Mock API funcionando con ${products.results.length} productos de prueba`);
    
  } catch (error) {
    throw new Error(`Error en Mock API: ${error.message}`);
  }
}

async function testNotifications() {
  try {
    const notifier = require('../src/utils/notifier');
    
    // Test de notificación con producto mock
    const mockProduct = {
      id: 'TEST123',
      title: 'Producto de prueba',
      available_quantity: 2,
      price: 100,
      currency_id: 'MXN',
      permalink: 'https://test.com'
    };
    
    // Esto debería funcionar sin errores (enviará a consola en modo test)
    await notifier.sendLowStockAlert(mockProduct);
    
    logInfo('Sistema de notificaciones funcionando');
    
  } catch (error) {
    throw new Error(`Error en sistema de notificaciones: ${error.message}`);
  }
}

async function testStockMonitor() {
  try {
    const stockMonitor = require('../src/services/stockMonitor');
    
    // Test de estado inicial
    const initialStatus = stockMonitor.getStatus();
    if (typeof initialStatus.active !== 'boolean') {
      throw new Error('Monitor de stock no devuelve estado válido');
    }
    
    logInfo(`Monitor de stock inicializado. Estado activo: ${initialStatus.active}`);
    
  } catch (error) {
    throw new Error(`Error en monitor de stock: ${error.message}`);
  }
}

// Ejecutar tests si el script se ejecuta directamente
if (require.main === module) {
  runTests()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      logError(`Error inesperado: ${error.message}`);
      process.exit(1);
    });
}

module.exports = { runTests };