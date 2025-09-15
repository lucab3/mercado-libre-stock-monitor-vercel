import React from 'react'
import { useProductPreview } from '../../hooks/useProductPreview'

// Componente para el link con preview
function ProductLinkWithPreview({ product }) {
  const { showPreview, previewPosition, handleMouseEnter, handleMouseLeave } = useProductPreview()

  return (
    <div className="product-link-with-preview">
      <a
        href={product.productUrl || product.permalink || `https://articulo.mercadolibre.com.ar/${product.id}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-decoration-none text-primary"
        title="Ver producto en MercadoLibre"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {product.title}
        <i className="bi bi-box-arrow-up-right ms-1 small"></i>
      </a>

      {/* Preview tooltip */}
      {showPreview && (
        <div
          className="product-preview-tooltip position-fixed"
          style={{
            top: `${previewPosition.top}px`,
            left: `${previewPosition.left}px`,
          }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
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
              <img
                src={product.thumbnail.replace('-I.jpg', '-O.jpg').replace('-I.webp', '-O.webp')}
                alt={product.title}
                className="product-preview-image rounded"
                style={{
                  width: '200px',
                  height: '200px',
                  objectFit: 'cover',
                  margin: '0 auto'
                }}
                onError={(e) => {
                  e.target.style.display = 'none'
                  e.target.nextSibling.style.display = 'flex'
                }}
              />
            ) : null}
            <div className="product-preview-no-image d-none">
              <i className="bi bi-image"></i>
            </div>
          </div>

          {/* Información del producto */}
          <div className="row g-2 small">
            <div className="col-6">
              <strong>Precio:</strong>
            </div>
            <div className="col-6 text-end">
              <span className="text-success fw-bold">
                {product.price ? new Intl.NumberFormat('es-AR', {
                  style: 'currency',
                  currency: 'ARS'
                }).format(product.price) : 'No disponible'}
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

            {product.estimated_handling_time && product.estimated_handling_time > 24 && (
              <>
                <div className="col-6">
                  <strong>Demora:</strong>
                </div>
                <div className="col-6 text-end">
                  <span className="badge bg-warning">
                    ⏱️ {Math.round(product.estimated_handling_time / 24)} día{Math.round(product.estimated_handling_time / 24) === 1 ? '' : 's'}
                  </span>
                </div>
              </>
            )}

            {product.seller_sku && (
              <div className="col-12 mt-2">
                <strong>SKU:</strong> <code className="small">{product.seller_sku}</code>
              </div>
            )}
          </div>

          {/* Footer con botón */}
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
      )}
    </div>
  )
}

function ProductsTable({ products, loading }) {
  const getStockBadge = (stock) => {
    if (stock <= 0) return 'bg-danger'
    if (stock <= 5) return 'bg-warning'
    return 'bg-success'
  }

  const getStockText = (stock) => {
    if (stock <= 0) return 'Sin stock'
    if (stock <= 5) return 'Stock bajo'
    return 'Stock normal'
  }

  const getStatusBadge = (status) => {
    switch (status) {
      case 'active':
        return 'bg-success'
      case 'paused':
        return 'bg-warning'
      case 'closed':
        return 'bg-danger'
      case 'under_review':
        return 'bg-info'
      default:
        return 'bg-secondary'
    }
  }

  const getStatusText = (status) => {
    switch (status) {
      case 'active':
        return 'Activo'
      case 'paused':
        return 'Pausado'
      case 'closed':
        return 'Finalizada'
      case 'under_review':
        return 'En revisión'
      default:
        return status || 'Desconocido'
    }
  }

  // Detectar si producto tiene demora basado en estimated_handling_time
  const hasManufacturingDelay = (product) => {
    return product.estimated_handling_time && product.estimated_handling_time > 24
  }

  // Obtener badge de estado considerando demora de fabricación
  const getStatusBadgeWithDelay = (product) => {
    // El color debe basarse en el estado, no en la demora
    return getStatusBadge(product.status)
  }

  // Obtener badge de fulfillment
  const getFulfillmentBadge = (product) => {
    return product.is_fulfillment ? 'bg-primary' : 'bg-light text-dark'
  }

  const getFulfillmentText = (product) => {
    return product.is_fulfillment ? '🚚 Full' : '📦 Normal'
  }

  if (loading) {
    return (
      <div className="text-center py-4">
        <div className="spinner-border" role="status">
          <span className="visually-hidden">Cargando productos...</span>
        </div>
      </div>
    )
  }

  if (products.length === 0) {
    return (
      <div className="text-center py-4 text-muted">
        <i className="bi bi-box fs-4 mb-2"></i>
        <p className="mb-0">No hay productos para mostrar</p>
        <small>Sincroniza tus productos para comenzar</small>
      </div>
    )
  }

  return (
    <div>
      {/* Headers fijos siempre visibles */}
      <div className="sticky-top bg-white border-bottom" style={{ zIndex: 10, boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
        <div className="table-responsive">
          <table className="table table-hover mb-0">
            <thead>
              <tr>
                <th className="border-top-0">Producto</th>
                <th className="border-top-0">SKU</th>
                <th className="border-top-0">Stock</th>
                <th className="border-top-0">Estado Stock</th>
                <th className="border-top-0">Estado Publicación</th>
                <th className="border-top-0">Fulfillment</th>
                <th className="border-top-0">Última actualización</th>
                <th className="border-top-0">Precio</th>
              </tr>
            </thead>
          </table>
        </div>
      </div>
      
      {/* Tabla con scroll normal */}
      <div className="table-responsive">
        <table className="table table-hover">
          <thead className="visually-hidden">
            <tr>
              <th>Producto</th>
              <th>SKU</th>
              <th>Stock</th>
              <th>Estado Stock</th>
              <th>Estado Publicación</th>
              <th>Fulfillment</th>
              <th>Última actualización</th>
              <th>Precio</th>
            </tr>
          </thead>
        <tbody>
          {products.map((product) => (
            <tr key={product.id}>
              <td>
                <div className="d-flex align-items-center">
                  {product.thumbnail && (
                    <img 
                      src={product.thumbnail} 
                      alt={product.title}
                      className="rounded me-2"
                      style={{ width: '40px', height: '40px', objectFit: 'cover' }}
                    />
                  )}
                  <div>
                    <div className="fw-semibold">
                      <ProductLinkWithPreview product={product} />
                    </div>
                    <small className="text-muted">{product.id}</small>
                  </div>
                </div>
              </td>
              <td>
                <code className="small">{product.seller_sku || 'N/A'}</code>
              </td>
              <td>
                <span className="fw-bold">{product.available_quantity}</span>
              </td>
              <td>
                <span className={`badge ${getStockBadge(product.available_quantity)}`}>
                  {getStockText(product.available_quantity)}
                </span>
              </td>
              <td>
                <span className={`badge ${getStatusBadgeWithDelay(product)}`} style={{ whiteSpace: 'pre-line' }}>
                  {product.status_display || getStatusText(product.status)}
                </span>
              </td>
              <td>
                <span className={`badge ${getFulfillmentBadge(product)}`} style={{ fontSize: '0.75rem' }}>
                  {getFulfillmentText(product)}
                </span>
                {product.inventory_id && (
                  <div style={{ fontSize: '0.6rem', color: '#666', marginTop: '2px' }}>
                    ID: {product.inventory_id}
                  </div>
                )}
              </td>
              <td>
                <small className="text-muted">
                  {product.updated_at ? new Date(product.updated_at).toLocaleString() : 'N/A'}
                </small>
              </td>
              <td>
                <span className="fw-bold text-success">
                  ${product.price ? product.price.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : 'N/A'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  )
}

export default ProductsTable