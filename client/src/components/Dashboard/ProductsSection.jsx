import React from 'react'
import { useAppContext } from '../../context/AppContext'
import ProductsTable from './ProductsTable'

function ProductsSection() {
  const { products, loading } = useAppContext()

  return (
    <div>
      <div className="d-flex justify-content-between flex-wrap flex-md-nowrap align-items-center pt-3 pb-2 mb-3 border-bottom">
        <h1 className="h2">Productos</h1>
        <div className="btn-toolbar mb-2 mb-md-0">
          <span className="badge bg-secondary fs-6">{products.length} productos</span>
        </div>
      </div>

      <div className="card">
        <div className="card-body">
          <ProductsTable products={products} loading={loading.products} />
        </div>
      </div>
    </div>
  )
}

export default ProductsSection