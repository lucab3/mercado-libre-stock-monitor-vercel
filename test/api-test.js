const auth = require('../src/api/auth');
const products = require('../src/api/products');

// Mock de axios para tests
jest.mock('axios');
const axios = require('axios');

// Mock de fs para tests
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn()
}));
const fs = require('fs');

describe('MercadoLibre API - Auth Module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('debería generar URL de autorización correcta', () => {
    const authUrl = auth.getAuthUrl();
    expect(authUrl).toContain('/authorization');
    expect(authUrl).toContain('response_type=code');
    expect(authUrl).toContain('client_id=');
  });

  test('debería obtener tokens desde código de autorización', async () => {
    const mockResponse = {
      data: {
        access_token: 'test_access_token',
        refresh_token: 'test_refresh_token',
        expires_in: 21600
      }
    };
    
    axios.post.mockResolvedValue(mockResponse);
    
    const tokens = await auth.getTokensFromCode('test_code');
    
    expect(axios.post).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      grant_type: 'authorization_code',
      code: 'test_code'
    }));
    
    expect(tokens).toHaveProperty('access_token', 'test_access_token');
    expect(tokens).toHaveProperty('refresh_token', 'test_refresh_token');
    expect(tokens).toHaveProperty('expires_at');
    
    expect(fs.writeFileSync).toHaveBeenCalled();
  });

  test('debería refrescar el token correctamente', async () => {
    // Simular que ya tenemos un token
    auth.tokens = {
      refresh_token: 'old_refresh_token',
      access_token: 'old_access_token',
      expires_at: Date.now() - 1000 // Ya expirado
    };
    
    const mockResponse = {
      data: {
        access_token: 'new_access_token',
        refresh_token: 'new_refresh_token',
        expires_in: 21600
      }
    };
    
    axios.post.mockResolvedValue(mockResponse);
    
    const tokens = await auth.refreshAccessToken();
    
    expect(axios.post).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      grant_type: 'refresh_token',
      refresh_token: 'old_refresh_token'
    }));
    
    expect(tokens).toHaveProperty('access_token', 'new_access_token');
    expect(tokens).toHaveProperty('refresh_token', 'new_refresh_token');
    
    expect(fs.writeFileSync).toHaveBeenCalled();
  });
});

describe('MercadoLibre API - Products Module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock para getAccessToken
    auth.getAccessToken = jest.fn().mockResolvedValue('mock_access_token');
  });

  test('debería obtener ID del vendedor', async () => {
    const mockResponse = {
      data: {
        id: '123456789',
        nickname: 'TEST_USER'
      }
    };
    
    axios.get.mockResolvedValue(mockResponse);
    
    const sellerId = await products.getSellerId();
    
    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining('/users/me'),
      expect.objectContaining({
        headers: { 'Authorization': 'Bearer mock_access_token' }
      })
    );
    
    expect(sellerId).toBe('123456789');
  });

  test('debería obtener lista de productos', async () => {
    // Mock para getSellerId
    products.getSellerId = jest.fn().mockResolvedValue('123456789');
    
    const mockResponse = {
      data: {
        results: ['MLM123', 'MLM456'],
        paging: {
          total: 2,
          offset: 0,
          limit: 50
        }
      }
    };
    
    axios.get.mockResolvedValue(mockResponse);
    
    const productList = await products.getAllProducts();
    
    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining('/users/123456789/items/search'),
      expect.objectContaining({
        headers: { 'Authorization': 'Bearer mock_access_token' },
        params: { offset: 0, limit: 50 }
      })
    );
    
    expect(productList).toEqual(['MLM123', 'MLM456']);
  });

  test('debería obtener detalles de un producto', async () => {
    const mockProductData = {
      id: 'MLM123',
      title: 'Producto de prueba',
      available_quantity: 10,
      price: 299.99,
      currency_id: 'MXN',
      permalink: 'https://articulo.mercadolibre.com.mx/MLM123-producto-de-prueba'
    };
    
    const mockResponse = {
      data: mockProductData
    };
    
    axios.get.mockResolvedValue(mockResponse);
    
    const productDetails = await products.getProduct('MLM123');
    
    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining('/items/MLM123'),
      expect.objectContaining({
        headers: { 'Authorization': 'Bearer mock_access_token' }
      })
    );
    
    expect(productDetails).toEqual(mockProductData);
  });

  test('debería actualizar el stock de un producto', async () => {
    const mockResponse = {
      data: {
        id: 'MLM123',
        available_quantity: 20
      }
    };
    
    axios.put.mockResolvedValue(mockResponse);
    
    const result = await products.updateStock('MLM123', 20);
    
    expect(axios.put).toHaveBeenCalledWith(
      expect.stringContaining('/items/MLM123'),
      expect.objectContaining({
        available_quantity: 20
      }),
      expect.objectContaining({
        headers: { 'Authorization': 'Bearer mock_access_token' }
      })
    );
    
    expect(result).toEqual(mockResponse.data);
  });
});