import React, { createContext, useContext, useReducer, useEffect } from 'react'

const AppContext = createContext()

const initialState = {
  // Datos
  products: [],
  alerts: [],
  stats: null,
  
  // Contadores globales de alertas (independientes del filtro)
  alertCounts: {
    total: 0,
    critical: 0,
    warning: 0,
    info: 0
  },
  
  // Estados de carga
  loading: {
    products: false,
    alerts: false,
    stats: false
  },
  
  // UI State
  currentSection: 'dashboard',
  alertFilters: {
    priority: 'all',
    page: 0,
    limit: 20
  },
  
  // Filtros de productos
  productFilters: {
    category: 'all',
    stockSort: 'default',
    stockFilter: 'all', // all, low, out
    searchText: ''
  },
  
  // Configuración
  settings: {
    popupsEnabled: true,
    soundEnabled: false,
    criticalOnly: false,
    autoRefresh: true
  },
  
  // Errores
  errors: {}
}

function appReducer(state, action) {
  switch (action.type) {
    // Loading states
    case 'SET_LOADING':
      return {
        ...state,
        loading: { ...state.loading, [action.payload.key]: action.payload.value }
      }
    
    // Productos
    case 'SET_PRODUCTS':
      return { ...state, products: action.payload }
    
    // Alertas
    case 'SET_ALERTS':
      return { ...state, alerts: action.payload }
    
    case 'SET_ALERT_COUNTS':
      return { ...state, alertCounts: action.payload }
    
    case 'SET_ALERT_FILTERS':
      return {
        ...state,
        alertFilters: { ...state.alertFilters, ...action.payload }
      }
    
    // Filtros de productos
    case 'SET_PRODUCT_FILTERS':
      return {
        ...state,
        productFilters: { ...state.productFilters, ...action.payload }
      }
    
    // Stats
    case 'SET_STATS':
      return { ...state, stats: action.payload }
    
    // UI
    case 'SET_CURRENT_SECTION':
      return { ...state, currentSection: action.payload }
    
    // Settings
    case 'SET_SETTINGS':
      return {
        ...state,
        settings: { ...state.settings, ...action.payload }
      }
    
    // Errores
    case 'SET_ERROR':
      return {
        ...state,
        errors: { ...state.errors, [action.payload.key]: action.payload.error }
      }
    
    case 'CLEAR_ERROR':
      const newErrors = { ...state.errors }
      delete newErrors[action.payload]
      return { ...state, errors: newErrors }
    
    default:
      return state
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(appReducer, initialState)

  // Auto-refresh setup - DESHABILITADO temporalmente para evitar problemas de sesión
  // useEffect(() => {
  //   if (state.settings.autoRefresh) {
  //     const interval = setInterval(() => {
  //       // Refresh data silently
  //       refreshData()
  //     }, 30000) // 30 seconds

  //     return () => clearInterval(interval)
  //   }
  // }, [state.settings.autoRefresh])

  const setLoading = (key, value) => {
    dispatch({ type: 'SET_LOADING', payload: { key, value } })
  }

  const setProducts = (products) => {
    // Asegurar que products siempre sea un array
    const validProducts = Array.isArray(products) ? products : [];
    console.log('🔍 setProducts llamado con:', products, 'convertido a:', validProducts);
    dispatch({ type: 'SET_PRODUCTS', payload: validProducts })
  }

  const setAlerts = (alerts) => {
    dispatch({ type: 'SET_ALERTS', payload: alerts })
  }

  const setAlertCounts = (counts) => {
    dispatch({ type: 'SET_ALERT_COUNTS', payload: counts })
  }

  const setAlertFilters = (filters) => {
    dispatch({ type: 'SET_ALERT_FILTERS', payload: filters })
  }

  const setProductFilters = (filters) => {
    dispatch({ type: 'SET_PRODUCT_FILTERS', payload: filters })
  }

  const setStats = (stats) => {
    dispatch({ type: 'SET_STATS', payload: stats })
  }

  const setCurrentSection = (section) => {
    dispatch({ type: 'SET_CURRENT_SECTION', payload: section })
  }

  const setSettings = (settings) => {
    dispatch({ type: 'SET_SETTINGS', payload: settings })
  }

  const setError = (key, error) => {
    dispatch({ type: 'SET_ERROR', payload: { key, error } })
  }

  const clearError = (key) => {
    dispatch({ type: 'CLEAR_ERROR', payload: key })
  }

  const refreshData = async () => {
    try {
      const { apiService } = await import('../services/api')
      
      const [products, alerts] = await Promise.all([
        apiService.getProducts(),
        apiService.getAlerts(state.alertFilters)
      ])

      setProducts(products.products || [])
      setAlerts(alerts.alerts || [])
    } catch (error) {
      console.error('Error refreshing data:', error)
    }
  }

  const value = {
    ...state,
    actions: {
      setLoading,
      setProducts,
      setAlerts,
      setAlertCounts,
      setAlertFilters,
      setProductFilters,
      setStats,
      setCurrentSection,
      setSettings,
      setError,
      clearError,
      refreshData
    }
  }

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  )
}

export const useAppContext = () => {
  const context = useContext(AppContext)
  if (!context) {
    throw new Error('useAppContext debe usarse dentro de AppProvider')
  }
  return context
}