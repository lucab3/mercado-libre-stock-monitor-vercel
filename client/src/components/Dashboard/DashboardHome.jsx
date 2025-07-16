import React, { useEffect, useState } from 'react'
import { useAppContext } from '../../context/AppContext'
import { apiService } from '../../services/api'
import StatsCards from './StatsCards'
import RecentAlerts from './RecentAlerts'
import ProductsTable from './ProductsTable'
import MonitoringControls from './MonitoringControls'

function DashboardHome() {
  const { products, alerts, stats, loading, actions } = useAppContext()
  const [monitorStatus, setMonitorStatus] = useState(null)

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

  const handleSyncProducts = async () => {
    try {
      actions.setLoading('products', true)
      await apiService.syncProducts()
      
      // Recargar productos después del sync
      const productsResponse = await apiService.getProducts()
      actions.setProducts(productsResponse.products || [])
    } catch (error) {
      console.error('Error sincronizando productos:', error)
      actions.setError('sync', error.message)
    } finally {
      actions.setLoading('products', false)
    }
  }

  const recentAlerts = alerts.slice(0, 5)

  return (
    <div>
      <MonitoringControls 
        monitorStatus={monitorStatus}
        onStart={handleStartMonitoring}
        onStop={handleStopMonitoring}
        onSync={handleSyncProducts}
        syncLoading={loading.products}
      />
      
      <StatsCards stats={stats} alerts={alerts} />
      
      <div className="row mt-4">
        <div className="col-md-8">
          <div className="card">
            <div className="card-header d-flex justify-content-between align-items-center">
              <h5 className="card-title mb-0">Productos</h5>
              <span className="badge bg-secondary">{products.length}</span>
            </div>
            <div className="card-body">
              <ProductsTable products={products.slice(0, 10)} loading={loading.products} />
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