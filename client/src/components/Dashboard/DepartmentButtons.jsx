import React from 'react'
import { useAppContext } from '../../context/AppContext'

function DepartmentButtons() {
  const { departments, actions } = useAppContext()
  const { config, selectedDepartment } = departments

  const handleDepartmentClick = (departmentId) => {
    actions.setSelectedDepartment(departmentId)
  }

  if (!config || config.length === 0) {
    return null // No mostrar si no hay departamentos configurados
  }

  return (
    <div className="mb-3">
      <div className="d-flex flex-wrap gap-2 align-items-center">
        <span className="text-muted small">Filtrar por departamento:</span>
        
        {/* Botón "Todos" */}
        <button
          type="button"
          className={`btn btn-sm ${selectedDepartment === 'all' ? 'btn-primary' : 'btn-outline-primary'}`}
          onClick={() => handleDepartmentClick('all')}
        >
          <i className="bi bi-grid-3x3-gap me-1"></i>
          Todos
        </button>

        {/* Botones de departamentos configurados */}
        {config.map((department) => (
          <button
            key={department.id}
            type="button"
            className={`btn btn-sm ${
              selectedDepartment === department.id ? 'btn-primary' : 'btn-outline-primary'
            }`}
            onClick={() => handleDepartmentClick(department.id)}
            title={`Categorías: ${department.categories.map(cat => cat.name).join(', ')}`}
          >
            <i className={`bi ${department.icon || 'bi-collection'} me-1`}></i>
            {department.name}
            <span className="badge bg-secondary ms-1">{department.categories.length}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export default DepartmentButtons