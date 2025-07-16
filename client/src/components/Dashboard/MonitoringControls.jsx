import React from 'react'

function MonitoringControls({ monitorStatus, onStart, onStop, onSync, syncLoading }) {
  const isRunning = monitorStatus?.running || false

  return (
    <div className="card mb-4">
      <div className="card-body">
        <div className="row align-items-center">
          <div className="col-md-6">
            <h5 className="card-title mb-2">Estado del Monitor</h5>
            <div className="d-flex align-items-center">
              <span className={`status-indicator ${isRunning ? 'status-active' : 'status-inactive'}`}></span>
              <span className="ms-2">
                {isRunning ? 'Monitoreo activo' : 'Monitoreo detenido'}
              </span>
            </div>
            {monitorStatus?.lastSync && (
              <small className="text-muted">
                Última sincronización: {new Date(monitorStatus.lastSync).toLocaleString()}
              </small>
            )}
          </div>
          
          <div className="col-md-6 text-md-end">
            <div className="btn-group me-2">
              {isRunning ? (
                <button 
                  className="btn btn-outline-danger"
                  onClick={onStop}
                  disabled={syncLoading}
                >
                  <i className="bi bi-stop-circle me-2"></i>
                  Detener Monitor
                </button>
              ) : (
                <button 
                  className="btn btn-success"
                  onClick={onStart}
                  disabled={syncLoading}
                >
                  <i className="bi bi-play-circle me-2"></i>
                  Iniciar Monitor
                </button>
              )}
            </div>
            
            <button 
              className="btn btn-primary"
              onClick={onSync}
              disabled={syncLoading}
            >
              {syncLoading ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                  Sincronizando...
                </>
              ) : (
                <>
                  <i className="bi bi-arrow-clockwise me-2"></i>
                  Sincronizar
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