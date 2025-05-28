const stockMonitor = require('../src/services/stockMonitor');
const products = require('../src/api/products');
const notifier = require('../src/utils/notifier');
const Product = require('../src/models/product');

// Mock de las dependencias
jest.mock('../src/api/products');
jest.mock('../src/utils/notifier');
jest.mock('node-cron', () => ({
  schedule: jest.fn(() => ({
    stop: jest.fn()
  }))
}));

describe('Stock Monitor Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset trackedProducts para cada test
    stockMonitor.trackedProducts = new Map();
  });

  test('debería iniciar el monitoreo correctamente', async () => {
    // Mock de getAllProducts
    const mockProductIds = ['MLM123', 'MLM456'];
    products.getAllProducts.mockResolvedValue(mockProductIds);
    
    // Mock de getProducts
    const mockProductDetails = [
      {
        id: 'MLM123',
        title: 'Producto 1',
        available_quantity: 10,
        price: 199.99,
        currency_id: 'MXN'
      },
      {
        id: 'MLM456',
        title: 'Producto 2',
        available_quantity: 3,
        price: 299.99,
        currency_id: 'MXN'
      }
    ];
    products.getProducts.mockResolvedValue(mockProductDetails);
    
    // Mock de notifier
    notifier.sendLowStockAlert.mockResolvedValue();
    
    await stockMonitor.start();
    
    expect(products.getAllProducts).toHaveBeenCalled();
    expect(products.getProducts).toHaveBeenCalledWith(mockProductIds);
    
    // Debe tener 2 productos en trackedProducts
    expect(stockMonitor.trackedProducts.size).toBe(2);
    
    // Debe haber enviado una alerta para el producto con stock bajo
    expect(notifier.sendLowStockAlert).toHaveBeenCalledTimes(1);
    
    // El producto con alerta debe ser el de ID MLM456
    const lowStockProduct = Array.from(stockMonitor.trackedProducts.values())
      .find(p => p.id === 'MLM456');
    
    expect(lowStockProduct.lastAlertSent).not.toBeNull();
  });

  test('debería detener el monitoreo correctamente', () => {
    // Simular que hay un cronJob activo
    stockMonitor.cronJob = {
      stop: jest.fn()
    };
    
    stockMonitor.stop();
    
    expect(stockMonitor.cronJob.stop).toHaveBeenCalled();
    expect(stockMonitor.cronJob).toBeNull();
  });

  test('debería verificar correctamente el stock de todos los productos', async () => {
    // Mock de refreshProductList
    stockMonitor.refreshProductList = jest.fn().mockImplementation(() => {
      stockMonitor.trackedProducts.set('MLM123', new Product({
        id: 'MLM123',
        title: 'Producto 1',
        available_quantity: 10,
        price: 199.99,
        currency_id: 'MXN'
      }));
      
      stockMonitor.trackedProducts.set('MLM456', new Product({
        id: 'MLM456',
        title: 'Producto 2',
        available_quantity: 3,
        price: 299.99,
        currency_id: 'MXN'
      }));
    });
    
    // Mock de notifier
    notifier.sendLowStockAlert.mockResolvedValue();
    
    await stockMonitor.checkStock();
    
    expect(stockMonitor.refreshProductList).toHaveBeenCalled();
    
    // Debe haber enviado una alerta para el producto con stock bajo
    expect(notifier.sendLowStockAlert).toHaveBeenCalledTimes(1);
    
    // Verificar que se envió la alerta para el producto correcto
    const product = notifier.sendLowStockAlert.mock.calls[0][0];
    expect(product.id).toBe('MLM456');
    expect(product.available_quantity).toBe(3);
  });

  test('debería verificar correctamente el stock de un producto específico', async () => {
    // Mock de getProduct
    const mockProductData = {
      id: 'MLM123',
      title: 'Producto 1',
      available_quantity: 4,  // Stock bajo
      price: 199.99,
      currency_id: 'MXN'
    };
    products.getProduct.mockResolvedValue(mockProductData);
    
    // Mock de notifier
    notifier.sendLowStockAlert.mockResolvedValue();
    
    const result = await stockMonitor.checkProductStock('MLM123');
    
    expect(products.getProduct).toHaveBeenCalledWith('MLM123');
    expect(notifier.sendLowStockAlert).toHaveBeenCalled();
    
    // Verificar que se devolvió el producto correcto
    expect(result.id).toBe('MLM123');
    expect(result.available_quantity).toBe(4);
    expect(result.lastAlertSent).not.toBeNull();
  });
});