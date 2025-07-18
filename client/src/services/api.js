const API_BASE_URL = import.meta.env.DEV ? 'http://localhost:3000' : ''

class ApiService {
  async request(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`
    const config = {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    }

    const response = await fetch(url, config)

    if (!response.ok) {
      if (response.status === 401) {
        window.location.href = '/login'
        return
      }
      throw new Error(`Error ${response.status}: ${response.statusText}`)
    }

    return response.json()
  }

  // Products
  async getProducts() {
    return this.request('/api/products')
  }

  async getProductStats() {
    return this.request('/api/products/stats')
  }

  // Alerts
  async getAlerts(filters = {}) {
    const params = new URLSearchParams()
    
    if (filters.priority && filters.priority !== 'all') {
      params.append('priority', filters.priority)
    }
    if (filters.page !== undefined) {
      params.append('page', filters.page)
    }
    if (filters.limit) {
      params.append('limit', filters.limit)
    }

    const query = params.toString()
    return this.request(`/api/stock-alerts${query ? `?${query}` : ''}`)
  }

  async getAlertStats() {
    return this.request('/api/stock-alerts/stats')
  }

  // Alert Settings
  async getAlertSettings() {
    return this.request('/api/alert-settings')
  }

  async updateAlertSettings(settings) {
    return this.request('/api/alert-settings', {
      method: 'POST',
      body: JSON.stringify(settings)
    })
  }

  // Monitoring
  async startMonitoring() {
    return this.request('/api/monitor/start', {
      method: 'POST'
    })
  }

  async stopMonitoring() {
    return this.request('/api/monitor/stop', {
      method: 'POST'
    })
  }

  async getMonitorStatus() {
    return this.request('/api/monitor/status')
  }

  async syncProducts() {
    return this.request('/api/monitor/sync', {
      method: 'POST'
    })
  }

  async syncInitial() {
    return this.request('/api/sync-initial')
  }

  async syncNext() {
    return this.request('/api/sync-next')
  }

  async getCategoriesInfo(categoryIds) {
    return this.request('/api/categories/info', {
      method: 'POST',
      body: JSON.stringify({ categoryIds })
    })
  }
}

export const apiService = new ApiService()