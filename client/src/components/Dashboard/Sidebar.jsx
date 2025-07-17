import React from 'react'
import { NavLink } from 'react-router-dom'
import { useAppContext } from '../../context/AppContext'

function Sidebar() {
  const { alertCounts, stats } = useAppContext()
  
  const criticalAlertsCount = alertCounts.critical
  const totalProducts = stats?.totalProducts || 0

  return (
    <nav id="sidebarMenu" className="col-md-3 col-lg-2 d-md-block bg-light sidebar collapse">
      <div className="position-sticky pt-3 sidebar-sticky">
        <div className="text-center p-3 border-bottom">
          <h5 className="text-primary">
            <i className="bi bi-graph-up me-2"></i>
            Stock Monitor
          </h5>
        </div>
        
        <ul className="nav flex-column">
          <li className="nav-item">
            <NavLink 
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              to="/dashboard"
              end
            >
              <i className="bi bi-house me-2"></i>
              Productos con bajo stock
            </NavLink>
          </li>
          
          <li className="nav-item">
            <NavLink 
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              to="/dashboard/products"
            >
              <i className="bi bi-box me-2"></i>
              Todos los productos
              <span className="badge bg-secondary ms-2">{totalProducts}</span>
            </NavLink>
          </li>
          
          <li className="nav-item">
            <NavLink 
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              to="/dashboard/alerts"
            >
              <i className="bi bi-bell me-2"></i>
              Alertas
              {criticalAlertsCount > 0 && (
                <span className="badge bg-danger ms-2">{criticalAlertsCount}</span>
              )}
            </NavLink>
          </li>
          
          <li className="nav-item">
            <NavLink 
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              to="/dashboard/settings"
            >
              <i className="bi bi-gear me-2"></i>
              Configuración
            </NavLink>
          </li>
        </ul>
      </div>
    </nav>
  )
}

export default Sidebar