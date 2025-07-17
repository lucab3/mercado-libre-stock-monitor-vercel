import React from 'react'

function SyncProgress({ progress, isVisible = false }) {
  if (!isVisible || !progress) return null
  
  const percentage = progress.percentage || 0
  const current = progress.current || 0
  const total = progress.total || 0
  const newInBatch = progress.newInThisBatch || 0
  
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
          {current} / {total} productos procesados
        </small>
        {newInBatch > 0 && (
          <small className="text-success">
            +{newInBatch} nuevos en este lote
          </small>
        )}
      </div>
    </div>
  )
}

export default SyncProgress