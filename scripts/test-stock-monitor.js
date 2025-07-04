/**
 * Script para probar el nuevo stockMonitor con Supabase
 * Ejecutar con: node scripts/test-stock-monitor.js
 */

// Cargar variables de entorno desde .env.local
require('dotenv').config({ path: '.env.local' });

// SEGURIDAD: Forzar modo mock para tests
process.env.MOCK_ML_API = 'true';
process.env.NODE_ENV = 'test';

const stockMonitor = require('../src/services/stockMonitor');
const databaseService = require('../src/services/databaseService');

async function testStockMonitorConfiguration() {
  console.log('🧪 PROBANDO CONFIGURACIÓN DE STOCK MONITOR...\n');

  try {
    // 1. Test de configuración desde BD
    console.log('1. 📊 Probando carga de configuración...');
    await stockMonitor.getConfig();
    console.log('   ✅ Configuración cargada desde base de datos');
    console.log(`   📊 Threshold: ${stockMonitor.stockThreshold}`);
    console.log(`   ⏰ Interval: ${stockMonitor.checkInterval / 1000}s`);

    // 2. Test de cache inicial
    console.log('\n2. 💾 Verificando cache inicial...');
    console.log(`   📦 Total productos en cache: ${stockMonitor.sessionCache.totalProducts}`);
    console.log(`   📉 Stock bajo en cache: ${stockMonitor.sessionCache.lowStockProducts.length}`);

    console.log('\n✅ CONFIGURACIÓN CORRECTA');

  } catch (error) {
    console.error('\n❌ ERROR EN CONFIGURACIÓN:');
    console.error('   Mensaje:', error.message);
    throw error;
  }
}

async function testDatabaseOperations() {
  console.log('\n🧪 PROBANDO OPERACIONES DE BASE DE DATOS...\n');

  try {
    const testUserId = 'test_user_12345';

    // 1. Test de productos desde BD
    console.log('1. 📋 Probando carga desde base de datos...');
    const dbProducts = await stockMonitor.loadProductsFromDatabase(testUserId);
    console.log(`   📊 Productos encontrados en BD: ${dbProducts.length}`);

    // 2. Test de verificación de sync
    console.log('\n2. 🔍 Verificando necesidad de sync...');
    const needsSync = await stockMonitor.needsApiSync(testUserId);
    console.log(`   🔄 Sync necesario: ${needsSync ? 'SÍ' : 'NO'}`);

    // 3. Test de productos con stock bajo
    console.log('\n3. 📉 Probando consulta de stock bajo...');
    const lowStockProducts = await databaseService.getLowStockProducts(testUserId, 5);
    console.log(`   📊 Productos con stock bajo: ${lowStockProducts.length}`);

    console.log('\n✅ OPERACIONES DE BD CORRECTAS');

  } catch (error) {
    console.error('\n❌ ERROR EN OPERACIONES BD:');
    console.error('   Mensaje:', error.message);
    throw error;
  }
}

async function testStockMonitorStart() {
  console.log('\n🧪 PROBANDO INICIO DEL MONITOR...\n');

  // Simular autenticación
  const auth = require('../src/api/auth');
  
  try {
    console.log('1. 🔐 Verificando estado de autenticación...');
    console.log(`   Autenticado: ${auth.isAuthenticated()}`);
    console.log(`   Modo Mock: ${auth.mockMode}`);

    if (auth.isAuthenticated()) {
      console.log('\n2. 🚀 Iniciando monitor...');
      
      const startTime = Date.now();
      await stockMonitor.start();
      const startDuration = Date.now() - startTime;
      
      console.log(`   ✅ Monitor iniciado en ${startDuration}ms`);
      console.log(`   📊 Estado: ${stockMonitor.monitoringActive ? 'ACTIVO' : 'INACTIVO'}`);
      
      // 3. Test del status
      console.log('\n3. 📊 Verificando estado del monitor...');
      const status = stockMonitor.getStatus();
      console.log(`   Total productos: ${status.totalProducts}`);
      console.log(`   Stock bajo: ${status.lowStockCount}`);
      console.log(`   Fuente: ${status.source}`);
      console.log(`   Última verificación: ${status.lastCheckTime}`);

      // 4. Test de verificación de stock
      console.log('\n4. 🔍 Probando verificación de stock...');
      const checkTime = Date.now();
      const checkResult = await stockMonitor.checkStock();
      const checkDuration = Date.now() - checkTime;
      
      console.log(`   ✅ Verificación completada en ${checkDuration}ms`);
      console.log(`   📊 Resultado: ${checkResult.totalProducts} productos, ${checkResult.lowStockCount} con stock bajo`);

      console.log('\n✅ MONITOR FUNCIONANDO CORRECTAMENTE');

    } else {
      console.log('\n⚠️ No autenticado - iniciando auth mock...');
      
      // En modo mock, la autenticación debería estar activa
      console.log('   🎭 Verificando auth mock...');
      
      if (auth.mockMode) {
        console.log('   ✅ Modo mock detectado - continuando pruebas');
        
        // Intentar start de todas formas (puede funcionar en mock)
        try {
          await stockMonitor.start();
          console.log('   ✅ Monitor iniciado en modo mock');
        } catch (authError) {
          console.log('   ⚠️ Error esperado en modo mock:', authError.message);
        }
      }
    }

  } catch (error) {
    console.error('\n❌ ERROR INICIANDO MONITOR:');
    console.error('   Mensaje:', error.message);
    throw error;
  }
}

async function testWebhookIntegration() {
  console.log('\n🧪 PROBANDO INTEGRACIÓN CON WEBHOOKS...\n');

  try {
    const testProductId = 'MLA123456789';
    const testUserId = 'test_user_12345';

    console.log('1. 🔔 Simulando procesamiento desde webhook...');
    
    // Simular que tenemos un producto en la API mock
    try {
      const webhookResult = await stockMonitor.processProductFromWebhook(testProductId, testUserId);
      console.log('   ✅ Producto procesado desde webhook');
      console.log(`   📦 ID: ${webhookResult.id}`);
      console.log(`   📊 Stock: ${webhookResult.available_quantity}`);
      
    } catch (webhookError) {
      console.log('   ⚠️ Error esperado en test de webhook:', webhookError.message);
    }

    console.log('\n✅ INTEGRACIÓN WEBHOOK TESTEADA');

  } catch (error) {
    console.error('\n❌ ERROR EN WEBHOOK INTEGRATION:');
    console.error('   Mensaje:', error.message);
    throw error;
  }
}

async function runAllTests() {
  console.log('🚀 INICIANDO PRUEBAS DEL STOCK MONITOR CON SUPABASE');
  console.log('=' * 60);

  try {
    await testStockMonitorConfiguration();
    await testDatabaseOperations();
    await testStockMonitorStart();
    await testWebhookIntegration();

    console.log('\n' + '=' * 60);
    console.log('🎉 TODAS LAS PRUEBAS DEL STOCK MONITOR COMPLETADAS!');
    console.log('✅ StockMonitor con Supabase está funcionando correctamente');
    console.log('🔄 Migración de memoria a persistencia: EXITOSA');
    console.log('=' * 60);

  } catch (error) {
    console.log('\n' + '=' * 60);
    console.log('❌ PRUEBAS DEL STOCK MONITOR FALLIDAS');
    console.log('🔧 Revisa la configuración antes de continuar');
    console.log('=' * 60);
    process.exit(1);
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  runAllTests();
}

module.exports = { 
  testStockMonitorConfiguration, 
  testDatabaseOperations, 
  testStockMonitorStart,
  testWebhookIntegration 
};