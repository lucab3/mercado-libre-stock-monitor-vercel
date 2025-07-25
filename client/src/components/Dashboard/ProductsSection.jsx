import React, { useMemo } from 'react'
import { useAppContext } from '../../context/AppContext'
import { useCategories } from '../../hooks/useCategories'
import { useDepartmentFilter } from '../../hooks/useDepartmentFilter'
import ProductsTable from './ProductsTable'
import DepartmentButtons from './DepartmentButtons'
import MultiCategorySelector from './MultiCategorySelector'

function ProductsSection() {
  const { products, loading, productFilters, actions } = useAppContext()
  
  // Aplicar filtro de departamento primero
  const { filteredProducts: departmentFilteredProducts, departmentName, isFiltered } = useDepartmentFilter(products)

  // Filtrar y ordenar productos
  const filteredProducts = useMemo(() => {
    let filtered = [...departmentFilteredProducts]
    
    // Filtro por categorías múltiples
    if (productFilters.categories.length > 0) {
      filtered = filtered.filter(p => 
        p.category_id && productFilters.categories.includes(p.category_id)
      )
    }
    
    // Filtro por estado de publicación
    if (productFilters.statusFilter && productFilters.statusFilter !== 'all') {
      filtered = filtered.filter(p => p.status === productFilters.statusFilter)
    }
    
    // Filtro por nivel de stock
    if (productFilters.stockFilter && productFilters.stockFilter !== 'all') {
      if (productFilters.stockFilter === 'low') {
        filtered = filtered.filter(p => p.available_quantity <= 5 && p.available_quantity > 0)
      } else if (productFilters.stockFilter === 'out') {
        filtered = filtered.filter(p => p.available_quantity === 0)
      }
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
  }, [departmentFilteredProducts, productFilters])

  const handleFilterChange = (filterType, value) => {
    actions.setProductFilters({ [filterType]: value })
  }

  // Obtener categorías únicas para el dropdown
  const availableCategories = useMemo(() => {
    const categories = new Set()
    console.log('🔍 ProductsSection - products data:', departmentFilteredProducts.length, 'products (filtered by department)')
    
    // Verificar algunos productos de ejemplo
    departmentFilteredProducts.slice(0, 3).forEach((product, index) => {
      console.log(`📦 ProductsSection - Product ${index + 1}:`, {
        id: product.id,
        title: product.title?.substring(0, 50) + '...',
        category_id: product.category_id,
        has_category: !!product.category_id
      })
    })
    
    departmentFilteredProducts.forEach(product => {
      if (product.category_id) {
        categories.add(product.category_id)
      }
    })
    const result = Array.from(categories).sort()
    console.log('📊 ProductsSection - availableCategories calculated:', result.length, 'categories:', result.slice(0, 5))
    return result
  }, [departmentFilteredProducts])

  // Hook para obtener nombres de categorías
  console.log('🎯 ProductsSection - calling useCategories with:', availableCategories.length, 'categories')
  const { getCategoryName } = useCategories(availableCategories)

  return (
    <div>
      <div className="d-flex justify-content-between flex-wrap flex-md-nowrap align-items-center pt-3 pb-2 mb-3 border-bottom">
        <h1 className="h2">
          {isFiltered ? `${departmentName}` : 'Todos los productos'}
        </h1>
        <div className="btn-toolbar mb-2 mb-md-0">
          <div className="d-flex align-items-center gap-2">
            <span className="badge bg-secondary fs-6">
              {filteredProducts.length} de {departmentFilteredProducts.length} productos
              {isFiltered && ` (${departmentFilteredProducts.length} de ${products.length} total)`}
            </span>
            {productFilters.categories.length > 0 && (
              <span className="badge bg-primary">
                <i className="bi bi-funnel me-1"></i>
                {productFilters.categories.length} categoría{productFilters.categories.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
      </div>
      
      <DepartmentButtons />

      {/* Filtros */}
      <div className="card mb-3">
        <div className="card-body">
          <div className="row g-3">
            <div className="col-md-3">
              <MultiCategorySelector
                availableCategories={availableCategories}
                selectedCategories={productFilters.categories}
                onChange={(categories) => handleFilterChange('categories', categories)}
                label="Filtrar por categorías:"
                maxHeight="250px"
              />
            </div>
            
            <div className="col-md-2">
              <label className="form-label">Estado publicación:</label>
              <select 
                className="form-select"
                value={productFilters.statusFilter || 'all'}
                onChange={(e) => handleFilterChange('statusFilter', e.target.value)}
              >
                <option value="all">Todos</option>
                <option value="active">Activo</option>
                <option value="paused">Pausado</option>
                <option value="closed">Cerrado</option>
                <option value="under_review">En revisión</option>
              </select>
            </div>
            
            <div className="col-md-2">
              <label className="form-label">Nivel de stock:</label>
              <select 
                className="form-select"
                value={productFilters.stockFilter || 'all'}
                onChange={(e) => handleFilterChange('stockFilter', e.target.value)}
              >
                <option value="all">Todos</option>
                <option value="low">Stock bajo</option>
                <option value="out">Sin stock</option>
              </select>
            </div>
            
            <div className="col-md-2">
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
            
            <div className="col-md-4">
              <label className="form-label">Buscar producto:</label>
              <div className="input-group">
                <input 
                  type="text" 
                  className="form-control"
                  placeholder="Buscar por nombre, SKU o ID..."
                  value={productFilters.searchText}
                  onChange={(e) => handleFilterChange('searchText', e.target.value)}
                />
                {(productFilters.categories.length > 0 || productFilters.searchText || (productFilters.stockFilter && productFilters.stockFilter !== 'all') || (productFilters.statusFilter && productFilters.statusFilter !== 'all') || productFilters.stockSort !== 'default') && (
                  <button
                    className="btn btn-outline-secondary"
                    type="button"
                    onClick={() => actions.setProductFilters({
                      categories: [],
                      stockSort: 'default',
                      stockFilter: 'all',
                      statusFilter: 'all',
                      searchText: ''
                    })}
                    title="Limpiar todos los filtros"
                  >
                    <i className="bi bi-x-circle"></i>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-body">
          <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
            <ProductsTable products={filteredProducts} loading={loading.products} />
          </div>
        </div>
      </div>
    </div>
  )
}

export default ProductsSection