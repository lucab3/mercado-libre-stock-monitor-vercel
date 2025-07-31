import React from 'react'

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
                      <a 
                        href={product.productUrl || product.permalink || `https://articulo.mercadolibre.com.ar/${product.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-decoration-none text-primary"
                        title="Ver producto en MercadoLibre"
                      >
                        {product.title}
                        <i className="bi bi-box-arrow-up-right ms-1 small"></i>
                      </a>
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