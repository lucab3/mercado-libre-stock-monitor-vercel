import React from 'react'

function MonitoringControls({ monitorStatus, onInitialSync, syncLoading }) {
  const totalProducts = monitorStatus?.totalProducts || 0
  const lastSync = monitorStatus?.lastSync

  return (
    <div className="card mb-4">
      <div className="card-body">
        <div className="row align-items-center">
          <div className="col-md-8">
            <h5 className="card-title mb-2">Sincronización de Productos</h5>
            <div className="d-flex align-items-center mb-2">
              <span className={`status-indicator ${totalProducts > 0 ? 'status-active' : 'status-inactive'}`}></span>
              <span className="ms-2">
                {totalProducts > 0 ? `${totalProducts} productos sincronizados` : 'Sin productos sincronizados'}
              </span>
            </div>
            {lastSync && (
              <small className="text-muted">
                Última sincronización: {new Date(lastSync).toLocaleString()}
              </small>
            )}
            {totalProducts === 0 && (
              <p className="text-muted small mb-0">
                Realiza una sincronización inicial para cargar todos tus productos de MercadoLibre
              </p>
            )}
          </div>
          
          <div className="col-md-4 text-md-end">            
            <button 
              className="btn btn-primary"
              onClick={onInitialSync}
              disabled={syncLoading}
            >
              {syncLoading ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                  Sincronizando...
                </>
              ) : (
                <>
                  <i className="bi bi-download me-2"></i>
                  {totalProducts > 0 ? 'Actualizar productos' : 'Sincronización inicial'}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default MonitoringControls