import React, { useState, useMemo } from 'react'
import { useCategories } from '../../hooks/useCategories'

function MultiCategorySelector({ 
  availableCategories, 
  selectedCategories, 
  onChange, 
  label = "Filtrar por categorías",
  placeholder = "Seleccionar categorías...",
  maxHeight = "300px"
}) {
  const [isOpen, setIsOpen] = useState(false)
  const { getCategoryName, getCategoryInfo } = useCategories(availableCategories)

  // Generar nombres únicos para categorías duplicadas
  const uniqueCategoryNames = useMemo(() => {
    const categoryGroups = new Map()
    
    // Agrupar categorías por nombre
    availableCategories.forEach(categoryId => {
      const categoryInfo = getCategoryInfo(categoryId)
      const name = categoryInfo.name
      
      if (!categoryGroups.has(name)) {
        categoryGroups.set(name, [])
      }
      categoryGroups.get(name).push({ id: categoryId, info: categoryInfo })
    })
    
    // Generar nombres únicos
    const uniqueNames = new Map()
    
    categoryGroups.forEach((categories, name) => {
      if (categories.length === 1) {
        // Solo una categoría con este nombre, usar nombre original
        uniqueNames.set(categories[0].id, name)
      } else {
        // Múltiples categorías con el mismo nombre, agregar contexto del path
        categories.forEach(({ id, info }) => {
          const path = info.path_from_root || []
          if (path.length > 1) {
            // Usar el nombre del padre para diferenciar
            const parentName = path[path.length - 2]?.name
            uniqueNames.set(id, parentName ? `${name} (${parentName})` : `${name} (${id})`)
          } else {
            // Fallback: usar ID para diferenciar
            uniqueNames.set(id, `${name} (${id})`)
          }
        })
      }
    })
    
    return uniqueNames
  }, [availableCategories, getCategoryInfo])

  const getUniqueCategoryName = (categoryId) => {
    return uniqueCategoryNames.get(categoryId) || getCategoryName(categoryId)
  }

  const handleCategoryToggle = (categoryId) => {
    const newSelection = selectedCategories.includes(categoryId)
      ? selectedCategories.filter(id => id !== categoryId)
      : [...selectedCategories, categoryId]
    
    onChange(newSelection)
  }

  const handleSelectAll = () => {
    onChange(availableCategories)
  }

  const handleClearAll = () => {
    onChange([])
  }

  const getDisplayText = () => {
    if (selectedCategories.length === 0) {
      return "Todas las categorías"
    }
    
    if (selectedCategories.length === 1) {
      return getUniqueCategoryName(selectedCategories[0])
    }

    if (selectedCategories.length <= 3) {
      return selectedCategories.map(id => getUniqueCategoryName(id)).join(', ')
    }

    return `${selectedCategories.length} categorías seleccionadas`
  }

  return (
    <div className="position-relative">
      <label className="form-label">{label}</label>
      
      {/* Botón principal del selector */}
      <button
        type="button"
        className={`form-select text-start ${isOpen ? 'show' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        <div className="d-flex justify-content-between align-items-center">
          <span className={selectedCategories.length === 0 ? 'text-muted' : ''}>
            {getDisplayText()}
          </span>
          <i className={`bi ${isOpen ? 'bi-chevron-up' : 'bi-chevron-down'}`}></i>
        </div>
      </button>

      {/* Badges de categorías seleccionadas */}
      {selectedCategories.length > 0 && (
        <div className="mt-2">
          <div className="d-flex flex-wrap gap-1">
            {selectedCategories.map(categoryId => (
              <span key={categoryId} className="badge bg-primary d-flex align-items-center">
                {getUniqueCategoryName(categoryId)}
                <button
                  type="button"
                  className="btn-close btn-close-white ms-2"
                  style={{ fontSize: '0.6em' }}
                  onClick={() => handleCategoryToggle(categoryId)}
                  aria-label={`Remover ${getUniqueCategoryName(categoryId)}`}
                ></button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Dropdown con opciones */}
      {isOpen && (
        <div className="position-absolute w-100 bg-white border rounded shadow-sm mt-1" 
             style={{ zIndex: 1050, maxHeight, overflowY: 'auto' }}>
          
          {/* Controles de selección rápida */}
          <div className="p-2 border-bottom bg-light">
            <div className="d-flex gap-2">
              <button
                type="button"
                className="btn btn-sm btn-outline-primary flex-fill"
                onClick={handleSelectAll}
              >
                <i className="bi bi-check-all me-1"></i>
                Todas
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary flex-fill"
                onClick={handleClearAll}
              >
                <i className="bi bi-x-lg me-1"></i>
                Ninguna
              </button>
            </div>
          </div>

          {/* Lista de categorías */}
          <div className="p-2">
            {availableCategories.length === 0 ? (
              <div className="text-center text-muted py-3">
                <i className="bi bi-info-circle me-2"></i>
                No hay categorías disponibles
              </div>
            ) : (
              <div className="row g-1">
                {availableCategories
                  .sort((a, b) => getUniqueCategoryName(a).localeCompare(getUniqueCategoryName(b)))
                  .map(categoryId => {
                  const isSelected = selectedCategories.includes(categoryId)
                  return (
                    <div key={categoryId} className="col-12">
                      <div 
                        className={`form-check d-flex align-items-center ${isSelected ? 'bg-primary bg-opacity-10 border border-primary' : 'bg-light'} p-3 rounded`}
                        style={{ cursor: 'pointer' }}
                        onClick={() => handleCategoryToggle(categoryId)}
                      >
                        <input
                          className="form-check-input me-3"
                          type="checkbox"
                          id={`category-${categoryId}`}
                          checked={isSelected}
                          onChange={() => handleCategoryToggle(categoryId)}
                          style={{ 
                            width: '20px', 
                            height: '20px',
                            cursor: 'pointer',
                            borderWidth: '2px'
                          }}
                        />
                        <label 
                          className={`form-check-label flex-fill ${isSelected ? 'fw-medium text-primary' : ''}`} 
                          htmlFor={`category-${categoryId}`}
                          style={{ cursor: 'pointer' }}
                          title={categoryId}
                        >
                          {getUniqueCategoryName(categoryId)}
                        </label>
                        {isSelected && (
                          <i className="bi bi-check-circle-fill text-primary ms-2" style={{ fontSize: '16px' }}></i>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Overlay para cerrar al hacer click fuera */}
      {isOpen && (
        <div
          className="position-fixed top-0 start-0 w-100 h-100"
          style={{ zIndex: 1040 }}
          onClick={() => setIsOpen(false)}
        ></div>
      )}
    </div>
  )
}

export default MultiCategorySelector