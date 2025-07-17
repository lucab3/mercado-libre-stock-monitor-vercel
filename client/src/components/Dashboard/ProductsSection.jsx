import React, { useMemo } from 'react'
import { useAppContext } from '../../context/AppContext'
import ProductsTable from './ProductsTable'

function ProductsSection() {
  const { products, loading, productFilters, actions } = useAppContext()

  // Filtrar y ordenar productos
  const filteredProducts = useMemo(() => {
    let filtered = [...products]
    
    // Filtro por categoría
    if (productFilters.category !== 'all') {
      filtered = filtered.filter(p => p.category_id === productFilters.category)
    }
    
    // Filtro por estado
    if (productFilters.stockFilter === 'active') {
      filtered = filtered.filter(p => p.status === 'active')
    } else if (productFilters.stockFilter === 'paused') {
      filtered = filtered.filter(p => p.status === 'paused')
    } else if (productFilters.stockFilter === 'low') {
      filtered = filtered.filter(p => p.available_quantity <= 5 && p.available_quantity > 0)
    } else if (productFilters.stockFilter === 'out') {
      filtered = filtered.filter(p => p.available_quantity === 0)
    }
    
    // Filtro por texto de búsqueda
    if (productFilters.searchText) {
      const searchLower = productFilters.searchText.toLowerCase()
      filtered = filtered.filter(p => 
        p.title.toLowerCase().includes(searchLower) ||
        p.seller_sku?.toLowerCase().includes(searchLower) ||
        p.id.includes(searchLower)
      )
    }
    
    // Ordenamiento
    switch (productFilters.stockSort) {
      case 'stock-asc':
        filtered.sort((a, b) => a.available_quantity - b.available_quantity)
        break
      case 'stock-desc':
        filtered.sort((a, b) => b.available_quantity - a.available_quantity)
        break
      default:
        // Mantener orden original
        break
    }
    
    return filtered
  }, [products, productFilters])

  const handleFilterChange = (filterType, value) => {
    actions.setProductFilters({ [filterType]: value })
  }

  // Obtener categorías únicas para el dropdown
  const availableCategories = useMemo(() => {
    const categories = new Set()
    products.forEach(product => {
      if (product.category_id) {
        categories.add(product.category_id)
      }
    })
    return Array.from(categories).sort()
  }, [products])

  return (
    <div>
      <div className="d-flex justify-content-between flex-wrap flex-md-nowrap align-items-center pt-3 pb-2 mb-3 border-bottom">
        <h1 className="h2">Todos los productos</h1>
        <div className="btn-toolbar mb-2 mb-md-0">
          <span className="badge bg-secondary fs-6">
            {filteredProducts.length} de {products.length} productos
          </span>
        </div>
      </div>

      {/* Filtros */}
      <div className="card mb-3">
        <div className="card-body">
          <div className="row g-3">
            <div className="col-md-3">
              <label className="form-label">Filtrar por categoría:</label>
              <select 
                className="form-select"
                value={productFilters.category}
                onChange={(e) => handleFilterChange('category', e.target.value)}
              >
                <option value="all">Todas las categorías</option>
                {availableCategories.map(category => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </div>
            
            <div className="col-md-3">
              <label className="form-label">Filtrar por estado:</label>
              <select 
                className="form-select"
                value={productFilters.stockFilter}
                onChange={(e) => handleFilterChange('stockFilter', e.target.value)}
              >
                <option value="all">Todos</option>
                <option value="active">Activos</option>
                <option value="paused">Pausados</option>
                <option value="low">Stock bajo (≤5)</option>
                <option value="out">Sin stock</option>
              </select>
            </div>
            
            <div className="col-md-3">
              <label className="form-label">Ordenar por:</label>
              <select 
                className="form-select"
                value={productFilters.stockSort}
                onChange={(e) => handleFilterChange('stockSort', e.target.value)}
              >
                <option value="default">Orden original</option>
                <option value="stock-asc">Stock: menor a mayor</option>
                <option value="stock-desc">Stock: mayor a menor</option>
              </select>
            </div>
            
            <div className="col-md-3">
              <label className="form-label">Buscar producto:</label>
              <input 
                type="text" 
                className="form-control"
                placeholder="Buscar por nombre, SKU o ID..."
                value={productFilters.searchText}
                onChange={(e) => handleFilterChange('searchText', e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-body">
          <ProductsTable products={filteredProducts} loading={loading.products} />
        </div>
      </div>
    </div>
  )
}

export default ProductsSection