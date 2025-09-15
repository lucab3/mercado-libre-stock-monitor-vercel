import { useState, useEffect } from 'react'
import { linkPreviewService } from '../services/linkPreview'

/**
 * Hook para obtener preview de links de MercadoLibre
 * @param {string} url - URL del producto
 * @param {boolean} enabled - Si debe obtener el preview
 * @returns {Object} Estado del preview
 */
export function useLinkPreview(url, enabled = false) {
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!enabled || !url) {
      setPreview(null)
      setLoading(false)
      setError(null)
      return
    }

    let cancelled = false

    const fetchPreview = async () => {
      setLoading(true)
      setError(null)

      try {
        const previewData = await linkPreviewService.getPreviewData(url)

        if (!cancelled) {
          setPreview(previewData)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message)
          setPreview(null)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    // Delay pequeño para evitar requests innecesarios
    const timeoutId = setTimeout(fetchPreview, 300)

    return () => {
      cancelled = true
      clearTimeout(timeoutId)
    }
  }, [url, enabled])

  return {
    preview,
    loading,
    error,
    hasPreview: !!preview && preview.success
  }
}