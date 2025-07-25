import React from 'react'

function RecentAlerts({ alerts, loading }) {
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
    const date = new Date(timestamp)
    const now = new Date()
    const diffMinutes = Math.floor((now - date) / (1000 * 60))
    
    if (diffMinutes < 1) return 'Hace un momento'
    if (diffMinutes < 60) return `Hace ${diffMinutes} min`
    if (diffMinutes < 1440) return `Hace ${Math.floor(diffMinutes / 60)} h`
    return date.toLocaleDateString()
  }

  if (loading) {
    return (
      <div className="text-center py-3">
        <div className="spinner-border spinner-border-sm" role="status">
          <span className="visually-hidden">Cargando...</span>
        </div>
      </div>
    )
  }

  if (alerts.length === 0) {
    return (
      <div className="text-center py-3 text-muted">
        <i className="bi bi-check-circle fs-4 mb-2"></i>
        <p className="mb-0">No hay alertas recientes</p>
      </div>
    )
  }

  return (
    <div className="list-group list-group-flush">
      {alerts.map((alert, index) => {
        // Generar URL del producto usando la misma lógica que ProductsTable
        const generateUrlFromId = (productId) => {
          if (!productId) return null;
          const countryCode = productId.substring(0, 3); // MLA, MLM, etc.
          const productNumber = productId.substring(3);
          
          const countryDomains = {
            'MLA': 'com.ar',
            'MLM': 'com.mx', 
            'MLB': 'com.br',
            'MLC': 'cl',
            'MCO': 'com.co'
          };
          
          const domain = countryDomains[countryCode] || 'com.ar';
          return `https://articulo.mercadolibre.${domain}/${countryCode}-${productNumber}`;
        };
        
        const productUrl = alert.product_id ? generateUrlFromId(alert.product_id) : null;
        
        return (
          <div key={index} className="list-group-item p-3">
            <div className="d-flex align-items-start">
              <i className={`${getPriorityIcon(alert.priority)} me-3 mt-1`}></i>
              <div className="flex-grow-1">
                <div className="d-flex justify-content-between align-items-start">
                  {productUrl ? (
                    <a 
                      href={productUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-decoration-none"
                    >
                      <h6 className="mb-1 text-primary">{alert.title}</h6>
                    </a>
                  ) : (
                    <h6 className="mb-1">{alert.title}</h6>
                  )}
                  <small className="text-muted">{formatTime(alert.created_at)}</small>
                </div>
                <p className="mb-1 small">{alert.message}</p>
                {alert.seller_sku && (
                  <small className="text-muted">SKU: {alert.seller_sku}</small>
                )}
                {productUrl && (
                  <div className="mt-2">
                    <a 
                      href={productUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-sm btn-outline-primary"
                    >
                      <i className="bi bi-box-arrow-up-right me-1"></i>
                      Ver producto
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  )
}

export default RecentAlerts