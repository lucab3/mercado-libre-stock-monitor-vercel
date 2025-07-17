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
    <div className="table-responsive">
      <table className="table table-hover">
        <thead>
          <tr>
            <th>Producto</th>
            <th>SKU</th>
            <th>Stock</th>
            <th>Estado</th>
            <th>Última actualización</th>
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
                <small className="text-muted">
                  {product.updated_at ? new Date(product.updated_at).toLocaleString() : 'N/A'}
                </small>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default ProductsTable