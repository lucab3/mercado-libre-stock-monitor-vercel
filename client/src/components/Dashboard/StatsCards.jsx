import React from 'react'

function StatsCards({ stats, alerts }) {
  const criticalAlerts = alerts.filter(alert => alert.priority === 'critical').length
  const warningAlerts = alerts.filter(alert => alert.priority === 'warning').length
  const lowStockProducts = stats?.lowStockProducts || 0
  const totalProducts = stats?.totalProducts || 0

  const cards = [
    {
      title: 'Total Productos',
      value: totalProducts,
      icon: 'bi-box',
      color: 'primary',
      description: 'Productos monitoreados'
    },
    {
      title: 'Stock Bajo',
      value: lowStockProducts,
      icon: 'bi-exclamation-triangle',
      color: 'warning',
      description: 'Productos con stock bajo'
    },
    {
      title: 'Alertas Críticas',
      value: criticalAlerts,
      icon: 'bi-bell-fill',
      color: 'danger',
      description: 'Requieren atención inmediata'
    },
    {
      title: 'Advertencias',
      value: warningAlerts,
      icon: 'bi-info-circle',
      color: 'info',
      description: 'Alertas de seguimiento'
    }
  ]

  return (
    <div className="row">
      {cards.map((card, index) => (
        <div key={index} className="col-xl-3 col-md-6 mb-4">
          <div className={`card border-left-${card.color} shadow h-100 py-2`}>
            <div className="card-body">
              <div className="row no-gutters align-items-center">
                <div className="col mr-2">
                  <div className={`text-xs font-weight-bold text-${card.color} text-uppercase mb-1`}>
                    {card.title}
                  </div>
                  <div className="h5 mb-0 font-weight-bold text-gray-800">
                    {card.value}
                  </div>
                  <div className="text-muted small">
                    {card.description}
                  </div>
                </div>
                <div className="col-auto">
                  <i className={`${card.icon} fa-2x text-gray-300`}></i>
                </div>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export default StatsCards