import React from 'react'
import { useAuthContext } from '../../context/AuthContext'
import { useAppContext } from '../../context/AppContext'

function Header({ user }) {
  const { logout } = useAuthContext()
  const { alerts } = useAppContext()
  
  const criticalAlerts = alerts.filter(alert => alert.priority === 'critical')
  
  const handleLogout = () => {
    if (window.confirm('¿Estás seguro que deseas cerrar sesión?')) {
      logout()
    }
  }

  return (
    <div className="d-flex justify-content-between flex-wrap flex-md-nowrap align-items-center pt-3 pb-2 mb-3 border-bottom">
      <h1 className="h2">Dashboard</h1>
      
      <div className="btn-toolbar mb-2 mb-md-0">
        <div className="btn-group me-3">
          <div className="notification-bell me-3">
            <i className="bi bi-bell fs-5"></i>
            {criticalAlerts.length > 0 && (
              <span className="notification-badge">{criticalAlerts.length}</span>
            )}
          </div>
        </div>
        
        <div className="dropdown">
          <button 
            className="btn btn-outline-secondary dropdown-toggle d-flex align-items-center"
            type="button" 
            data-bs-toggle="dropdown"
            aria-expanded="false"
          >
            <i className="bi bi-person-circle me-2"></i>
            {user?.nickname || 'Usuario'}
          </button>
          
          <ul className="dropdown-menu">
            <li>
              <a className="dropdown-item" href="#" onClick={handleLogout}>
                <i className="bi bi-box-arrow-right me-2"></i>
                Cerrar sesión
              </a>
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}

export default Header