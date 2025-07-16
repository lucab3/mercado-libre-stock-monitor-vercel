import React, { useState, useEffect } from 'react'
import { useAppContext } from '../../context/AppContext'
import { apiService } from '../../services/api'

function SettingsSection() {
  const { settings, actions } = useAppContext()
  const [alertSettings, setAlertSettings] = useState({
    criticalThreshold: 0,
    warningThreshold: 5,
    enableEmailAlerts: false,
    enablePushNotifications: true
  })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadAlertSettings()
  }, [])

  const loadAlertSettings = async () => {
    try {
      setLoading(true)
      const response = await apiService.getAlertSettings()
      if (response.settings) {
        setAlertSettings(response.settings)
      }
    } catch (error) {
      console.error('Error cargando configuración:', error)
      actions.setError('settings', error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveSettings = async () => {
    try {
      setSaving(true)
      await apiService.updateAlertSettings(alertSettings)
      
      // Actualizar configuración local también
      actions.setSettings({
        popupsEnabled: alertSettings.enablePushNotifications,
        criticalOnly: alertSettings.criticalThreshold > 0
      })
      
      // Mostrar mensaje de éxito
      alert('Configuración guardada correctamente')
    } catch (error) {
      console.error('Error guardando configuración:', error)
      actions.setError('settings', error.message)
    } finally {
      setSaving(false)
    }
  }

  const handleInputChange = (field, value) => {
    setAlertSettings(prev => ({
      ...prev,
      [field]: value
    }))
  }

  if (loading) {
    return (
      <div className="text-center py-4">
        <div className="spinner-border" role="status">
          <span className="visually-hidden">Cargando configuración...</span>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="d-flex justify-content-between flex-wrap flex-md-nowrap align-items-center pt-3 pb-2 mb-3 border-bottom">
        <h1 className="h2">Configuración</h1>
      </div>

      <div className="row">
        <div className="col-md-8">
          <div className="card">
            <div className="card-header">
              <h5 className="card-title mb-0">Configuración de Alertas</h5>
            </div>
            <div className="card-body">
              <form>
                <div className="row mb-3">
                  <div className="col-md-6">
                    <label htmlFor="criticalThreshold" className="form-label">
                      Umbral crítico (stock)
                    </label>
                    <input
                      type="number"
                      className="form-control"
                      id="criticalThreshold"
                      value={alertSettings.criticalThreshold}
                      onChange={(e) => handleInputChange('criticalThreshold', parseInt(e.target.value))}
                      min="0"
                    />
                    <div className="form-text">
                      Cantidad de stock por debajo de la cual se considera crítico
                    </div>
                  </div>
                  <div className="col-md-6">
                    <label htmlFor="warningThreshold" className="form-label">
                      Umbral de advertencia (stock)
                    </label>
                    <input
                      type="number"
                      className="form-control"
                      id="warningThreshold"
                      value={alertSettings.warningThreshold}
                      onChange={(e) => handleInputChange('warningThreshold', parseInt(e.target.value))}
                      min="0"
                    />
                    <div className="form-text">
                      Cantidad de stock por debajo de la cual se considera advertencia
                    </div>
                  </div>
                </div>

                <div className="mb-3">
                  <div className="form-check">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id="enableEmailAlerts"
                      checked={alertSettings.enableEmailAlerts}
                      onChange={(e) => handleInputChange('enableEmailAlerts', e.target.checked)}
                    />
                    <label className="form-check-label" htmlFor="enableEmailAlerts">
                      Habilitar alertas por email
                    </label>
                  </div>
                </div>

                <div className="mb-3">
                  <div className="form-check">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id="enablePushNotifications"
                      checked={alertSettings.enablePushNotifications}
                      onChange={(e) => handleInputChange('enablePushNotifications', e.target.checked)}
                    />
                    <label className="form-check-label" htmlFor="enablePushNotifications">
                      Habilitar notificaciones push
                    </label>
                  </div>
                </div>

                <div className="d-grid gap-2 d-md-flex justify-content-md-end">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleSaveSettings}
                    disabled={saving}
                  >
                    {saving ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                        Guardando...
                      </>
                    ) : (
                      <>
                        <i className="bi bi-check-lg me-2"></i>
                        Guardar configuración
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>

        <div className="col-md-4">
          <div className="card">
            <div className="card-header">
              <h5 className="card-title mb-0">Información</h5>
            </div>
            <div className="card-body">
              <h6>Tipos de alerta</h6>
              <ul className="list-unstyled">
                <li className="mb-2">
                  <i className="bi bi-exclamation-triangle-fill text-danger me-2"></i>
                  <strong>Crítica:</strong> Stock igual o menor al umbral crítico
                </li>
                <li className="mb-2">
                  <i className="bi bi-info-circle-fill text-warning me-2"></i>
                  <strong>Advertencia:</strong> Stock igual o menor al umbral de advertencia
                </li>
                <li className="mb-2">
                  <i className="bi bi-info-circle text-info me-2"></i>
                  <strong>Informativa:</strong> Cambios generales en productos
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SettingsSection