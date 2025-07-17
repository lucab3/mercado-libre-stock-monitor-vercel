import React from 'react'

function SyncProgress({ progress, isVisible = false }) {
  if (!isVisible || !progress) return null
  
  // Corregir lógica del progreso
  const processedInThisBatch = progress.processedInThisBatch || 0
  const total = progress.total || 0
  const current = progress.current || 0 // productos en BD
  const newInBatch = progress.newInThisBatch || 0
  
  // El porcentaje ya viene calculado correctamente del backend
  const percentage = Math.min(Math.max(progress.percentage || 0, 0), 100)
  
  return (
    <div className="alert alert-info mb-3">
      <div className="d-flex justify-content-between align-items-center mb-2">
        <span className="fw-bold">Sincronizando productos...</span>
        <span className="badge bg-info">{percentage}%</span>
      </div>
      
      <div className="progress mb-2" style={{ height: '20px' }}>
        <div 
          className="progress-bar progress-bar-striped progress-bar-animated" 
          role="progressbar" 
          style={{ width: `${percentage}%` }}
          aria-valuenow={percentage}
          aria-valuemin="0" 
          aria-valuemax="100"
        >
          {percentage}%
        </div>
      </div>
      
      <div className="d-flex justify-content-between">
        <small className="text-muted">
          Procesando lote de {processedInThisBatch} productos
        </small>
        <small className="text-muted">
          {current} productos en BD
        </small>
        {newInBatch > 0 && (
          <small className="text-success">
            +{newInBatch} nuevos
          </small>
        )}
      </div>
    </div>
  )
}

export default SyncProgress