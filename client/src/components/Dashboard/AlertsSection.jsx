import React, { useEffect } from 'react'
import { useAppContext } from '../../context/AppContext'
import { apiService } from '../../services/api'

function AlertsSection() {
  const { alerts, alertFilters, loading, actions } = useAppContext()
  const [alertCounts, setAlertCounts] = React.useState({
    total: 0,
    critical: 0,
    warning: 0,
    info: 0
  })

  useEffect(() => {
    loadAlerts()
  }, [alertFilters])

  const loadAlerts = async () => {
    try {
      actions.setLoading('alerts', true)
      const response = await apiService.getAlerts(alertFilters)
      actions.setAlerts(response.alerts || [])
      
      // Actualizar contadores desde la respuesta del backend
      if (response.summary) {
        setAlertCounts({
          total: response.summary.total || 0,
          critical: response.summary.critical || 0,
          warning: response.summary.warning || 0,
          info: response.summary.info || 0
        })
      }
    } catch (error) {
      console.error('Error cargando alertas:', error)
      actions.setError('alerts', error.message)
    } finally {
      actions.setLoading('alerts', false)
    }
  }

  const handleFilterChange = (priority) => {
    actions.setAlertFilters({ priority, page: 0 })
  }

  const getPriorityIcon = (priority) => {
    switch (priority) {
      case 'critical':
        return 'bi-exclamation-triangle-fill text-danger'
      case 'warning':
        return 'bi-info-circle-fill text-warning'
      default:
        return 'bi-info-circle text-info'
    }
  }

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleString()
  }

  // Los contadores ahora vienen del backend para mostrar totales correctos
  const criticalCount = alertCounts.critical
  const warningCount = alertCounts.warning
  const infoCount = alertCounts.info

  return (
    <div>
      <div className="d-flex justify-content-between flex-wrap flex-md-nowrap align-items-center pt-3 pb-2 mb-3 border-bottom">
        <h1 className="h2">Alertas</h1>
      </div>

      <div className="row mb-4">
        <div className="col-md-3">
          <button 
            className={`btn w-100 ${alertFilters.priority === 'all' ? 'btn-primary' : 'btn-outline-primary'}`}
            onClick={() => handleFilterChange('all')}
          >
            <i className="bi bi-list me-2"></i>
            Todas
            <span className="badge bg-secondary ms-2">{alertCounts.total}</span>
          </button>
        </div>
        <div className="col-md-3">
          <button 
            className={`btn w-100 ${alertFilters.priority === 'critical' ? 'btn-danger' : 'btn-outline-danger'}`}
            onClick={() => handleFilterChange('critical')}
          >
            <i className="bi bi-exclamation-triangle me-2"></i>
            Críticas
            <span className="badge bg-secondary ms-2">{criticalCount}</span>
          </button>
        </div>
        <div className="col-md-3">
          <button 
            className={`btn w-100 ${alertFilters.priority === 'warning' ? 'btn-warning' : 'btn-outline-warning'}`}
            onClick={() => handleFilterChange('warning')}
          >
            <i className="bi bi-info-circle me-2"></i>
            Advertencias
            <span className="badge bg-secondary ms-2">{warningCount}</span>
          </button>
        </div>
        <div className="col-md-3">
          <button 
            className={`btn w-100 ${alertFilters.priority === 'informative' ? 'btn-info' : 'btn-outline-info'}`}
            onClick={() => handleFilterChange('informative')}
          >
            <i className="bi bi-info-circle me-2"></i>
            Informativas
            <span className="badge bg-secondary ms-2">{infoCount}</span>
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-body">
          {loading.alerts ? (
            <div className="text-center py-4">
              <div className="spinner-border" role="status">
                <span className="visually-hidden">Cargando alertas...</span>
              </div>
            </div>
          ) : alerts.length === 0 ? (
            <div className="text-center py-4 text-muted">
              <i className="bi bi-check-circle fs-4 mb-2"></i>
              <p className="mb-0">No hay alertas para mostrar</p>
            </div>
          ) : (
            <div className="list-group list-group-flush">
              {alerts.map((alert, index) => (
                <div key={index} className="list-group-item p-3">
                  <div className="d-flex align-items-start">
                    <i className={`${getPriorityIcon(alert.priority)} me-3 mt-1 fs-5`}></i>
                    <div className="flex-grow-1">
                      <div className="d-flex justify-content-between align-items-start mb-2">
                        <h6 className="mb-0">{alert.title}</h6>
                        <small className="text-muted">{formatTime(alert.created_at)}</small>
                      </div>
                      <p className="mb-2">{alert.message}</p>
                      <div className="row">
                        {alert.seller_sku && (
                          <div className="col-md-4">
                            <small className="text-muted">
                              <strong>SKU:</strong> {alert.seller_sku}
                            </small>
                          </div>
                        )}
                        {alert.product_id && (
                          <div className="col-md-4">
                            <small className="text-muted">
                              <strong>ID Producto:</strong> {alert.product_id}
                            </small>
                          </div>
                        )}
                        {alert.previous_stock !== undefined && (
                          <div className="col-md-4">
                            <small className="text-muted">
                              <strong>Stock anterior:</strong> {alert.previous_stock}
                            </small>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default AlertsSection