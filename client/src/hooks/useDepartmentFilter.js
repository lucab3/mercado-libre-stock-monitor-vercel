import { useMemo } from 'react'
import { useAppContext } from '../context/AppContext'

export function useDepartmentFilter(products) {
  const { departments } = useAppContext()
  const { config, selectedDepartment } = departments

  const filteredProducts = useMemo(() => {
    // Si no hay departamento seleccionado o es "todos", devolver todos los productos
    if (!selectedDepartment || selectedDepartment === 'all') {
      return products
    }

    // Buscar el departamento seleccionado en la configuración
    const selectedDept = config.find(dept => dept.id === selectedDepartment)
    if (!selectedDept || !selectedDept.categories) {
      return products
    }

    // Extraer los IDs de categorías del departamento seleccionado
    const categoryIds = selectedDept.categories.map(cat => cat.id)

    // Filtrar productos que pertenezcan a esas categorías
    return products.filter(product => 
      product.category_id && categoryIds.includes(product.category_id)
    )
  }, [products, selectedDepartment, config])

  const getDepartmentName = () => {
    if (!selectedDepartment || selectedDepartment === 'all') {
      return 'Todos los productos'
    }

    const selectedDept = config.find(dept => dept.id === selectedDepartment)
    return selectedDept ? selectedDept.name : 'Departamento desconocido'
  }

  const getDepartmentStats = () => {
    if (!selectedDepartment || selectedDepartment === 'all') {
      return {
        total: products.length,
        filtered: products.length,
        categories: new Set(products.map(p => p.category_id).filter(Boolean)).size
      }
    }

    const selectedDept = config.find(dept => dept.id === selectedDepartment)
    const categoryIds = selectedDept?.categories.map(cat => cat.id) || []

    return {
      total: products.length,
      filtered: filteredProducts.length,
      categories: categoryIds.length,
      departmentCategories: selectedDept?.categories || []
    }
  }

  return {
    filteredProducts,
    departmentName: getDepartmentName(),
    departmentStats: getDepartmentStats(),
    selectedDepartment,
    isFiltered: selectedDepartment !== 'all'
  }
}