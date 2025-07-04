/**
 * Script para probar la conexión con Supabase
 * Ejecutar con: node scripts/test-supabase.js
 */

// Cargar variables de entorno desde .env.local
require('dotenv').config({ path: '.env.local' });

// SEGURIDAD: Forzar modo mock para tests
process.env.MOCK_ML_API = 'true';
process.env.NODE_ENV = 'test';

const supabaseClient = require('../src/utils/supabaseClient');
const databaseService = require('../src/services/databaseService');

async function testSupabaseConnection() {
  console.log('🧪 Iniciando pruebas de conexión Supabase...\n');
  
  try {
    // 1. Test básico de health check
    console.log('1. 🔍 Probando health check...');
    const health = await supabaseClient.healthCheck();
    console.log('   Resultado:', health);
    
    if (health.status !== 'OK') {
      throw new Error('Health check falló');
    }
    
    // 2. Test de configuración
    console.log('\n2. ⚙️ Probando lectura de configuración...');
    const stockThreshold = await databaseService.getConfig('stock_threshold');
    console.log('   Stock threshold:', stockThreshold);
    
    // 3. Test de escritura
    console.log('\n3. 💾 Probando escritura de configuración...');
    await databaseService.updateConfig('test_connection', new Date().toISOString());
    console.log('   ✅ Escritura exitosa');
    
    // 4. Test de conteo de tablas
    console.log('\n4. 📊 Obteniendo estadísticas...');
    const stats = await supabaseClient.getUsageStats();
    console.log('   Estadísticas:', stats);
    
    // 5. Test de productos (debería estar vacío)
    console.log('\n5. 📋 Probando consulta de productos...');
    const products = await databaseService.getProducts('test_user');
    console.log('   Productos encontrados:', products.length);
    
    // 6. Test de productos con stock bajo
    console.log('\n6. 📉 Probando consulta de stock bajo...');
    const lowStock = await databaseService.getLowStockProducts('test_user');
    console.log('   Productos con stock bajo:', lowStock.length);
    
    console.log('\n✅ TODAS LAS PRUEBAS PASARON EXITOSAMENTE!');
    console.log('\n🎉 Supabase está correctamente configurado y funcionando');
    
    return true;
    
  } catch (error) {
    console.error('\n❌ ERROR EN LAS PRUEBAS:');
    console.error('   Mensaje:', error.message);
    console.error('   Stack:', error.stack);
    
    console.log('\n🔧 VERIFICACIONES SUGERIDAS:');
    console.log('   1. Variables de entorno en Vercel configuradas');
    console.log('   2. Base de datos Supabase accesible');
    console.log('   3. Tablas creadas correctamente');
    console.log('   4. Permisos de acceso correctos');
    
    return false;
  }
}

async function testDatabaseOperations() {
  console.log('\n🧪 Probando operaciones de base de datos...\n');
  
  try {
    // Test producto ficticio
    const testProduct = {
      id: 'MLA123456789',
      user_id: 'test_user',
      title: 'Producto de Prueba',
      seller_sku: 'TEST-SKU-001',
      available_quantity: 10,
      price: 99.99,
      status: 'active',
      permalink: 'https://articulo.mercadolibre.com.ar/MLA-123456789',
      category_id: 'MLA1000',
      condition: 'new',
      listing_type_id: 'gold_special'
    };
    
    console.log('📝 Insertando producto de prueba...');
    await databaseService.upsertProduct(testProduct);
    console.log('   ✅ Producto insertado');
    
    console.log('\n📋 Consultando producto insertado...');
    const products = await databaseService.getProducts('test_user');
    console.log('   Productos encontrados:', products.length);
    console.log('   Primer producto:', products[0]?.title);
    
    console.log('\n🔄 Actualizando stock del producto...');
    testProduct.available_quantity = 3; // Stock bajo
    await databaseService.upsertProduct(testProduct);
    console.log('   ✅ Stock actualizado');
    
    console.log('\n📉 Consultando productos con stock bajo...');
    const lowStock = await databaseService.getLowStockProducts('test_user', 5);
    console.log('   Productos con stock bajo:', lowStock.length);
    
    console.log('\n🧹 Limpiando producto de prueba...');
    const client = supabaseClient.getClient();
    await client.from('products').delete().eq('id', 'MLA123456789');
    console.log('   ✅ Producto de prueba eliminado');
    
    console.log('\n✅ OPERACIONES DE BASE DE DATOS EXITOSAS!');
    
  } catch (error) {
    console.error('\n❌ ERROR EN OPERACIONES:');
    console.error('   Mensaje:', error.message);
    throw error;
  }
}

// Ejecutar pruebas
async function runAllTests() {
  console.log('🚀 INICIANDO PRUEBAS COMPLETAS DE SUPABASE');
  console.log('=' * 50);
  
  try {
    const connectionOk = await testSupabaseConnection();
    
    if (connectionOk) {
      await testDatabaseOperations();
      
      console.log('\n' + '=' * 50);
      console.log('🎉 TODAS LAS PRUEBAS COMPLETADAS EXITOSAMENTE!');
      console.log('✅ Supabase está listo para usar en producción');
      console.log('=' * 50);
    }
    
  } catch (error) {
    console.log('\n' + '=' * 50);
    console.log('❌ PRUEBAS FALLIDAS');
    console.log('🔧 Revisa la configuración antes de continuar');
    console.log('=' * 50);
    process.exit(1);
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  runAllTests();
}

module.exports = { testSupabaseConnection, testDatabaseOperations };