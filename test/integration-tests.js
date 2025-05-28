/**
 * Tests de integración para la aplicación
 * Prueba el funcionamiento completo de la aplicación con mocks
 */

const request = require('supertest');
const path = require('path');

// Configurar variables de entorno para testing
process.env.NODE_ENV = 'development';
process.env.MOCK_ML_API = 'true';
process.env.PORT = '3001';
process.env.LOG_LEVEL = 'error'; // Silenciar logs durante tests

// Importar la aplicación después de configurar el entorno
const app = require('../src/index');

describe('Aplicación Monitor de Stock', () => {
  
  describe('Endpoints básicos', () => {
    test('GET / debería devolver página de login cuando no está autenticado', async () => {
      const response = await request(app)
        .get('/')
        .expect(200);
      
      expect(response.text).toContain('login');
    });

    test('GET /health debería devolver estado OK', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);
      
      expect(response.body.status).toBe('OK');
      expect(response.body.authenticated).toBe(false);
    });

    test('GET /api/app-info debería devolver información de la aplicación', async () => {
      const response = await request(app)
        .get('/api/app-info')
        .expect(200);
      
      expect(response.body.name).toBe('Mercado Libre Stock Monitor');
      expect(response.body.vercel).toBe(true);
      expect(response.body.plan).toBe('free');
    });
  });

  describe('API de autenticación', () => {
    test('GET /api/auth/status debería devolver estado de autenticación', async () => {
      const response = await request(app)
        .get('/api/auth/status')
        .expect(200);
      
      expect(response.body).toHaveProperty('authenticated');
      expect(response.body).toHaveProperty('monitoring');
    });

    test('GET /auth/login debería redirigir a Mercado Libre', async () => {
      const response = await request(app)
        .get('/auth/login')
        .expect(302);
      
      expect(response.headers.location).toContain('authorization');
    });
  });

  describe('API de monitoreo (sin autenticación)', () => {
    test('POST /api/monitor/start debería fallar si no está autenticado', async () => {
      const response = await request(app)
        .post('/api/monitor/start')
        .expect(401);
      
      expect(response.body.error).toBe('No autenticado');
    });

    test('POST /api/monitor/stop debería fallar si no está autenticado', async () => {
      const response = await request(app)
        .post('/api/monitor/stop')
        .expect(401);
      
      expect(response.body.error).toBe('No autenticado');
    });

    test('POST /api/monitor/check-now debería fallar si no está autenticado', async () => {
      const response = await request(app)
        .post('/api/monitor/check-now')
        .expect(401);
      
      expect(response.body.error).toBe('No autenticado');
    });
  });

  describe('Callback de autenticación', () => {
    test('GET /auth/callback sin código debería devolver error', async () => {
      const response = await request(app)
        .get('/auth/callback')
        .expect(400);
      
      expect(response.text).toContain('No se recibió el código de autorización');
    });

    test('GET /auth/callback con código inválido debería manejar el error', async () => {
      const response = await request(app)
        .get('/auth/callback?code=invalid')
        .expect(500);
      
      expect(response.text).toContain('Error durante la autenticación');
    });

    test('GET /auth/callback con código válido debería autenticar correctamente', async () => {
      const response = await request(app)
        .get('/auth/callback?code=valid-test-code')
        .expect(302);
      
      expect(response.headers.location).toBe('/');
    }, 10000); // Timeout más largo para operaciones de autenticación
  });
});

describe('Tests con autenticación simulada', () => {
  let mockAuth;
  
  beforeAll(() => {
    // Simular autenticación para los siguientes tests
    mockAuth = require('../src/api/auth');
    // En un entorno real, esto se haría mediante el callback de OAuth
    // Aquí lo simulamos directamente
  });

  describe('API Mock de Mercado Libre', () => {
    test('Mock API debería devolver productos de prueba', async () => {
      const mockAPI = require('../src/api/mockMercadoLibre');
      
      // Simular autenticación
      await mockAPI.getTokensFromCode('test-code');
      
      const user = await mockAPI.getUser();
      expect(user.id).toBe('123456789');
      
      const products = await mockAPI.getUserProducts(user.id);
      expect(products.results.length).toBeGreaterThan(0);
      
      // Test obtener producto específico
      const productDetails = await mockAPI.getProduct(products.results[0]);
      expect(productDetails).toHaveProperty('id');
      expect(productDetails).toHaveProperty('title');
      expect(productDetails).toHaveProperty('available_quantity');
    });

    test('Mock API debería simular actualización de stock', async () => {
      const mockAPI = require('../src/api/mockMercadoLibre');
      
      await mockAPI.getTokensFromCode('test-code');
      const products = await mockAPI.getUserProducts('123456789');
      const productId = products.results[0];
      
      const result = await mockAPI.updateProductStock(productId, 15);
      expect(result.available_quantity).toBe(15);
    });
  });

  describe('Sistema de cifrado', () => {
    test('Debería cifrar y descifrar correctamente', () => {
      const cryptoHelper = require('../src/utils/cryptoHelper');
      
      const originalText = 'test-string-for-encryption';
      const encrypted = cryptoHelper.encrypt(originalText);
      const decrypted = cryptoHelper.decrypt(encrypted);
      
      expect(decrypted).toBe(originalText);
      expect(encrypted).not.toBe(originalText);
      expect(cryptoHelper.isEncrypted(encrypted)).toBe(true);
      expect(cryptoHelper.isEncrypted(originalText)).toBe(false);
    });
  });

  describe('Modelo de Producto', () => {
    test('Debería crear producto desde datos de API', () => {
      const Product = require('../src/models/product');
      
      const apiData = {
        id: 'TEST123',
        title: 'Producto de prueba',
        available_quantity: 3,
        price: 100,
        currency_id: 'MXN',
        permalink: 'https://test.com'
      };
      
      const product = Product.fromApiData(apiData);
      
      expect(product.id).toBe('TEST123');
      expect(product.hasLowStock(5)).toBe(true);
      expect(product.hasLowStock(2)).toBe(false);
      expect(product.isOutOfStock()).toBe(false);
    });

    test('Debería manejar correctamente las alertas', () => {
      const Product = require('../src/models/product');
      
      const product = new Product({
        id: 'TEST123',
        title: 'Test',
        available_quantity: 2,
        price: 100,
        currency_id: 'MXN'
      });
      
      expect(product.shouldSendAlert(5)).toBe(true);
      
      product.markAlertSent();
      expect(product.shouldSendAlert(5, 0)).toBe(false); // Cooldown de 0 horas
      expect(product.lastAlertSent).not.toBe(null);
    });
  });

  describe('Sistema de notificaciones', () => {
    test('Debería enviar alerta a consola sin errores', async () => {
      const notifier = require('../src/utils/notifier');
      
      const mockProduct = {
        id: 'TEST123',
        title: 'Producto de prueba',
        available_quantity: 2,
        price: 100,
        currency_id: 'MXN',
        permalink: 'https://test.com'
      };
      
      // Esto no debería lanzar errores
      await expect(notifier.sendLowStockAlert(mockProduct)).resolves.not.toThrow();
    });
  });
});

// Cleanup después de los tests
afterAll(async () => {
  // Dar tiempo para que se completen las operaciones asíncronas
  await new Promise(resolve => setTimeout(resolve, 1000));
});