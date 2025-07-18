import { useState, useEffect, useCallback } from 'react'
import { apiService } from '../services/api'

// Cache de categorías en memoria
const categoriesCache = new Map()

export function useCategories(categoryIds = []) {
  const [categories, setCategories] = useState(new Map())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  
  console.log('🏗️ useCategories - render with categories.size:', categories.size, 'categoryIds:', categoryIds.length)

  const fetchCategories = useCallback(async (ids) => {
    if (!ids || ids.length === 0) return

    console.log('🔍 useCategories - fetchCategories called with:', ids)

    // Filtrar IDs que no están en cache
    const uncachedIds = ids.filter(id => !categoriesCache.has(id))
    
    console.log('📦 useCategories - uncachedIds:', uncachedIds)
    console.log('🗂️ useCategories - cache has:', Array.from(categoriesCache.keys()))
    
    if (uncachedIds.length === 0) {
      // Todos están en cache, actualizar estado
      const cached = new Map()
      ids.forEach(id => {
        if (categoriesCache.has(id)) {
          cached.set(id, categoriesCache.get(id))
        }
      })
      setCategories(cached)
      console.log('✅ useCategories - usando cache:', Array.from(cached.entries()))
      return
    }

    try {
      setLoading(true)
      setError(null)
      
      console.log('🌐 useCategories - llamando API para:', uncachedIds)
      const response = await apiService.getCategoriesInfo(uncachedIds)
      console.log('📥 useCategories - respuesta API:', response)
      
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
        console.log('✅ useCategories - categorías finales:', Array.from(allCategories.entries()))
        console.log('🗂️ useCategories - categories state después de setCategories:', allCategories.size)
      } else {
        setError(response.error || 'Error obteniendo categorías')
        console.error('❌ useCategories - error API:', response.error)
      }
    } catch (err) {
      setError(err.message)
      console.error('❌ useCategories - error catch:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  // Enfoque simplificado: solo ejecutar cuando categoryIds cambie
  useEffect(() => {
    console.log('🔄 useCategories - useEffect triggered with categoryIds:', categoryIds.length)
    if (categoryIds.length > 0) {
      console.log('📞 useCategories - calling fetchCategories with', categoryIds.length, 'categories')
      fetchCategories(categoryIds)
    }
  }, [categoryIds.length, fetchCategories]) // Depende de la longitud y del callback

  const getCategoryName = useCallback((categoryId) => {
    if (!categoryId) return categoryId
    
    const category = categories.get(categoryId)
    const result = category ? category.name : categoryId
    
    console.log(`🏷️ getCategoryName(${categoryId}) -> ${result}`, { category, categoriesSize: categories.size })
    
    return result
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