/**
 * Servicio para obtener previews de links de MercadoLibre
 * Extrae metadatos Open Graph de las URLs de productos
 */

class LinkPreviewService {
  constructor() {
    this.cache = new Map() // Cache para evitar requests repetidos
    this.pendingRequests = new Map() // Para evitar requests duplicados
  }

  /**
   * Obtiene metadatos de una URL de MercadoLibre
   * @param {string} url - URL del producto
   * @returns {Promise<Object>} Metadatos del producto
   */
  async getPreviewData(url) {
    if (!url || !this.isValidMLUrl(url)) {
      return null
    }

    // Verificar cache
    if (this.cache.has(url)) {
      return this.cache.get(url)
    }

    // Verificar si ya hay un request pendiente para esta URL
    if (this.pendingRequests.has(url)) {
      return this.pendingRequests.get(url)
    }

    // Crear nuevo request
    const requestPromise = this.fetchMetadata(url)
    this.pendingRequests.set(url, requestPromise)

    try {
      const result = await requestPromise

      // Guardar en cache
      this.cache.set(url, result)

      // Limpiar cache después de 10 minutos
      setTimeout(() => {
        this.cache.delete(url)
      }, 10 * 60 * 1000)

      return result
    } finally {
      this.pendingRequests.delete(url)
    }
  }

  /**
   * Verifica si la URL es válida de MercadoLibre
   * @param {string} url
   * @returns {boolean}
   */
  isValidMLUrl(url) {
    const mlDomains = [
      'articulo.mercadolibre.com.ar',
      'articulo.mercadolibre.com.mx',
      'articulo.mercadolibre.com.co',
      'produto.mercadolivre.com.br'
    ]

    try {
      const urlObj = new URL(url)
      return mlDomains.some(domain => urlObj.hostname === domain)
    } catch {
      return false
    }
  }

  /**
   * Extrae metadatos usando un servicio de proxy CORS
   * @param {string} url
   * @returns {Promise<Object>}
   */
  async fetchMetadata(url) {
    try {
      // Usar un servicio de proxy CORS para obtener el HTML
      const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`

      const response = await fetch(proxyUrl)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const data = await response.json()
      const html = data.contents

      // Extraer metadatos Open Graph
      const metadata = this.extractMetadata(html)

      return {
        url,
        title: metadata.title,
        description: metadata.description,
        image: metadata.image,
        price: metadata.price,
        site_name: metadata.site_name || 'MercadoLibre',
        success: true
      }

    } catch (error) {
      console.warn('Error obteniendo preview de ML:', error)

      // Fallback: generar datos básicos desde la URL
      return this.generateFallbackData(url)
    }
  }

  /**
   * Extrae metadatos Open Graph del HTML
   * @param {string} html
   * @returns {Object}
   */
  extractMetadata(html) {
    const metadata = {}

    // Regex para extraer meta tags
    const metaRegex = /<meta\s+(?:property|name)="([^"]+)"\s+content="([^"]*)"[^>]*>/gi
    let match

    while ((match = metaRegex.exec(html)) !== null) {
      const [, property, content] = match

      switch (property) {
        case 'og:title':
        case 'title':
          if (!metadata.title) metadata.title = content
          break
        case 'og:description':
        case 'description':
          if (!metadata.description) metadata.description = content
          break
        case 'og:image':
        case 'twitter:image':
          if (!metadata.image) metadata.image = content
          break
        case 'og:site_name':
          metadata.site_name = content
          break
        case 'product:price:amount':
          metadata.price = content
          break
      }
    }

    return metadata
  }

  /**
   * Genera datos básicos cuando falla la extracción
   * @param {string} url
   * @returns {Object}
   */
  generateFallbackData(url) {
    // Extraer ID del producto de la URL
    const mlIdMatch = url.match(/MLA?-?(\d+)/)
    const productId = mlIdMatch ? mlIdMatch[1] : 'Producto'

    return {
      url,
      title: `Producto ${productId}`,
      description: 'Ver en MercadoLibre',
      image: null,
      site_name: 'MercadoLibre',
      success: false,
      fallback: true
    }
  }

  /**
   * Genera imagen de producto desde el ID si es posible
   * @param {string} productId
   * @returns {string|null}
   */
  generateImageUrl(productId) {
    if (!productId) return null

    // Formato típico de imágenes de ML (puede no funcionar siempre)
    return `https://http2.mlstatic.com/D_NQ_NP_${productId}-MLA${productId}_${productId}-I.jpg`
  }
}

// Singleton
export const linkPreviewService = new LinkPreviewService()