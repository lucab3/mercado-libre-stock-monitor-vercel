import React from 'react'
import { useAuthContext } from '../../context/AuthContext'

function LoginPage() {
  const { login, loading, error } = useAuthContext()

  const handleLogin = () => {
    login()
  }

  return (
    <div className="container-fluid vh-100">
      <div className="row h-100">
        <div className="col-12 col-md-6 d-flex align-items-center justify-content-center bg-light">
          <div className="text-center">
            <div className="mb-4">
              <i className="bi bi-graph-up text-primary" style={{ fontSize: '4rem' }}></i>
            </div>
            <h1 className="h3 mb-3 fw-normal">Stock Monitor ML</h1>
            <p className="text-muted mb-4">
              Monitorea el stock de tus productos de MercadoLibre en tiempo real
            </p>
            
            {error && (
              <div className="alert alert-danger" role="alert">
                {error}
              </div>
            )}
            
            <button 
              className="btn btn-primary btn-lg w-100" 
              onClick={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                  Conectando...
                </>
              ) : (
                <>
                  <i className="bi bi-box-arrow-in-right me-2"></i>
                  Conectar con MercadoLibre
                </>
              )}
            </button>
            
            <div className="mt-4">
              <small className="text-muted">
                Necesitas una cuenta de vendedor en MercadoLibre para continuar
              </small>
            </div>
          </div>
        </div>
        
        <div className="col-12 col-md-6 d-none d-md-flex align-items-center justify-content-center bg-primary text-white">
          <div className="text-center">
            <h2 className="mb-4">Características principales</h2>
            <div className="row">
              <div className="col-12 mb-3">
                <i className="bi bi-bell-fill fs-4 mb-2"></i>
                <h5>Alertas en tiempo real</h5>
                <p>Recibe notificaciones instantáneas cuando cambies el stock de tus productos</p>
              </div>
              <div className="col-12 mb-3">
                <i className="bi bi-graph-up-arrow fs-4 mb-2"></i>
                <h5>Dashboard completo</h5>
                <p>Visualiza todos tus productos y su estado de stock en un solo lugar</p>
              </div>
              <div className="col-12 mb-3">
                <i className="bi bi-gear-fill fs-4 mb-2"></i>
                <h5>Configuración personalizada</h5>
                <p>Ajusta las alertas según tus necesidades de negocio</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default LoginPage