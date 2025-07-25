import React, { useEffect, useState, useMemo } from 'react'
import { useAppContext } from '../../context/AppContext'
import { useCategories } from '../../hooks/useCategories'
import { useDepartmentFilter } from '../../hooks/useDepartmentFilter'
import { apiService } from '../../services/api'
import StatsCards from './StatsCards'
import RecentAlerts from './RecentAlerts'
import ProductsTable from './ProductsTable'
import MonitoringControls from './MonitoringControls'
import SyncProgress from './SyncProgress'
import DepartmentButtons from './DepartmentButtons'
import MultiCategorySelector from './MultiCategorySelector'

function DashboardHome() {
  const { products, alerts, stats, loading, actions } = useAppContext()
  const [monitorStatus, setMonitorStatus] = useState(null)
  const [syncProgress, setSyncProgress] = useState(null)
  const [currentPage, setCurrentPage] = useState(0)
  const [itemsPerPage] = useState(10)
  const [dashboardFilters, setDashboardFilters] = useState({
    stockLevel: 'all', // all, 5, 4, 3, 2, 1, 0
    categories: [], // Array de categorías seleccionadas (vacío = todas)
    sort: 'default', // default, stock-asc, stock-desc
    search: ''
  })
  
  // Considerar datos cargados si hay productos O alertas
  const dataLoaded = products.length > 0 || alerts.length > 0

  useEffect(() => {
    loadMonitorStatus()
  }, [])

  const loadMonitorStatus = async () => {
    try {
      const status = await apiService.getMonitorStatus()
      setMonitorStatus(status)
    } catch (error) {
      console.error('Error cargando estado del monitor:', error)
    }
  }

  const handleStartMonitoring = async () => {
    try {
      await apiService.startMonitoring()
      await loadMonitorStatus()
    } catch (error) {
      console.error('Error iniciando monitoreo:', error)
      actions.setError('monitoring', error.message)
    }
  }

  const handleStopMonitoring = async () => {
    try {
      await apiService.stopMonitoring()
      await loadMonitorStatus()
    } catch (error) {
      console.error('Error deteniendo monitoreo:', error)
      actions.setError('monitoring', error.message)
    }
  }

  const handleInitialSync = async () => {
    try {
      actions.setLoading('products', true)
      setSyncProgress(null)
      
      // Usar sync-next para sincronización incremental
      let hasMore = true
      let totalNewProducts = 0
      
      while (hasMore) {
        const result = await apiService.syncNext()
        
        if (result.success) {
          totalNewProducts += result.progress?.newInThisBatch || 0
          hasMore = result.hasMore
          
          // Actualizar progreso en tiempo real
          if (result.progress) {
            setSyncProgress(result.progress)
          }
        } else {
          throw new Error(result.error || 'Error en sincronización')
        }
      }
      
      // Recargar productos después del sync
      const productsResponse = await apiService.getProducts()
      actions.setProducts(productsResponse)
      
      // Actualizar stats
      const statsResponse = await apiService.getProductStats()
      actions.setStats(statsResponse)
      
      console.log(`Sincronización completada: ${totalNewProducts} productos nuevos`)
      
    } catch (error) {
      console.error('Error en sincronización inicial:', error)
      actions.setError('sync', error.message)
    } finally {
      actions.setLoading('products', false)
      setSyncProgress(null)
    }
  }

  const handleLoadData = async () => {
    try {
      actions.setLoading('products', true)
      actions.setLoading('alerts', true)
      actions.setLoading('stats', true)

      const [productsResponse, alertsResponse, statsResponse] = await Promise.all([
        apiService.getProducts(),
        apiService.getAlerts(),
        apiService.getProductStats()
      ])

      actions.setProducts(productsResponse)
      actions.setAlerts(alertsResponse.alerts || [])
      actions.setStats(statsResponse)
    } catch (error) {
      console.error('Error cargando datos:', error)
      actions.setError('general', error.message)
    } finally {
      actions.setLoading('products', false)
      actions.setLoading('alerts', false)
      actions.setLoading('stats', false)
    }
  }

  const recentAlerts = alerts.slice(0, 5)
  
  // Aplicar filtro de departamento primero
  const { filteredProducts: departmentFilteredProducts, departmentName, isFiltered } = useDepartmentFilter(products)
  
  // Filtrar productos con bajo stock aplicando filtros del dashboard
  const lowStockProducts = useMemo(() => {
    // Asegurar que departmentFilteredProducts es un array válido
    if (!Array.isArray(departmentFilteredProducts)) {
      console.error('departmentFilteredProducts no es un array:', departmentFilteredProducts);
      return [];
    }
    
    let filtered = departmentFilteredProducts.filter(p => p.available_quantity <= 5)
    
    // Filtro por nivel de stock específico
    if (dashboardFilters.stockLevel !== 'all') {
      const stockLevel = parseInt(dashboardFilters.stockLevel)
      filtered = filtered.filter(p => p.available_quantity === stockLevel)
    }
    
    // Filtro por categorías múltiples
    if (dashboardFilters.categories.length > 0) {
      filtered = filtered.filter(p => 
        p.category_id && dashboardFilters.categories.includes(p.category_id)
      )
    }
    
    // Filtro por búsqueda
    if (dashboardFilters.search) {
      const searchLower = dashboardFilters.search.toLowerCase()
      filtered = filtered.filter(p => 
        p.title.toLowerCase().includes(searchLower) ||
        p.seller_sku?.toLowerCase().includes(searchLower) ||
        p.id.includes(searchLower)
      )
    }
    
    // Ordenamiento
    switch (dashboardFilters.sort) {
      case 'stock-asc':
        filtered.sort((a, b) => a.available_quantity - b.available_quantity)
        break
      case 'stock-desc':
        filtered.sort((a, b) => b.available_quantity - a.available_quantity)
        break
      default:
        // Mantener orden original
        break
    }
    
    return filtered
  }, [departmentFilteredProducts, dashboardFilters])
  
  // Obtener categorías únicas para el dropdown
  const availableCategories = useMemo(() => {
    const categories = new Set()
    
    // Asegurar que departmentFilteredProducts es un array válido
    if (Array.isArray(departmentFilteredProducts)) {
      departmentFilteredProducts.forEach(product => {
        if (product.category_id) {
          categories.add(product.category_id)
        }
      })
    }
    
    return Array.from(categories).sort()
  }, [departmentFilteredProducts])

  // Hook para obtener nombres de categorías
  const { getCategoryName } = useCategories(availableCategories)
  
  // Calcular paginación
  const startIndex = currentPage * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedLowStockProducts = lowStockProducts.slice(startIndex, endIndex)
  const totalPages = Math.ceil(lowStockProducts.length / itemsPerPage)
  
  const handlePageChange = (page) => {
    setCurrentPage(page)
  }

  const handleFilterChange = (filterType, value) => {
    setDashboardFilters(prev => ({ ...prev, [filterType]: value }))
    setCurrentPage(0) // Resetear a la primera página cuando cambie el filtro
  }

  // Función para generar páginas visibles (máximo 5 páginas)
  const getVisiblePages = () => {
    const maxVisiblePages = 5
    const halfVisible = Math.floor(maxVisiblePages / 2)
    
    let startPage = Math.max(0, currentPage - halfVisible)
    let endPage = Math.min(totalPages - 1, startPage + maxVisiblePages - 1)
    
    // Ajustar si estamos cerca del final
    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(0, endPage - maxVisiblePages + 1)
    }
    
    return Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i)
  }

  return (
    <div>
      {!dataLoaded && (
        <div className="alert alert-info mb-4">
          <h5>¡Bienvenido al Dashboard!</h5>
          <p className="mb-3">Carga tus datos para comenzar a monitorear tus productos.</p>
          <button 
            className="btn btn-primary"
            onClick={handleLoadData}
            disabled={loading.products || loading.alerts || loading.stats}
          >
            {loading.products || loading.alerts || loading.stats ? (
              <>
                <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                Cargando datos...
              </>
            ) : (
              <>
                <i className="bi bi-download me-2"></i>
                Cargar Datos del Dashboard
              </>
            )}
          </button>
        </div>
      )}
      
      <MonitoringControls 
        monitorStatus={stats}
        onInitialSync={handleInitialSync}
        syncLoading={loading.products}
      />
      
      <SyncProgress 
        progress={syncProgress}
        isVisible={loading.products && syncProgress !== null}
      />
      
      <StatsCards stats={stats} alerts={alerts} />
      
      {/* Botones de departamentos */}
      <div className="row mt-4">
        <div className="col-12">
          <DepartmentButtons />
        </div>
      </div>
      
      {/* Filtros de categorías múltiples */}
      <div className="row mt-3">
        <div className="col-12">
          <div className="card">
            <div className="card-body py-3">
              <div className="row g-3 align-items-end">
                <div className="col-md-4">
                  <MultiCategorySelector
                    availableCategories={availableCategories}
                    selectedCategories={dashboardFilters.categories}
                    onChange={(categories) => handleFilterChange('categories', categories)}
                    label="Filtrar por categorías:"
                    maxHeight="300px"
                  />
                </div>
                <div className="col-md-2">
                  <button
                    className="btn btn-outline-secondary w-100"
                    type="button"
                    onClick={() => handleFilterChange('categories', [])}
                    disabled={dashboardFilters.categories.length === 0}
                    title="Limpiar selección de categorías"
                  >
                    <i className="bi bi-x-circle me-1"></i>
                    Limpiar
                  </button>
                </div>
                <div className="col-md-6">
                  {dashboardFilters.categories.length > 0 && (
                    <div>
                      <small className="text-muted d-block mb-1">Categorías seleccionadas:</small>
                      <div className="d-flex flex-wrap gap-1">
                        {dashboardFilters.categories.map(categoryId => (
                          <span key={categoryId} className="badge bg-primary d-flex align-items-center">
                            {getCategoryName(categoryId)}
                            <button
                              type="button"
                              className="btn-close btn-close-white ms-1"
                              style={{ fontSize: '0.6em' }}
                              onClick={() => {
                                const newCategories = dashboardFilters.categories.filter(id => id !== categoryId)
                                handleFilterChange('categories', newCategories)
                              }}
                              title="Quitar categoría"
                            ></button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div className="row mt-4">
        <div className="col-md-8">
          <div className="card">
            <div className="card-header">
              <div className="d-flex justify-content-between align-items-center">
                <h5 className="card-title mb-0">
                  {isFiltered ? `${departmentName} - Productos con bajo stock` : 'Productos con bajo stock'}
                </h5>
                <div className="d-flex align-items-center gap-2">
                  <span className="badge bg-secondary">{lowStockProducts.length}</span>
                  {dashboardFilters.categories.length > 0 && (
                    <span className="badge bg-primary">
                      <i className="bi bi-funnel me-1"></i>
                      {dashboardFilters.categories.length} categoría{dashboardFilters.categories.length !== 1 ? 's' : ''}
                    </span>
                  )}
                  <a href="/dashboard/products" className="btn btn-sm btn-outline-primary">
                    Ver todos
                  </a>
                </div>
              </div>
            </div>
            <div className="card-body">
              {/* Filtros para productos con bajo stock */}
              <div className="row g-3 mb-3">
                <div className="col-md-4">
                  <label className="form-label">Stock específico:</label>
                  <select 
                    className="form-select form-select-sm"
                    value={dashboardFilters.stockLevel}
                    onChange={(e) => handleFilterChange('stockLevel', e.target.value)}
                  >
                    <option value="all">Todos (≤5)</option>
                    <option value="5">Stock = 5</option>
                    <option value="4">Stock = 4</option>
                    <option value="3">Stock = 3</option>
                    <option value="2">Stock = 2</option>
                    <option value="1">Stock = 1</option>
                    <option value="0">Sin stock</option>
                  </select>
                </div>
                
                <div className="col-md-4">
                  <label className="form-label">Ordenar por:</label>
                  <select 
                    className="form-select form-select-sm"
                    value={dashboardFilters.sort}
                    onChange={(e) => handleFilterChange('sort', e.target.value)}
                  >
                    <option value="default">Orden original</option>
                    <option value="stock-asc">Stock: menor a mayor</option>
                    <option value="stock-desc">Stock: mayor a menor</option>
                  </select>
                </div>
                
                <div className="col-md-4">
                  <label className="form-label">Buscar:</label>
                  <div className="input-group input-group-sm">
                    <input 
                      type="text" 
                      className="form-control"
                      placeholder="Nombre, SKU o ID..."
                      value={dashboardFilters.search}
                      onChange={(e) => handleFilterChange('search', e.target.value)}
                    />
                    {(dashboardFilters.search || dashboardFilters.stockLevel !== 'all' || dashboardFilters.sort !== 'default') && (
                      <button
                        className="btn btn-outline-secondary"
                        type="button"
                        onClick={() => setDashboardFilters(prev => ({
                          ...prev,
                          stockLevel: 'all',
                          sort: 'default',
                          search: ''
                        }))}
                        title="Limpiar filtros de tabla"
                      >
                        <i className="bi bi-x-circle"></i>
                      </button>
                    )}
                  </div>
                </div>
              </div>
              
              <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                <ProductsTable products={paginatedLowStockProducts} loading={loading.products} />
              </div>
              
              {/* Paginación */}
              {totalPages > 1 && (
                <div className="d-flex justify-content-between align-items-center mt-3">
                  <div>
                    <small className="text-muted">
                      Mostrando {startIndex + 1} a {Math.min(endIndex, lowStockProducts.length)} de {lowStockProducts.length} productos
                    </small>
                  </div>
                  <nav>
                    <ul className="pagination pagination-sm mb-0">
                      <li className={`page-item ${currentPage === 0 ? 'disabled' : ''}`}>
                        <button 
                          className="page-link" 
                          onClick={() => handlePageChange(currentPage - 1)}
                          disabled={currentPage === 0}
                        >
                          Anterior
                        </button>
                      </li>
                      
                      {/* Primera página si no está visible */}
                      {getVisiblePages()[0] > 0 && (
                        <>
                          <li className="page-item">
                            <button className="page-link" onClick={() => handlePageChange(0)}>
                              1
                            </button>
                          </li>
                          {getVisiblePages()[0] > 1 && (
                            <li className="page-item disabled">
                              <span className="page-link">...</span>
                            </li>
                          )}
                        </>
                      )}
                      
                      {/* Páginas visibles */}
                      {getVisiblePages().map((page) => (
                        <li key={page} className={`page-item ${currentPage === page ? 'active' : ''}`}>
                          <button 
                            className="page-link" 
                            onClick={() => handlePageChange(page)}
                          >
                            {page + 1}
                          </button>
                        </li>
                      ))}
                      
                      {/* Última página si no está visible */}
                      {getVisiblePages()[getVisiblePages().length - 1] < totalPages - 1 && (
                        <>
                          {getVisiblePages()[getVisiblePages().length - 1] < totalPages - 2 && (
                            <li className="page-item disabled">
                              <span className="page-link">...</span>
                            </li>
                          )}
                          <li className="page-item">
                            <button className="page-link" onClick={() => handlePageChange(totalPages - 1)}>
                              {totalPages}
                            </button>
                          </li>
                        </>
                      )}
                      
                      <li className={`page-item ${currentPage === totalPages - 1 ? 'disabled' : ''}`}>
                        <button 
                          className="page-link" 
                          onClick={() => handlePageChange(currentPage + 1)}
                          disabled={currentPage === totalPages - 1}
                        >
                          Siguiente
                        </button>
                      </li>
                    </ul>
                  </nav>
                </div>
              )}
            </div>
          </div>
        </div>
        
        <div className="col-md-4">
          <div className="card">
            <div className="card-header d-flex justify-content-between align-items-center">
              <h5 className="card-title mb-0">Alertas recientes</h5>
              <span className="badge bg-warning">{recentAlerts.length}</span>
            </div>
            <div className="card-body">
              <RecentAlerts alerts={recentAlerts} loading={loading.alerts} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default DashboardHome