import React, { useState, useEffect } from 'react'

function ProductPreviewTooltip({ product, children, show, position }) {
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageError, setImageError] = useState(false)

  useEffect(() => {
    if (show && product.thumbnail) {
      setImageLoaded(false)
      setImageError(false)
    }
  }, [show, product.thumbnail])

  const formatPrice = (price) => {
    if (!price) return 'No disponible'
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS'
    }).format(price)
  }

  const formatDelay = (handlingTime) => {
    if (!handlingTime || handlingTime <= 24) return null
    const days = Math.round(handlingTime / 24)
    return `${days} día${days === 1 ? '' : 's'} de demora`
  }

  const getImageUrl = (thumbnail) => {
    if (!thumbnail) return null
    // Convertir thumbnail a imagen de mejor calidad si es posible
    return thumbnail.replace('-I.jpg', '-O.jpg').replace('-I.webp', '-O.webp')
  }

  if (!show) return children

  return (
    <div className="position-relative d-inline-block">
      {children}

      {/* Tooltip Preview */}
      <div
        className="position-absolute bg-white border rounded shadow-lg p-3"
        style={{
          top: position?.top || '-10px',
          left: position?.left || '100%',
          width: '350px',
          zIndex: 9999,
          transform: 'translateY(-50%)',
          marginLeft: '10px',
          maxHeight: '400px',
          overflow: 'hidden'
        }}
      >
        {/* Header con título */}
        <div className="mb-2">
          <h6 className="mb-1 text-truncate" title={product.title}>
            {product.title}
          </h6>
          <small className="text-muted">ID: {product.id}</small>
        </div>

        {/* Imagen del producto */}
        <div className="mb-3 text-center">
          {product.thumbnail ? (
            <div className="position-relative">
              {!imageLoaded && !imageError && (
                <div
                  className="d-flex align-items-center justify-content-center bg-light rounded"
                  style={{ width: '200px', height: '200px', margin: '0 auto' }}
                >
                  <div className="spinner-border spinner-border-sm text-primary" role="status">
                    <span className="visually-hidden">Cargando imagen...</span>
                  </div>
                </div>
              )}

              {imageError && (
                <div
                  className="d-flex align-items-center justify-content-center bg-light rounded text-muted"
                  style={{ width: '200px', height: '200px', margin: '0 auto' }}
                >
                  <i className="bi bi-image fs-1"></i>
                </div>
              )}

              <img
                src={getImageUrl(product.thumbnail)}
                alt={product.title}
                className={`rounded ${imageLoaded ? 'd-block' : 'd-none'}`}
                style={{
                  width: '200px',
                  height: '200px',
                  objectFit: 'cover',
                  margin: '0 auto'
                }}
                onLoad={() => setImageLoaded(true)}
                onError={() => {
                  setImageError(true)
                  setImageLoaded(false)
                }}
              />
            </div>
          ) : (
            <div
              className="d-flex align-items-center justify-content-center bg-light rounded text-muted"
              style={{ width: '200px', height: '200px', margin: '0 auto' }}
            >
              <i className="bi bi-image fs-1"></i>
            </div>
          )}
        </div>

        {/* Información del producto */}
        <div className="row g-2 small">
          <div className="col-6">
            <strong>Precio:</strong>
          </div>
          <div className="col-6 text-end">
            <span className="text-success fw-bold">
              {formatPrice(product.price)}
            </span>
          </div>

          <div className="col-6">
            <strong>Stock:</strong>
          </div>
          <div className="col-6 text-end">
            <span className={`badge ${
              product.available_quantity <= 0 ? 'bg-danger' :
              product.available_quantity <= 5 ? 'bg-warning' : 'bg-success'
            }`}>
              {product.available_quantity || 0}
            </span>
          </div>

          <div className="col-6">
            <strong>Estado:</strong>
          </div>
          <div className="col-6 text-end">
            <span className={`badge ${
              product.status === 'active' ? 'bg-success' :
              product.status === 'paused' ? 'bg-warning' :
              product.status === 'closed' ? 'bg-danger' : 'bg-secondary'
            }`}>
              {product.status === 'active' ? 'Activo' :
               product.status === 'paused' ? 'Pausado' :
               product.status === 'closed' ? 'Finalizada' : 'Desconocido'}
            </span>
          </div>

          {product.is_fulfillment && (
            <>
              <div className="col-6">
                <strong>Fulfillment:</strong>
              </div>
              <div className="col-6 text-end">
                <span className="badge bg-primary">🚚 Full</span>
              </div>
            </>
          )}

          {formatDelay(product.estimated_handling_time) && (
            <>
              <div className="col-6">
                <strong>Demora:</strong>
              </div>
              <div className="col-6 text-end">
                <span className="badge bg-warning">
                  ⏱️ {formatDelay(product.estimated_handling_time)}
                </span>
              </div>
            </>
          )}

          {product.seller_sku && (
            <>
              <div className="col-12 mt-2">
                <strong>SKU:</strong> <code className="small">{product.seller_sku}</code>
              </div>
            </>
          )}
        </div>

        {/* Footer con link */}
        <div className="mt-3 text-center">
          <a
            href={product.productUrl || product.permalink || `https://articulo.mercadolibre.com.ar/${product.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary btn-sm"
            onClick={(e) => e.stopPropagation()}
          >
            Ver en MercadoLibre <i className="bi bi-box-arrow-up-right ms-1"></i>
          </a>
        </div>
      </div>
    </div>
  )
}

export default ProductPreviewTooltip