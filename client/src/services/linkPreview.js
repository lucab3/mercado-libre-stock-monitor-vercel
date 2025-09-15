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
   * Extrae metadatos usando múltiples estrategias
   * @param {string} url
   * @returns {Promise<Object>}
   */
  async fetchMetadata(url) {
    try {
      // Timeout general de 3 segundos
      return await Promise.race([
        this.fetchMetadataInternal(url),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), 3000)
        )
      ])
    } catch (error) {
      console.warn('Error obteniendo preview de ML:', error)
      return this.generateFallbackData(url)
    }
  }

  async fetchMetadataInternal(url) {
    // Primero intentar generar imagen directamente desde el ID del producto
    const directImage = this.generateDirectImageFromUrl(url)

    if (directImage) {
      return {
        url,
        title: this.extractTitleFromUrl(url),
        description: 'Producto de MercadoLibre',
        image: directImage,
        site_name: 'MercadoLibre',
        success: true,
        method: 'direct'
      }
    }

    // Si no hay imagen directa, intentar con proxy CORS
    return await this.fetchWithProxy(url)
  }

  /**
   * Intenta obtener metadatos con proxy CORS
   * @param {string} url
   * @returns {Promise<Object>}
   */
  async fetchWithProxy(url) {
    try {
      // Intentar múltiples proxies
      const proxies = [
        `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
        `https://corsproxy.io/?${encodeURIComponent(url)}`,
        `https://cors-anywhere.herokuapp.com/${url}`
      ]

      for (const proxyUrl of proxies) {
        try {
          const response = await fetch(proxyUrl, {
            timeout: 5000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; LinkPreview/1.0)'
            }
          })

          if (response.ok) {
            const data = await response.json()
            const html = data.contents || data.data

            if (html) {
              const metadata = this.extractMetadata(html)

              if (metadata.image) {
                return {
                  url,
                  title: metadata.title,
                  description: metadata.description,
                  image: metadata.image,
                  price: metadata.price,
                  site_name: metadata.site_name || 'MercadoLibre',
                  success: true,
                  method: 'proxy'
                }
              }
            }
          }
        } catch (proxyError) {
          console.warn(`Proxy ${proxyUrl} falló:`, proxyError)
          continue
        }
      }

      throw new Error('Todos los proxies fallaron')
    } catch (error) {
      throw error
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
   * Genera imagen directamente desde la URL del producto
   * @param {string} url
   * @returns {string|null}
   */
  generateDirectImageFromUrl(url) {
    try {
      // Extraer ID del producto de diferentes formatos de URL
      const patterns = [
        /\/MLA-?(\d+)-/,           // MLA-123456-nombre-producto
        /\/MLA(\d+)/,              // MLA123456
        /articulo\.mercadolibre\.com\.ar\/([A-Z]{3}\d+)/  // Formato completo
      ]

      let productId = null

      for (const pattern of patterns) {
        const match = url.match(pattern)
        if (match) {
          productId = match[1]
          break
        }
      }

      if (!productId) return null

      // Generar múltiples formatos posibles de imagen
      const imageFormats = [
        `https://http2.mlstatic.com/D_NQ_NP_${productId}-MLA${productId}-O.webp`,
        `https://http2.mlstatic.com/D_NQ_NP_${productId}-MLA${productId}-V.webp`,
        `https://http2.mlstatic.com/D_${productId}-MLA${productId}_${productId}-O.jpg`,
        `https://http2.mlstatic.com/D_${productId}-MLA${productId}_${productId}-I.jpg`
      ]

      // Retornar el primer formato (más probable)
      return imageFormats[0]

    } catch (error) {
      console.warn('Error generando imagen directa:', error)
      return null
    }
  }

  /**
   * Verifica si una imagen existe haciendo un HEAD request
   * @param {string} imageUrl
   * @returns {Promise<boolean>}
   */
  async verifyImageExists(imageUrl) {
    try {
      const response = await fetch(imageUrl, {
        method: 'HEAD',
        mode: 'no-cors' // Evitar problemas CORS
      })

      // En modo no-cors, response.ok no es confiable
      // Pero si llega aquí sin error, probablemente existe
      return true

    } catch (error) {
      // Si hay error, la imagen probablemente no existe
      return false
    }
  }

  /**
   * Extrae el título desde la URL
   * @param {string} url
   * @returns {string}
   */
  extractTitleFromUrl(url) {
    try {
      // Extraer nombre del producto de la URL
      const match = url.match(/MLA-?\d+-([^/?]+)/)
      if (match) {
        return match[1].replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
      }

      // Fallback: usar ID del producto
      const idMatch = url.match(/MLA-?(\d+)/)
      if (idMatch) {
        return `Producto ${idMatch[1]}`
      }

      return 'Producto de MercadoLibre'
    } catch (error) {
      return 'Producto de MercadoLibre'
    }
  }
}

// Singleton
export const linkPreviewService = new LinkPreviewService()