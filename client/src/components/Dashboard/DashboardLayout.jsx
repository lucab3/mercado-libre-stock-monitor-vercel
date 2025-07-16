import React, { useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import { useAppContext } from '../../context/AppContext'
import { useAuthContext } from '../../context/AuthContext'
import { apiService } from '../../services/api'
import Sidebar from './Sidebar'
import Header from './Header'
import DashboardHome from './DashboardHome'
import ProductsSection from './ProductsSection'
import AlertsSection from './AlertsSection'
import SettingsSection from './SettingsSection'

function DashboardLayout() {
  const { actions, loading } = useAppContext()
  const { user, isAuthenticated } = useAuthContext()

  useEffect(() => {
    // Solo cargar datos si el usuario está autenticado
    if (isAuthenticated && user) {
      loadInitialData()
    }
  }, [isAuthenticated, user])

  const loadInitialData = async () => {
    try {
      actions.setLoading('products', true)
      actions.setLoading('alerts', true)
      actions.setLoading('stats', true)

      const [products, alerts, stats] = await Promise.all([
        apiService.getProducts(),
        apiService.getAlerts(),
        apiService.getProductStats()
      ])

      actions.setProducts(products.products || [])
      actions.setAlerts(alerts.alerts || [])
      actions.setStats(stats)
    } catch (error) {
      console.error('Error cargando datos iniciales:', error)
      actions.setError('general', error.message)
    } finally {
      actions.setLoading('products', false)
      actions.setLoading('alerts', false)
      actions.setLoading('stats', false)
    }
  }

  return (
    <div className="container-fluid">
      <div className="row">
        <Sidebar />
        
        <main className="col-md-9 ms-sm-auto col-lg-10 px-md-4">
          <Header user={user} />
          
          <Routes>
            <Route path="/" element={<DashboardHome />} />
            <Route path="/products" element={<ProductsSection />} />
            <Route path="/alerts" element={<AlertsSection />} />
            <Route path="/settings" element={<SettingsSection />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}

export default DashboardLayout