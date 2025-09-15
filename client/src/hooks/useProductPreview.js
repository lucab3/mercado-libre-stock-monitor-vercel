import { useState, useCallback, useRef } from 'react'

export function useProductPreview() {
  const [showPreview, setShowPreview] = useState(false)
  const [previewPosition, setPreviewPosition] = useState({ top: 0, left: 0 })
  const hoverTimeoutRef = useRef(null)
  const leaveTimeoutRef = useRef(null)

  const handleMouseEnter = useCallback((event) => {
    // Limpiar timeout de salida si existe
    if (leaveTimeoutRef.current) {
      clearTimeout(leaveTimeoutRef.current)
      leaveTimeoutRef.current = null
    }

    // Agregar delay antes de mostrar el preview
    hoverTimeoutRef.current = setTimeout(() => {
      const rect = event.currentTarget.getBoundingClientRect()
      const viewport = {
        width: window.innerWidth,
        height: window.innerHeight
      }

      // Calcular posición del tooltip
      let top = 0
      let left = rect.right + 10

      // Si el tooltip se sale por la derecha, mostrarlo a la izquierda
      if (left + 350 > viewport.width) {
        left = rect.left - 360
      }

      // Si el tooltip se sale por la izquierda, mantenerlo en pantalla
      if (left < 10) {
        left = 10
      }

      // Centrar verticalmente respecto al elemento
      top = rect.top + (rect.height / 2) - 200 // 200 es aproximadamente la mitad de la altura del tooltip

      // Asegurar que no se salga por arriba
      if (top < 10) {
        top = 10
      }

      // Asegurar que no se salga por abajo
      if (top + 400 > viewport.height) {
        top = viewport.height - 410
      }

      setPreviewPosition({ top, left })
      setShowPreview(true)
    }, 500) // 500ms de delay antes de mostrar
  }, [])

  const handleMouseLeave = useCallback(() => {
    // Limpiar timeout de entrada si existe
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
      hoverTimeoutRef.current = null
    }

    // Agregar delay antes de ocultar el preview
    leaveTimeoutRef.current = setTimeout(() => {
      setShowPreview(false)
    }, 100) // 100ms de delay antes de ocultar
  }, [])

  const forceHide = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
      hoverTimeoutRef.current = null
    }
    if (leaveTimeoutRef.current) {
      clearTimeout(leaveTimeoutRef.current)
      leaveTimeoutRef.current = null
    }
    setShowPreview(false)
  }, [])

  return {
    showPreview,
    previewPosition,
    handleMouseEnter,
    handleMouseLeave,
    forceHide
  }
}