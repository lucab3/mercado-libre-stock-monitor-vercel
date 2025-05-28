# 📦 Monitor de Stock para Mercado Libre

Una aplicación web para monitorear automáticamente el stock de productos de Mercado Libre con alertas en tiempo real.

![Version](https://img.shields.io/badge/version-1.0.1-blue.svg)
![Node.js](https://img.shields.io/badge/node.js-18%2B-green.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

## ✨ Características

- **🔍 Monitoreo automático** de stock de productos
- **📧 Alertas en tiempo real** cuando el stock es bajo
- **📊 Dashboard interactivo** con métricas en tiempo real
- **🎭 Modo mock** para testing sin credenciales reales
- **🔄 Stock dinámico** que simula cambios automáticos
- **⚡ Optimizado para Vercel** (plan gratuito)
- **📱 Responsive** - funciona en móvil y desktop

## 🚀 Demo Rápido

1. Clona el repositorio
2. Ejecuta `npm run dev:mock`
3. Abre http://localhost:3000
4. ¡Ve el stock cambiando automáticamente!

## 📋 Requisitos

- **Node.js** 18 o superior
- **npm** o **yarn**
- Cuenta de **Mercado Libre** (para uso real)
- **Vercel CLI** (para deployment)

## 🛠️ Instalación

### 1. Clonar el repositorio

```bash
git clone https://github.com/tu-usuario/mercadolibre-stock-monitor.git
cd mercadolibre-stock-monitor
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Configurar variables de entorno

Crea un archivo `.env.local`:

```env
# Configuración de la aplicación
NODE_ENV=development
PORT=3000

# OPCIÓN A: Modo Mock (Para testing sin credenciales)
MOCK_ML_API=true

# OPCIÓN B: Modo Real (Necesitas credenciales de ML)
MOCK_ML_API=false
ML_CLIENT_ID=tu_client_id_aqui
ML_CLIENT_SECRET=tu_client_secret_aqui
ML_REDIRECT_URI=http://localhost:3000/auth/callback

# Configuración de monitoreo
STOCK_THRESHOLD=5
CHECK_INTERVAL=900000

# Configuración de notificaciones (opcional)
WEBHOOK_URL=https://hooks.slack.com/tu-webhook
```

## 🧪 Testing Local

### Modo Mock (Recomendado para desarrollo local)

```bash
# Inicia en modo mock con stock dinámico
npm run dev:mock
```

**¿Qué incluye el modo mock?**
- 12 productos de ejemplo
- Stock que cambia automáticamente cada 30 segundos
- Alertas funcionales
- Dashboard completo
- **No necesita credenciales de ML** ni internet

> **💡 Importante:** Para desarrollo local siempre usa modo mock, ya que Mercado Libre no permite URLs de localhost como redirect URI. Las credenciales reales solo funcionan con aplicaciones deployadas.

### Modo Real (Solo en producción deployada)

El modo real con credenciales de Mercado Libre **solo funciona cuando la aplicación está deployada** en un servidor público como Vercel, ya que ML requiere URLs públicas para el OAuth.

```bash
# Solo funciona en producción deployada
npm run dev
```

## 📱 Uso de la Aplicación

### Dashboard Principal

El dashboard muestra:
- **Estado del monitoreo** (activo/inactivo)
- **Resumen de productos** y stock bajo
- **Lista de productos** con stock crítico
- **Controles de monitoreo**

### Controles Disponibles

| Botón | Función |
|-------|---------|
| **▶️ Iniciar monitoreo** | Activa el monitoreo automático |
| **⏹️ Detener monitoreo** | Pausa el monitoreo |
| **🔍 Verificar ahora** | Fuerza una verificación inmediata |
| **🔀 Forzar cambios** | Simula cambios de stock (solo modo mock) |
| **📊 Ver estadísticas** | Muestra estadísticas detalladas |
| **🔄 Actualizar estado** | Refresca la información |

### Verificación Individual

Cada producto tiene un botón **"Verificar"** que:
- Obtiene el stock actual en tiempo real
- Muestra información detallada
- Actualiza el estado en el dashboard

## 🔔 Sistema de Alertas

### Cuándo se envían alertas

- Stock ≤ umbral configurado (default: 5 unidades)
- Solo una alerta por producto hasta que se resuelva
- Alertas por webhook/email (configurable)

### Configurar Notificaciones

**Slack:**
```env
WEBHOOK_URL=https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX
```

**Email (SMTP):**
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tu-email@gmail.com
SMTP_PASS=tu-password
ALERT_EMAIL=alerts@tuempresa.com
```

## 🌐 Deployment en Vercel

> **⚠️ Prerequisito:** Las credenciales de Mercado Libre solo funcionan en aplicaciones deployadas. Mercado Libre no permite URLs de localhost como redirect URI por seguridad.

### Flujo Recomendado:

1. **Desarrollo local:** Usa modo mock (`npm run dev:mock`)
2. **Deploy en Vercel:** Con credenciales reales de ML
3. **Testing en producción:** Con tus productos reales

### Obtener Credenciales de Mercado Libre

**Solo después de tener tu dominio de Vercel:**

1. Ve a [developers.mercadolibre.com](https://developers.mercadolibre.com)
2. **Login** con tu cuenta de ML (debes ser vendedor)
3. **"Crear aplicación"**
4. Completa los datos:
   - **Nombre:** "Monitor de Stock"
   - **Descripción:** "Monitoreo automático de inventario"
   - **URL del sitio:** `https://tu-app.vercel.app`
   - **Redirect URI:** `https://tu-app.vercel.app/auth/callback` ⚡ **Debe ser HTTPS**
5. **Guardar** y copiar `CLIENT_ID` y `CLIENT_SECRET`

### Preparación

1. **Instala Vercel CLI:**
```bash
npm i -g vercel
```

2. **Login a Vercel:**
```bash
vercel login
```

### Deployment Paso a Paso

1. **Configura el proyecto:**
```bash
vercel
```

2. **Configura variables de entorno en Vercel:**
```bash
# Variables esenciales
vercel env add NODE_ENV
vercel env add MOCK_ML_API
vercel env add ML_CLIENT_ID
vercel env add ML_CLIENT_SECRET
vercel env add ML_REDIRECT_URI
```

3. **Deploy:**
```bash
vercel --prod
```

### Configuración para Vercel

Crea `vercel.json`:

```json
{
  "version": 2,
  "builds": [
    {
      "src": "src/index.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "src/index.js"
    }
  ],
  "env": {
    "NODE_ENV": "production"
  }
}
```

### Variables de Entorno en Vercel

Ve a tu proyecto en vercel.com → Settings → Environment Variables:

| Variable | Valor | Descripción |
|----------|-------|-------------|
| `NODE_ENV` | `production` | Entorno de producción |
| `MOCK_ML_API` | `false` | Usar API real de ML |
| `ML_CLIENT_ID` | `tu_client_id` | ID de tu app de ML |
| `ML_CLIENT_SECRET` | `tu_secret` | Secret de tu app de ML |
| `ML_REDIRECT_URI` | `https://tu-app.vercel.app/auth/callback` | URL de callback |

## 🔧 Configuración Avanzada

### Personalizar Umbral de Stock

```env
STOCK_THRESHOLD=3  # Alertar cuando stock ≤ 3
```

### Intervalo de Verificación

```env
CHECK_INTERVAL=600000  # 10 minutos (en milisegundos)
```

### Modo Mock Personalizado

Edita `src/api/mock-ml-api.js` para:
- Agregar más productos
- Cambiar frecuencia de cambios de stock
- Personalizar rangos de stock

## 📊 API Endpoints

### Públicos

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/health` | GET | Estado del servicio |
| `/api/app-info` | GET | Información de la app |

### Autenticados

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/auth/status` | GET | Estado de autenticación |
| `/api/monitor/start` | POST | Iniciar monitoreo |
| `/api/monitor/stop` | POST | Detener monitoreo |
| `/api/monitor/check-now` | POST | Verificar stock ahora |
| `/api/products/:id/stock` | GET | Stock de producto específico |

### Debug (Solo desarrollo)

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/debug/stock-state` | GET | Estado completo del sistema |
| `/api/debug/trigger-stock-changes` | POST | Forzar cambios de stock |
| `/api/debug/set-change-frequency` | POST | Cambiar frecuencia |

## 🐛 Troubleshooting

### Error: Puerto en uso

```bash
# Verificar qué está usando el puerto
netstat -ano | findstr :3000

# Usar otro puerto
PORT=3001 npm run dev:mock
```

### Error: No se conecta a ML

1. Verifica tus credenciales en `.env.local`
2. Confirma que la URL de callback coincida
3. Revisa que tu app de ML esté activa

### Error: Stock no se actualiza

1. Revisa los logs en la consola
2. Verifica que el monitoreo esté activo
3. Usa "Verificar ahora" para forzar actualización

### Error en Vercel

1. Revisa los logs de build en Vercel
2. Confirma que las variables de entorno estén configuradas
3. Verifica que `vercel.json` esté configurado correctamente

## 📝 Scripts Disponibles

```bash
# Desarrollo
npm run dev          # Modo normal
npm run dev:mock     # Modo mock para testing
npm start           # Producción

# Utilidades
npm run test        # Ejecutar tests
npm run lint        # Verificar código
npm run build       # Build para producción
```

## 🏗️ Estructura del Proyecto

```
mercadolibre-stock-monitor/
├── src/
│   ├── api/
│   │   ├── auth.js              # Autenticación ML OAuth
│   │   ├── products.js          # API de productos
│   │   └── mock-ml-api.js       # Mock API para testing
│   ├── models/
│   │   └── product.js           # Modelo de producto
│   ├── services/
│   │   └── stockMonitor.js      # Servicio de monitoreo
│   ├── utils/
│   │   ├── logger.js           # Sistema de logs
│   │   └── notifier.js         # Sistema de notificaciones
│   ├── public/
│   │   ├── dashboard.html      # Dashboard principal
│   │   └── login.html          # Página de login
│   └── index.js                # Servidor Express
├── config/
│   └── config.js               # Configuración general
├── .env.local                  # Variables de entorno (local)
├── vercel.json                 # Configuración de Vercel
└── package.json               # Dependencias y scripts
```

## 🔒 Seguridad

- **Tokens OAuth** se almacenan de forma segura
- **Variables sensibles** solo en variables de entorno
- **Autenticación requerida** para todas las operaciones
- **Rate limiting** incorporado
- **Logs** no exponen información sensible

## 🤝 Contribuir

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📜 Licencia

Este proyecto está bajo la Licencia MIT - ver el archivo [LICENSE](LICENSE) para detalles.

## 🆘 Soporte

- **Issues:** [GitHub Issues](https://github.com/tu-usuario/mercadolibre-stock-monitor/issues)
- **Docs:** [Wiki del proyecto](https://github.com/tu-usuario/mercadolibre-stock-monitor/wiki)
- **Ejemplos:** [Carpeta examples/](examples/)

## 🙏 Agradecimientos

- [Mercado Libre Developers](https://developers.mercadolibre.com/) por la API
- [Express.js](https://expressjs.com/) por el framework web
- [Bootstrap](https://getbootstrap.com/) por los estilos
- [Vercel](https://vercel.com/) por el hosting gratuito

---

**⭐ Si este proyecto te ayuda, ¡dale una estrella en GitHub!**