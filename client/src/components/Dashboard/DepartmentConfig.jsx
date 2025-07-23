import React, { useState, useEffect } from 'react'
import { useAppContext } from '../../context/AppContext'
import { useCategories } from '../../hooks/useCategories'
import { apiService } from '../../services/api'

function DepartmentConfig() {
  const { products, departments, actions } = useAppContext()
  const [departmentForm, setDepartmentForm] = useState({
    id: '',
    name: '',
    icon: 'bi-collection',
    categories: []
  })
  const [isEditing, setIsEditing] = useState(false)
  const [editingIndex, setEditingIndex] = useState(-1)
  const [saving, setSaving] = useState(false)

  // Obtener categorías únicas disponibles en los productos
  const availableCategories = React.useMemo(() => {
    const categories = new Set()
    products.forEach(product => {
      if (product.category_id) {
        categories.add(product.category_id)
      }
    })
    return Array.from(categories).sort()
  }, [products])

  const { getCategoryName } = useCategories(availableCategories)

  // Iconos disponibles para departamentos
  const availableIcons = [
    { id: 'bi-collection', name: 'General', icon: 'bi-collection' },
    { id: 'bi-car-front', name: 'Automotriz', icon: 'bi-car-front' },
    { id: 'bi-tools', name: 'Herramientas', icon: 'bi-tools' },
    { id: 'bi-camera', name: 'Audiovisual', icon: 'bi-camera' },
    { id: 'bi-phone', name: 'Celulares', icon: 'bi-phone' },
    { id: 'bi-laptop', name: 'Electrónicos', icon: 'bi-laptop' },
    { id: 'bi-house', name: 'Hogar', icon: 'bi-house' },
    { id: 'bi-person-workspace', name: 'Oficina', icon: 'bi-person-workspace' },
    { id: 'bi-wrench-adjustable', name: 'Industrial', icon: 'bi-wrench-adjustable' }
  ]

  const handleInputChange = (field, value) => {
    setDepartmentForm(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handleCategoryToggle = (categoryId) => {
    const categoryName = getCategoryName(categoryId)
    setDepartmentForm(prev => {
      const existingIndex = prev.categories.findIndex(cat => cat.id === categoryId)
      
      if (existingIndex >= 0) {
        // Remover categoría
        return {
          ...prev,
          categories: prev.categories.filter(cat => cat.id !== categoryId)
        }
      } else {
        // Agregar categoría
        return {
          ...prev,
          categories: [...prev.categories, { id: categoryId, name: categoryName }]
        }
      }
    })
  }

  const handleSaveDepartment = async () => {
    if (!departmentForm.name.trim()) {
      alert('El nombre del departamento es requerido')
      return
    }

    if (departmentForm.categories.length === 0) {
      alert('Debe seleccionar al menos una categoría')
      return
    }

    setSaving(true)
    
    try {
      const newDepartment = {
        ...departmentForm,
        id: departmentForm.id || `dept_${Date.now()}`,
        name: departmentForm.name.trim()
      }

      let newConfig = [...departments.config]

      if (isEditing && editingIndex >= 0) {
        // Editar departamento existente
        newConfig[editingIndex] = newDepartment
      } else {
        // Agregar nuevo departamento
        newConfig.push(newDepartment)
      }

      // Guardar en backend
      await apiService.saveDepartmentsConfig(newConfig)
      
      // Actualizar contexto local
      actions.setDepartmentsConfig(newConfig)
      handleCancelEdit()
      
      console.log('Departamentos guardados exitosamente:', newConfig)
    } catch (error) {
      console.error('Error guardando departamentos:', error)
      alert('Error guardando la configuración. Inténtalo de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  const handleEditDepartment = (index) => {
    const department = departments.config[index]
    setDepartmentForm({ ...department })
    setIsEditing(true)
    setEditingIndex(index)
  }

  const handleDeleteDepartment = async (index) => {
    if (confirm('¿Estás seguro de que quieres eliminar este departamento?')) {
      setSaving(true)
      
      try {
        const newConfig = departments.config.filter((_, i) => i !== index)
        
        // Guardar en backend
        await apiService.saveDepartmentsConfig(newConfig)
        
        // Actualizar contexto local
        actions.setDepartmentsConfig(newConfig)
        
        // Si se elimina el departamento seleccionado, volver a "todos"
        if (departments.selectedDepartment === departments.config[index]?.id) {
          actions.setSelectedDepartment('all')
        }
      } catch (error) {
        console.error('Error eliminando departamento:', error)
        alert('Error eliminando el departamento. Inténtalo de nuevo.')
      } finally {
        setSaving(false)
      }
    }
  }

  const handleCancelEdit = () => {
    setDepartmentForm({
      id: '',
      name: '',
      icon: 'bi-collection',
      categories: []
    })
    setIsEditing(false)
    setEditingIndex(-1)
  }

  return (
    <div className="card">
      <div className="card-header">
        <h5 className="card-title mb-0">Configuración de Departamentos</h5>
        <small className="text-muted">
          Crea botones personalizados para filtrar productos por múltiples categorías
        </small>
      </div>
      <div className="card-body">
        {/* Formulario para agregar/editar departamento */}
        <div className="border rounded p-3 mb-4">
          <h6 className="mb-3">
            {isEditing ? 'Editar Departamento' : 'Nuevo Departamento'}
          </h6>
          
          <div className="row g-3">
            <div className="col-md-6">
              <label className="form-label">Nombre del departamento</label>
              <input
                type="text"
                className="form-control"
                placeholder="ej: Automotriz, Audiovisual..."
                value={departmentForm.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
              />
            </div>
            
            <div className="col-md-6">
              <label className="form-label">Icono</label>
              <select
                className="form-select"
                value={departmentForm.icon}
                onChange={(e) => handleInputChange('icon', e.target.value)}
              >
                {availableIcons.map(icon => (
                  <option key={icon.id} value={icon.icon}>
                    {icon.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-3">
            <label className="form-label">
              Categorías incluidas ({departmentForm.categories.length} seleccionadas)
            </label>
            <div className="border rounded p-3" style={{ maxHeight: '200px', overflowY: 'auto' }}>
              {availableCategories.length === 0 ? (
                <div className="text-muted text-center py-3">
                  <i className="bi bi-info-circle me-2"></i>
                  No hay categorías disponibles. Primero sincroniza tus productos.
                </div>
              ) : (
                <div className="row g-2">
                  {availableCategories.map(categoryId => {
                    const isSelected = departmentForm.categories.some(cat => cat.id === categoryId)
                    return (
                      <div key={categoryId} className="col-md-6">
                        <div className="form-check">
                          <input
                            className="form-check-input"
                            type="checkbox"
                            id={`category-${categoryId}`}
                            checked={isSelected}
                            onChange={() => handleCategoryToggle(categoryId)}
                          />
                          <label 
                            className="form-check-label" 
                            htmlFor={`category-${categoryId}`}
                            title={categoryId}
                          >
                            {getCategoryName(categoryId)}
                          </label>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="mt-3 d-flex gap-2">
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSaveDepartment}
              disabled={!departmentForm.name.trim() || departmentForm.categories.length === 0 || saving}
            >
              {saving ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                  Guardando...
                </>
              ) : (
                <>
                  <i className="bi bi-check-lg me-2"></i>
                  {isEditing ? 'Actualizar' : 'Agregar'} Departamento
                </>
              )}
            </button>
            
            {isEditing && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleCancelEdit}
              >
                <i className="bi bi-x-lg me-2"></i>
                Cancelar
              </button>
            )}
          </div>
        </div>

        {/* Lista de departamentos configurados */}
        <div>
          <h6 className="mb-3">Departamentos Configurados ({departments.config.length})</h6>
          
          {departments.config.length === 0 ? (
            <div className="text-center text-muted py-4">
              <i className="bi bi-collection-fill fs-4 mb-2"></i>
              <p className="mb-0">No hay departamentos configurados</p>
              <small>Crea tu primer departamento usando el formulario de arriba</small>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>Departamento</th>
                    <th>Categorías</th>
                    <th>Productos</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {departments.config.map((department, index) => {
                    const categoryIds = department.categories.map(cat => cat.id)
                    const productsInDept = products.filter(p => 
                      p.category_id && categoryIds.includes(p.category_id)
                    ).length
                    
                    return (
                      <tr key={department.id}>
                        <td>
                          <div className="d-flex align-items-center">
                            <i className={`${department.icon} me-2`}></i>
                            <strong>{department.name}</strong>
                          </div>
                        </td>
                        <td>
                          <div>
                            {department.categories.slice(0, 3).map(cat => (
                              <span key={cat.id} className="badge bg-light text-dark me-1 mb-1">
                                {cat.name}
                              </span>
                            ))}
                            {department.categories.length > 3 && (
                              <span className="badge bg-secondary">
                                +{department.categories.length - 3} más
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          <span className="badge bg-primary">{productsInDept}</span>
                        </td>
                        <td>
                          <div className="btn-group btn-group-sm">
                            <button
                              type="button"
                              className="btn btn-outline-primary"
                              onClick={() => handleEditDepartment(index)}
                              title="Editar departamento"
                            >
                              <i className="bi bi-pencil"></i>
                            </button>
                            <button
                              type="button"
                              className="btn btn-outline-danger"
                              onClick={() => handleDeleteDepartment(index)}
                              title="Eliminar departamento"
                            >
                              <i className="bi bi-trash"></i>
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default DepartmentConfig