import React, { useEffect, useState } from 'react'
import { useAppContext } from '../../context/AppContext'
import { apiService } from '../../services/api'
import StatsCards from './StatsCards'
import RecentAlerts from './RecentAlerts'
import ProductsTable from './ProductsTable'
import MonitoringControls from './MonitoringControls'
import SyncProgress from './SyncProgress'

function DashboardHome() {
  const { products, alerts, stats, loading, actions } = useAppContext()
  const [monitorStatus, setMonitorStatus] = useState(null)
  const [syncProgress, setSyncProgress] = useState(null)
  const [currentPage, setCurrentPage] = useState(0)
  const [itemsPerPage] = useState(10)
  
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
      actions.setProducts(productsResponse.products || [])
      
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

      actions.setProducts(productsResponse.products || [])
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
  
  // Filtrar productos con bajo stock (≤5 unidades) - incluye productos con stock = 0
  const lowStockProducts = products.filter(p => p.available_quantity <= 5)
  
  // Calcular paginación
  const startIndex = currentPage * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedLowStockProducts = lowStockProducts.slice(startIndex, endIndex)
  const totalPages = Math.ceil(lowStockProducts.length / itemsPerPage)
  
  const handlePageChange = (page) => {
    setCurrentPage(page)
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
      
      <div className="row mt-4">
        <div className="col-md-8">
          <div className="card">
            <div className="card-header d-flex justify-content-between align-items-center">
              <h5 className="card-title mb-0">Productos con bajo stock</h5>
              <div className="d-flex align-items-center gap-2">
                <span className="badge bg-secondary">{lowStockProducts.length}</span>
                <a href="/dashboard/products" className="btn btn-sm btn-outline-primary">
                  Ver todos
                </a>
              </div>
            </div>
            <div className="card-body">
              <ProductsTable products={paginatedLowStockProducts} loading={loading.products} />
              
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
                      
                      {Array.from({ length: totalPages }, (_, i) => (
                        <li key={i} className={`page-item ${currentPage === i ? 'active' : ''}`}>
                          <button 
                            className="page-link" 
                            onClick={() => handlePageChange(i)}
                          >
                            {i + 1}
                          </button>
                        </li>
                      ))}
                      
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