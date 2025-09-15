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
    
    // Filtro por Fulfillment
    if (productFilters.fulfillmentFilter) {
      filtered = filtered.filter(p => p.is_fulfillment === true)
    }

    // Filtro por productos con demora
    if (productFilters.delayFilter && productFilters.delayFilter !== 'all') {
      filtered = filtered.filter(p => {
        const handlingTime = p.estimated_handling_time;
        if (!handlingTime) return false;

        switch (productFilters.delayFilter) {
          case 'any':
            return handlingTime > 24;
          case '30days':
            // 30 días = 720 horas (30 * 24)
            return handlingTime >= 720 && handlingTime < 1080; // Hasta 45 días
          case '45days':
            // 45 días = 1080 horas (45 * 24)
            return handlingTime >= 1080;
          default:
            return true;
        }
      })
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
    
    // Filtro por precio
    if (productFilters.priceFilter.value && !isNaN(productFilters.priceFilter.value)) {
      const priceValue = parseFloat(productFilters.priceFilter.value)
      filtered = filtered.filter(p => {
        if (!p.price) return false
        if (productFilters.priceFilter.operator === 'greater') {
          return p.price > priceValue
        } else {
          return p.price < priceValue
        }
      })
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

  const handleExport = async () => {
    try {
      const filtersInfo = {
        departmentName,
        categories: productFilters.categories,
        statusFilter: productFilters.statusFilter,
        stockFilter: productFilters.stockFilter,
        fulfillmentFilter: productFilters.fulfillmentFilter,
        delayFilter: productFilters.delayFilter,
        searchText: productFilters.searchText,
        priceFilter: productFilters.priceFilter
      }
      
      const result = await actions.exportToExcel(filteredProducts, filtersInfo)
      
      // Mostrar notificación de éxito
      alert(`✅ Exportado exitosamente: ${result.count} productos en ${result.fileName}`)
    } catch (error) {
      alert(`❌ Error exportando: ${error.message}`)
    }
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
            {productFilters.fulfillmentFilter && (
              <span className="badge bg-info">
                <i className="bi bi-truck me-1"></i>
                Solo Full
              </span>
            )}
            {productFilters.delayFilter && productFilters.delayFilter !== 'all' && (
              <span className="badge bg-warning">
                <i className="bi bi-clock me-1"></i>
                {productFilters.delayFilter === 'any' ? 'Con demora' :
                 productFilters.delayFilter === '30days' ? 'Demora 30 días' :
                 productFilters.delayFilter === '45days' ? 'Demora 45+ días' : 'Con demora'}
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
              <label className="form-label">Fulfillment:</label>
              <div className="form-check mt-2">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id="fulfillmentFilter"
                  checked={productFilters.fulfillmentFilter}
                  onChange={(e) => handleFilterChange('fulfillmentFilter', e.target.checked)}
                />
                <label className="form-check-label" htmlFor="fulfillmentFilter">
                  🚚 Solo productos Full
                </label>
              </div>
            </div>

            <div className="col-md-2">
              <label className="form-label">Demora:</label>
              <select
                className="form-select"
                value={productFilters.delayFilter}
                onChange={(e) => handleFilterChange('delayFilter', e.target.value)}
              >
                <option value="all">Todos</option>
                <option value="any">Con demora (+24h)</option>
                <option value="30days">30 días (720h+)</option>
                <option value="45days">45+ días (1080h+)</option>
              </select>
            </div>
          </div>

          <div className="row g-3 mt-0">
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

            <div className="col-md-3">
              <label className="form-label">Filtrar por precio:</label>
              <div className="input-group">
                <select 
                  className="form-select" 
                  style={{ maxWidth: '120px' }}
                  value={productFilters.priceFilter.operator}
                  onChange={(e) => handleFilterChange('priceFilter', { 
                    ...productFilters.priceFilter, 
                    operator: e.target.value 
                  })}
                >
                  <option value="greater">Mayor a</option>
                  <option value="less">Menor a</option>
                </select>
                <span className="input-group-text">$</span>
                <input 
                  type="number" 
                  className="form-control"
                  placeholder="0"
                  value={productFilters.priceFilter.value}
                  onChange={(e) => handleFilterChange('priceFilter', { 
                    ...productFilters.priceFilter, 
                    value: e.target.value 
                  })}
                />
              </div>
            </div>
          </div>
          
          <div className="row g-3 mt-2">
            <div className="col-md-12">
              <label className="form-label">Buscar producto:</label>
              <div className="input-group">
                <input 
                  type="text" 
                  className="form-control"
                  placeholder="Buscar por nombre, SKU o ID..."
                  value={productFilters.searchText}
                  onChange={(e) => handleFilterChange('searchText', e.target.value)}
                />
                {(productFilters.categories.length > 0 || productFilters.searchText || (productFilters.stockFilter && productFilters.stockFilter !== 'all') || (productFilters.statusFilter && productFilters.statusFilter !== 'all') || productFilters.stockSort !== 'default' || productFilters.priceFilter.value || productFilters.fulfillmentFilter || (productFilters.delayFilter && productFilters.delayFilter !== 'all')) && (
                  <button
                    className="btn btn-outline-secondary"
                    type="button"
                    onClick={() => actions.setProductFilters({
                      categories: [],
                      stockSort: 'default',
                      stockFilter: 'all',
                      statusFilter: 'all',
                      searchText: '',
                      fulfillmentFilter: false,
                      delayFilter: 'all',
                      priceFilter: {
                        operator: 'greater',
                        value: ''
                      }
                    })}
                    title="Limpiar todos los filtros"
                  >
                    <i className="bi bi-x-circle"></i>
                  </button>
                )}
              </div>
            </div>
          </div>
          
          {/* Barra de acciones */}
          <div className="row mt-3">
            <div className="col-12 d-flex justify-content-between align-items-center">
              <div>
                <span className="text-muted">
                  Mostrando {filteredProducts.length} de {products.length} productos
                  {isFiltered && ` (filtrado por: ${departmentName})`}
                </span>
              </div>
              <div>
                <button
                  className="btn btn-success"
                  type="button"
                  onClick={handleExport}
                  title="Exportar productos filtrados a Excel"
                  disabled={filteredProducts.length === 0 || loading.products}
                >
                  <i className="bi bi-file-earmark-excel me-2"></i>
                  Exportar a Excel ({filteredProducts.length})
                </button>
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