/**
 * Script para probar los endpoints de webhooks
 * Ejecutar con: node scripts/test-webhooks.js
 */

// Cargar variables de entorno desde .env.local
require('dotenv').config({ path: '.env.local' });

// SEGURIDAD: Forzar modo mock para tests
process.env.MOCK_ML_API = 'true';
process.env.NODE_ENV = 'test';

const axios = require('axios');

// Configuración del servidor de prueba
const BASE_URL = 'http://localhost:3000';
const WEBHOOK_URL = `${BASE_URL}/api/webhooks/ml`;
const STATUS_URL = `${BASE_URL}/api/webhooks/status`;

// Datos de webhook de prueba según documentación ML
const sampleWebhooks = {
  stockLocation: {
    "_id": "test-webhook-stock-123",
    "topic": "stock-location", 
    "resource": "/user-products/MLA123456789/stock",
    "user_id": 123456789,
    "application_id": 213123389095511,
    "sent": "2025-07-02T16:40:13.632Z",
    "attempts": 1,
    "received": "2025-07-02T16:40:13.911Z"
  },
  
  items: {
    "_id": "test-webhook-items-456",
    "topic": "items",
    "resource": "/items/MLA123456789", 
    "user_id": 123456789,
    "application_id": 213123389095511,
    "sent": "2025-07-02T16:40:13.632Z",
    "attempts": 1,
    "received": "2025-07-02T16:40:13.911Z"
  },
  
  invalid: {
    "_id": "test-webhook-invalid-789",
    "topic": "unsupported-topic",
    // Missing required fields for testing validation
    "user_id": 123456789,
    "application_id": 213123389095511
  }
};

async function testWebhookEndpoint() {
  console.log('🧪 INICIANDO PRUEBAS DE WEBHOOKS');
  console.log('=' * 50);

  try {
    // 1. Test webhook válido de stock-location
    console.log('\n1. 🔔 Probando webhook de stock-location...');
    const stockResponse = await axios.post(WEBHOOK_URL, sampleWebhooks.stockLocation, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'MercadoLibre-Webhook-Test'
      }
    });
    
    console.log('   Respuesta:', stockResponse.status, stockResponse.statusText);
    console.log('   Tiempo:', stockResponse.data.processingTime + 'ms');
    console.log('   Webhook ID:', stockResponse.data.webhook_id);
    
    // 2. Test webhook válido de items
    console.log('\n2. 📦 Probando webhook de items...');
    const itemsResponse = await axios.post(WEBHOOK_URL, sampleWebhooks.items, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'MercadoLibre-Webhook-Test'
      }
    });
    
    console.log('   Respuesta:', itemsResponse.status, itemsResponse.statusText);
    console.log('   Tiempo:', itemsResponse.data.processingTime + 'ms');
    console.log('   Webhook ID:', itemsResponse.data.webhook_id);
    
    // 3. Test webhook inválido
    console.log('\n3. ❌ Probando webhook inválido...');
    try {
      const invalidResponse = await axios.post(WEBHOOK_URL, sampleWebhooks.invalid, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'MercadoLibre-Webhook-Test'
        }
      });
      console.log('   Respuesta:', invalidResponse.status, invalidResponse.data);
    } catch (error) {
      console.log('   Error esperado:', error.response.status, error.response.data.error);
    }
    
    // 4. Test webhook vacío
    console.log('\n4. 📭 Probando webhook vacío...');
    try {
      const emptyResponse = await axios.post(WEBHOOK_URL, {}, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'MercadoLibre-Webhook-Test'
        }
      });
      console.log('   Respuesta:', emptyResponse.status, emptyResponse.data);
    } catch (error) {
      console.log('   Error esperado:', error.response.status, error.response.data.error);
    }
    
    // 5. Test endpoint de status
    console.log('\n5. 📊 Probando endpoint de status...');
    const statusResponse = await axios.get(STATUS_URL);
    console.log('   Status:', statusResponse.status);
    console.log('   Config:', statusResponse.data.config);
    console.log('   Stats:', statusResponse.data.stats);
    
    console.log('\n✅ TODAS LAS PRUEBAS DE WEBHOOKS COMPLETADAS');
    console.log('🎉 Sistema de webhooks funcionando correctamente');
    
  } catch (error) {
    console.error('\n❌ ERROR EN PRUEBAS DE WEBHOOKS:');
    console.error('   Mensaje:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('\n🔧 SOLUCIÓN:');
      console.log('   1. Asegúrate de que el servidor esté ejecutándose:');
      console.log('      npm run dev');
      console.log('   2. Verifica que esté en puerto 3000');
      console.log('   3. Prueba este script nuevamente');
    }
    
    throw error;
  }
}

async function testWebhookValidation() {
  console.log('\n🧪 PROBANDO VALIDACIONES DE WEBHOOKS...\n');
  
  const webhookProcessor = require('../src/services/webhookProcessor');
  
  // Test 1: Webhook válido
  console.log('1. ✅ Validando webhook válido...');
  const validResult = webhookProcessor.validateWebhookOrigin('127.0.0.1', {
    'content-type': 'application/json'
  });
  console.log('   Resultado:', validResult);
  
  // Test 2: Content-Type inválido
  console.log('\n2. ❌ Validando Content-Type inválido...');
  const invalidContentType = webhookProcessor.validateWebhookOrigin('127.0.0.1', {
    'content-type': 'text/plain'
  });
  console.log('   Resultado:', invalidContentType);
  
  // Test 3: Validación de datos
  console.log('\n3. 📋 Validando datos de webhook...');
  const dataValidation = webhookProcessor.validateWebhookData(sampleWebhooks.stockLocation);
  console.log('   Resultado:', dataValidation);
  
  console.log('\n✅ VALIDACIONES COMPLETADAS');
}

async function runAllTests() {
  try {
    await testWebhookValidation();
    
    console.log('\n' + '=' * 50);
    console.log('⚠️  PARA PRUEBAS DE ENDPOINTS:');
    console.log('   Inicia el servidor con: npm run dev');
    console.log('   Luego ejecuta: node scripts/test-webhooks.js endpoint');
    console.log('=' * 50);
    
    // Si se pasa 'endpoint' como argumento, probar endpoints
    if (process.argv.includes('endpoint')) {
      await testWebhookEndpoint();
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

module.exports = { testWebhookEndpoint, testWebhookValidation };