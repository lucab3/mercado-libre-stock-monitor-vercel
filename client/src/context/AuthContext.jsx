import React, { createContext, useContext, useReducer, useEffect } from 'react'
import { authService } from '../services/auth'

const AuthContext = createContext()

const initialState = {
  isAuthenticated: false,
  user: null,
  loading: true,
  error: null
}

function authReducer(state, action) {
  switch (action.type) {
    case 'AUTH_START':
      return { ...state, loading: true, error: null }
    case 'AUTH_SUCCESS':
      return { 
        ...state, 
        isAuthenticated: true, 
        user: action.payload, 
        loading: false, 
        error: null 
      }
    case 'AUTH_ERROR':
      return { 
        ...state, 
        isAuthenticated: false, 
        user: null, 
        loading: false, 
        error: action.payload 
      }
    case 'LOGOUT':
      return { 
        ...state, 
        isAuthenticated: false, 
        user: null, 
        loading: false, 
        error: null 
      }
    default:
      return state
  }
}

export function AuthProvider({ children }) {
  const [state, dispatch] = useReducer(authReducer, initialState)

  // Verificar estado de autenticación al cargar
  useEffect(() => {
    checkAuthStatus()
  }, [])

  const checkAuthStatus = async () => {
    try {
      dispatch({ type: 'AUTH_START' })
      const response = await authService.getStatus()
      
      if (response.authenticated) {
        dispatch({ 
          type: 'AUTH_SUCCESS', 
          payload: { 
            id: response.userId, 
            nickname: response.userInfo?.nickname 
          } 
        })
      } else {
        dispatch({ type: 'AUTH_ERROR', payload: 'No autenticado' })
      }
    } catch (error) {
      console.error('Error verificando autenticación:', error)
      
      // Si es error 401, redirigir a login en lugar de mostrar error
      if (error.message.includes('401')) {
        window.location.href = '/auth/login'
        return
      }
      
      dispatch({ type: 'AUTH_ERROR', payload: error.message })
    }
  }

  const login = async () => {
    try {
      dispatch({ type: 'AUTH_START' })
      // Redirigir a la URL de autorización de ML (no login)
      window.location.href = '/auth/authorize'
    } catch (error) {
      dispatch({ type: 'AUTH_ERROR', payload: error.message })
    }
  }

  const logout = async () => {
    try {
      await authService.logout()
      dispatch({ type: 'LOGOUT' })
      window.location.href = '/login'
    } catch (error) {
      console.error('Error en logout:', error)
      dispatch({ type: 'LOGOUT' })
    }
  }

  const value = {
    ...state,
    login,
    logout,
    checkAuthStatus
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuthContext = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuthContext debe usarse dentro de AuthProvider')
  }
  return context
}