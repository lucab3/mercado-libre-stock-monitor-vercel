import { useState, useEffect, useCallback } from 'react'
import { apiService } from '../services/api'

// Cache de categorías en memoria
const categoriesCache = new Map()

export function useCategories(categoryIds = []) {
  const [categories, setCategories] = useState(new Map())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const fetchCategories = useCallback(async (ids) => {
    if (!ids || ids.length === 0) return

    // Filtrar IDs que no están en cache
    const uncachedIds = ids.filter(id => !categoriesCache.has(id))
    
    if (uncachedIds.length === 0) {
      // Todos están en cache, actualizar estado
      const cached = new Map()
      ids.forEach(id => {
        if (categoriesCache.has(id)) {
          cached.set(id, categoriesCache.get(id))
        }
      })
      setCategories(cached)
      return
    }

    try {
      setLoading(true)
      setError(null)
      
      const response = await apiService.getCategoriesInfo(uncachedIds)
      
      if (response.success) {
        // Actualizar cache
        Object.entries(response.categories).forEach(([id, info]) => {
          categoriesCache.set(id, info)
        })
        
        // Actualizar estado con todas las categorías (cache + nuevas)
        const allCategories = new Map()
        ids.forEach(id => {
          if (categoriesCache.has(id)) {
            allCategories.set(id, categoriesCache.get(id))
          }
        })
        setCategories(allCategories)
      } else {
        setError(response.error || 'Error obteniendo categorías')
      }
    } catch (err) {
      setError(err.message)
      console.error('Error fetchCategories:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (categoryIds.length > 0) {
      fetchCategories(categoryIds)
    }
  }, [categoryIds, fetchCategories])

  const getCategoryName = useCallback((categoryId) => {
    if (!categoryId) return categoryId
    
    const category = categories.get(categoryId)
    return category ? category.name : categoryId
  }, [categories])

  const getCategoryInfo = useCallback((categoryId) => {
    return categories.get(categoryId) || { id: categoryId, name: categoryId }
  }, [categories])

  return {
    categories,
    loading,
    error,
    getCategoryName,
    getCategoryInfo,
    fetchCategories
  }
}