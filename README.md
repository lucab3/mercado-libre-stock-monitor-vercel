# 📦 Monitor de Stock Inteligente para Mercado Libre

Una aplicación web avanzada para monitorear automáticamente el stock de productos de Mercado Libre con sistema de alertas en tiempo real, filtros inteligentes por departamentos y categorías múltiples.

![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)
![Node.js](https://img.shields.io/badge/node.js-18%2B-green.svg)
![React](https://img.shields.io/badge/react-18%2B-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Vercel](https://img.shields.io/badge/vercel-ready-black.svg)
![Supabase](https://img.shields.io/badge/supabase-ready-green.svg)

## ✨ Características Principales

### 🎯 **Monitoreo Inteligente**
- **🔄 Webhooks en tiempo real** - Actualizaciones instantáneas vía webhooks de MercadoLibre
- **📊 Dashboard interactivo** con métricas y estadísticas en vivo
- **🔔 Sistema de alertas** multi-canal (email, webhooks personalizados)
- **📈 Análisis de tendencias** de stock y ventas

### 🏷️ **Sistema de Filtros Avanzado**
- **🏢 Departamentos configurables** - Agrupa productos por categorías (ej: Automotriz, Electrodomésticos)
- **☑️ Selección múltiple de categorías** - Filtra por varias categorías simultáneamente
- **🔍 Búsqueda inteligente** por nombre, SKU o ID
- **📋 Filtros dinámicos** por nivel de stock específico

### 🏗️ **Arquitectura Moderna**
- **⚡ React 18** con hooks modernos y context API
- **🎨 Bootstrap 5** con diseño responsive y accesible
- **🗄️ Supabase** como base de datos PostgreSQL en la nube
- **☁️ Vercel** para deployment automático y edge functions
- **📱 PWA Ready** - Funciona como aplicación nativa

### 🔒 **Seguridad y Escalabilidad**
- **🔐 Autenticación OAuth2** con MercadoLibre
- **🛡️ Rate limiting** y protección CSRF
- **📝 Logs estructurados** con diferentes niveles
- **🔄 Manejo de errores** robusto y recuperación automática

## 🚀 Capacidades y Límites del Sistema

### 📊 **Con Planes Gratuitos (Supabase + Vercel)**

#### **👥 Usuarios Simultáneos**
- **Vercel (Free):** 100GB de ancho de banda/mes
- **Estimación:** ~1,000-5,000 usuarios/mes dependiendo del uso
- **Requests concurrentes:** ~10-50 simultáneas

#### **📦 Productos por Usuario**
- **Supabase (Free):** 500MB de almacenamiento
- **Capacidad estimada:** ~10,000-50,000 productos por usuario
- **Base de datos:** PostgreSQL con 2GB de almacenamiento compartido

#### **⚡ Serverless Functions**
- **Vercel (Free):** 12 funciones serverless máximo
- **Nuestra app:** 9 funciones (dentro del límite)
- **Invocaciones:** 100,000/mes incluidas

#### **🔄 Actualizaciones en Tiempo Real**
- **Webhooks ilimitados** (MercadoLibre no cobra por webhooks)
- **Procesamiento:** Inmediato via edge functions
- **Latencia:** <100ms para actualizaciones

### 💰 **Escalabilidad y Costos**

#### **🚀 Para Pequeñas Empresas (1-5 usuarios, ~1,000 productos)**
**Plan recomendado:** Gratuito
- **Costo:** $0/mes
- **Límites:** Suficientes para operación normal
- **Upgrade necesario cuando:** >500MB datos o >100GB tráfico/mes

#### **🏢 Para Empresas Medianas (5-20 usuarios, ~10,000 productos)**
**Supabase Pro + Vercel Pro:**
- **Supabase Pro:** $25/mes (8GB storage, 100GB bandwidth)
- **Vercel Pro:** $20/mes (1TB bandwidth, functions ilimitadas)
- **Total:** ~$45/mes
- **Beneficios:** Mayor storage, soporte prioritario, métricas avanzadas

#### **🏭 Para Grandes Empresas (20+ usuarios, 100,000+ productos)**
**Supabase Team + Vercel Enterprise:**
- **Supabase Team:** $599/mes (200GB storage, 1TB bandwidth)
- **Vercel Enterprise:** Desde $400/mes (custom limits)
- **Total:** ~$1,000+/mes
- **Beneficios:** SLA garantizado, soporte 24/7, infrastructure dedicada

## 📋 Requisitos del Sistema

### **💻 Desarrollo Local**
- **Node.js** 18+ (LTS recomendado)
- **npm** 8+ o **yarn** 1.22+
- **Git** para control de versiones

### **☁️ Servicios en la Nube**
- **Cuenta Vercel** (gratuita)
- **Cuenta Supabase** (gratuita)
- **Cuenta MercadoLibre** con productos para vender

### **🔑 APIs Requeridas**
- **MercadoLibre Developers API** (gratuita)
- **Supabase API** (incluida en el plan)

## 🛠️ Instalación y Configuración

### **1. Clonar el Repositorio**

```bash
git clone https://github.com/tu-usuario/mercado-libre-stock-monitor-vercel.git
cd mercado-libre-stock-monitor-vercel
```

### **2. Instalar Dependencias**

```bash
# Backend
npm install

# Frontend
cd client
npm install
cd ..
```

### **3. Configurar Supabase**

1. Crear proyecto en [supabase.com](https://supabase.com)
2. Ir a Settings → API
3. Copiar Project URL y anon public key
4. Ejecutar las migraciones SQL (ver sección Database Schema)

### **4. Configurar Variables de Entorno**

Crear `.env.local`:

```env
# === CONFIGURACIÓN BÁSICA ===
NODE_ENV=development
PORT=3000

# === SUPABASE ===
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_ANON_KEY=tu-clave-publica-aqui
SUPABASE_SERVICE_KEY=tu-service-role-key-aqui

# === MERCADOLIBRE API ===
ML_CLIENT_ID=tu_client_id_aqui
ML_CLIENT_SECRET=tu_client_secret_aqui
ML_REDIRECT_URI=http://localhost:3000/auth/callback

# === CONFIGURACIÓN DE MONITOREO ===
STOCK_THRESHOLD=5
WEBHOOK_SECRET=tu-secret-para-webhooks

# === CONFIGURACIÓN DE ALERTAS ===
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tu-email@gmail.com
SMTP_PASS=tu-app-password
ALERT_EMAIL=alerts@tuempresa.com

# === NOTIFICACIONES ADICIONALES ===
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

### **5. Configurar Base de Datos**

Ejecutar en el SQL Editor de Supabase:

```sql
-- Tabla de usuarios
CREATE TABLE users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ml_user_id TEXT UNIQUE NOT NULL,
  email TEXT,
  nickname TEXT,
  access_token TEXT,
  refresh_token TEXT,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de productos
CREATE TABLE products (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category_id TEXT,
  price DECIMAL,
  available_quantity INTEGER DEFAULT 0,
  sold_quantity INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  seller_sku TEXT,
  permalink TEXT,
  condition TEXT,
  listing_type_id TEXT,
  health DECIMAL,
  last_webhook_update TIMESTAMP WITH TIME ZONE,
  last_api_sync TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de alertas
CREATE TABLE alerts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  product_id TEXT REFERENCES products(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'low_stock', 'out_of_stock', 'price_change'
  message TEXT NOT NULL,
  severity TEXT DEFAULT 'warning', -- 'info', 'warning', 'critical'
  is_read BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de sesiones
CREATE TABLE user_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_token TEXT UNIQUE NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para optimización
CREATE INDEX idx_products_user_id ON products(user_id);
CREATE INDEX idx_products_stock ON products(available_quantity);
CREATE INDEX idx_alerts_user_id ON alerts(user_id);
CREATE INDEX idx_alerts_unread ON alerts(user_id, is_read);
CREATE INDEX idx_sessions_token ON user_sessions(session_token);
CREATE INDEX idx_sessions_user ON user_sessions(user_id);

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers para updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

## 🚀 Ejecución

### **💻 Desarrollo Local**

```bash
# Terminal 1: Backend
npm run dev

# Terminal 2: Frontend  
cd client
npm run dev
```

La aplicación estará disponible en:
- **Frontend:** http://localhost:5173
- **Backend API:** http://localhost:3000

### **📱 Funcionalidades del Dashboard**

#### **🏠 Página Principal**
- **📊 Cards de estadísticas:** Total productos, stock bajo, productos activos/pausados
- **🏢 Botones de departamentos:** Filtros rápidos por grupos de categorías
- **☑️ Selector de categorías múltiples:** Filtro avanzado con checkboxes
- **📋 Tabla de productos:** Lista filtrable con paginación

#### **🔍 Sistema de Filtros**

**Departamentos:**
```javascript
// Ejemplo de configuración de departamentos
{
  "departments": [
    {
      "id": "automotriz", 
      "name": "Automotriz",
      "categories": ["MLM1744", "MLM1745", "MLM1746"]
    },
    {
      "id": "electrodomesticos",
      "name": "Electrodomésticos", 
      "categories": ["MLM1000", "MLM1001", "MLM1002"]
    }
  ]
}
```

**Categorías Múltiples:**
- ☑️ Selección individual con checkboxes
- 🔄 Botones "Todas/Ninguna" para selección rápida
- 🏷️ Badges visuales de categorías seleccionadas
- ❌ Eliminación individual de filtros

#### **⚙️ Configuración Avanzada**
- **🏢 Gestión de departamentos:** Crear/editar/eliminar departamentos
- **🔔 Configuración de alertas:** Umbrales personalizados por producto
- **📧 Notificaciones:** Email, Slack, Discord, webhooks custom

## 🌐 Deployment en Vercel

### **📋 Preparación**

1. **Instalar Vercel CLI:**
```bash
npm i -g vercel
```

2. **Configurar aplicación en MercadoLibre:**
   - URL del sitio: `https://tu-app.vercel.app`
   - Redirect URI: `https://tu-app.vercel.app/auth/callback`

### **🚀 Deployment**

```bash
# Inicializar proyecto
vercel

# Configurar variables de entorno
vercel env add SUPABASE_URL
vercel env add SUPABASE_ANON_KEY
vercel env add ML_CLIENT_ID
vercel env add ML_CLIENT_SECRET
# ... resto de variables

# Deploy a producción
vercel --prod
```

### **⚙️ Configuración de Webhooks**

Después del deployment, configurar webhook en MercadoLibre:

```bash
curl -X POST \
  https://api.mercadolibre.com/applications/YOUR_APP_ID/notifications \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "topic": "items",
    "callback_url": "https://tu-app.vercel.app/api/webhooks/ml"
  }'
```

## 📊 Arquitectura del Sistema

La aplicación sigue una arquitectura moderna full-stack:

### **🏗️ Estructura de Carpetas**

```
mercado-libre-stock-monitor-vercel/
├── 📁 client/                    # Frontend React
│   ├── 📁 src/
│   │   ├── 📁 components/        # Componentes React
│   │   │   ├── 📁 Dashboard/     # Dashboard principal
│   │   │   ├── 📁 Auth/          # Autenticación
│   │   │   └── 📁 Settings/      # Configuración
│   │   ├── 📁 context/           # React Context (estado global)
│   │   ├── 📁 hooks/             # Custom hooks
│   │   ├── 📁 services/          # API calls
│   │   └── 📁 utils/             # Utilidades
│   └── 📄 package.json
├── 📁 src/                       # Backend Node.js
│   ├── 📁 api/                   # Serverless functions
│   │   ├── 📄 products-api.js    # CRUD productos
│   │   ├── 📄 alerts.js          # Sistema alertas
│   │   ├── 📄 departments.js     # Gestión departamentos
│   │   └── 📄 sync-next.js       # Sincronización ML
│   ├── 📁 services/              # Lógica de negocio
│   │   ├── 📄 databaseService.js # Supabase operations
│   │   ├── 📄 webhookProcessor.js# Procesamiento webhooks
│   │   └── 📄 stockMonitor.js    # Monitoreo stock
│   ├── 📁 routes/                # Express routes
│   ├── 📁 middleware/            # Middlewares
│   ├── 📁 utils/                 # Utilidades backend
│   └── 📄 app.js                 # Express app
├── 📄 vercel.json               # Configuración Vercel
├── 📄 package.json              # Dependencias backend
└── 📄 README.md                 # Esta documentación
```

### **🔄 Flujo de Datos**

1. **Usuario** → Frontend React
2. **Frontend** → API Routes (Express/Vercel)
3. **API Routes** → Supabase Database
4. **MercadoLibre** → Webhooks → Procesamiento
5. **Cambios** → Real-time updates → Frontend

### **⚡ Serverless Functions (9/12 límite Vercel)**

| Function | Propósito | Frecuencia de Uso |
|----------|-----------|-------------------|
| `products-api.js` | CRUD productos | Alta |
| `alerts.js` | Gestión alertas | Media |
| `departments.js` | Config departamentos | Baja |
| `alert-settings.js` | Config alertas | Baja |
| `sync-next.js` | Sync incremental | Media |
| `products.js` | Sync completo ML | Baja |
| `categories/info.js` | Nombres categorías | Media |
| `index.js` (main) | App principal | Alta |
| `healthcheck` | Monitor sistema | Baja |

## 🔧 API Endpoints

### **🔓 Públicos**
- `GET /health` - Estado del servicio
- `POST /api/webhooks/ml` - Webhook MercadoLibre

### **🔐 Autenticados**
- `GET /api/products` - Lista productos
- `GET /api/products/stats` - Estadísticas
- `GET /api/alerts` - Lista alertas
- `POST /api/alerts/mark-read` - Marcar como leída
- `GET /api/departments` - Config departamentos
- `POST /api/departments/save` - Guardar departamentos
- `GET /api/sync-next` - Sincronización incremental

### **📊 Respuestas API**

**Productos:**
```json
{
  "products": [
    {
      "id": "MLM123456789",
      "title": "iPhone 13 Pro Max",
      "available_quantity": 5,
      "price": 25999.99,
      "status": "active",
      "category_id": "MLM1055",
      "seller_sku": "IPHONE-13-PM-256",
      "updated_at": "2024-01-15T10:30:00Z"
    }
  ],
  "total": 150,
  "showing": 10
}
```

**Estadísticas:**
```json
{
  "success": true,
  "totalProducts": 150,
  "lowStockProducts": 12,
  "activeProducts": 145,
  "pausedProducts": 5,
  "lastSync": 1705312200000,
  "timestamp": "2024-01-15T10:30:00Z"
}
```

## 🔔 Sistema de Alertas

### **📧 Configuración Email (SMTP)**

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tu-email@gmail.com
SMTP_PASS=tu-app-password  # No tu password normal
ALERT_EMAIL=alerts@tuempresa.com
```

**Para Gmail:** Usar App Passwords, no tu contraseña normal.

### **💬 Integración Slack**

```env
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX
```

Configurar en tu workspace de Slack:
1. Apps → Incoming Webhooks
2. Add to Slack
3. Choose channel
4. Copy Webhook URL

### **🎮 Integración Discord**

```env
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/123456789012345678/AbCdEfGhIjKlMnOpQrStUvWxYz1234567890
```

### **🔗 Webhooks Personalizados**

```json
{
  "webhook_url": "https://tu-sistema.com/alerts",
  "headers": {
    "Authorization": "Bearer tu-token",
    "Content-Type": "application/json"
  },
  "payload": {
    "product_id": "MLM123456789",
    "title": "iPhone 13 Pro Max", 
    "stock": 2,
    "threshold": 5,
    "severity": "warning"
  }
}
```

## 📈 Monitoreo y Analytics

### **📊 Métricas Incluidas**
- Total de productos monitoreados
- Productos con stock bajo por umbral
- Productos activos vs pausados
- Última sincronización
- Alertas generadas por período
- Tiempo de respuesta de webhooks

### **🔍 Logs del Sistema**

Los logs se organizan por niveles:

```javascript
// Ejemplos de logs
logger.info('📦 Producto actualizado', { 
  productId: 'MLM123', 
  oldStock: 10, 
  newStock: 3 
});

logger.warn('⚠️ Stock bajo detectado', { 
  productId: 'MLM123',
  stock: 3,
  threshold: 5 
});

logger.error('❌ Error en webhook', { 
  error: error.message,
  productId: 'MLM123' 
});
```

### **📱 Notificaciones Push (Roadmap)**
- Service Worker para notificaciones web
- Push notifications en dispositivos móviles
- Notificaciones personalizadas por usuario

## 🛠️ Desarrollo y Contribución

### **🔧 Scripts de Desarrollo**

```bash
# Backend
npm run dev              # Servidor desarrollo
npm run start           # Servidor producción
npm run lint            # Linter ESLint
npm run test            # Tests Jest

# Frontend
cd client
npm run dev             # Vite dev server
npm run build           # Build producción
npm run preview         # Preview build local
npm run lint            # Linter ESLint
```

### **🧪 Testing**

```bash
# Backend tests
npm run test

# Frontend tests  
cd client
npm run test

# E2E tests (Cypress)
npm run test:e2e
```

### **📋 Code Style**

- **ESLint** para JavaScript/React
- **Prettier** para formateo automático
- **Husky** para pre-commit hooks
- **Conventional Commits** para mensajes

### **🤝 Contribuir**

1. Fork el repositorio
2. Crear rama feature: `git checkout -b feature/nueva-funcionalidad`
3. Commit con conventional commits: `git commit -m "feat: agregar filtro por fecha"`
4. Push: `git push origin feature/nueva-funcionalidad`
5. Crear Pull Request

## 🔒 Seguridad y Mejores Prácticas

### **🛡️ Medidas de Seguridad**
- Tokens OAuth almacenados de forma segura en Supabase
- Rate limiting en todos los endpoints
- Validación de entrada en frontend y backend
- CORS configurado correctamente
- Headers de seguridad (HSTS, CSP, etc.)
- Logs sin información sensible

### **🔐 Gestión de Secretos**
- Variables de entorno para todas las credenciales
- Rotación periódica de tokens
- Webhooks con verificación de firma
- Sesiones con expiración automática

### **📝 Compliance**
- GDPR ready (manejo de datos personales)
- Logs de auditoría
- Backups automáticos en Supabase
- Políticas de retención de datos

## 🚨 Troubleshooting

### **❌ Errores Comunes**

**"Cannot connect to Supabase"**
```bash
# Verificar variables de entorno
echo $SUPABASE_URL
echo $SUPABASE_ANON_KEY

# Verificar conectividad
curl -H "apikey: $SUPABASE_ANON_KEY" $SUPABASE_URL/rest/v1/
```

**"MercadoLibre OAuth Error"**
- Verificar que redirect_uri coincida exactamente
- Confirmar que la app de ML esté activa
- Revisar que CLIENT_ID y CLIENT_SECRET sean correctos

**"Webhooks not working"**
```bash
# Verificar webhook registration
curl -H "Authorization: Bearer $ACCESS_TOKEN" \
  https://api.mercadolibre.com/applications/$APP_ID/notifications
```

**"Frontend no carga"**
- Verificar que el build de React esté actualizado
- Confirmar que las rutas de Vercel estén configuradas
- Revisar logs en la consola del navegador

### **🔍 Debug Tools**

```bash
# Ver logs de Vercel
vercel logs

# Debug local con logs detallados
DEBUG=* npm run dev

# Verificar base de datos
npx supabase dashboard
```

## 📞 Soporte y Comunidad

### **📋 Recursos**
- **📚 Documentación:** Este README + código comentado
- **🐛 Issues:** [GitHub Issues](https://github.com/tu-usuario/mercado-libre-stock-monitor-vercel/issues)
- **💬 Discusiones:** [GitHub Discussions](https://github.com/tu-usuario/mercado-libre-stock-monitor-vercel/discussions)
- **📧 Email:** soporte@tuempresa.com

### **🏆 Contribuidores**
- **Desarrollador Principal:** Tu Nombre
- **Contributors:** Ver [CONTRIBUTORS.md](CONTRIBUTORS.md)

### **📜 Roadmap**
- [ ] **Mobile App** (React Native)
- [ ] **Multi-idioma** (i18n)
- [ ] **Dashboard Analytics** avanzado
- [ ] **Integración WhatsApp** Business
- [ ] **IA para predicción** de stock
- [ ] **Marketplace multi-plataforma** (Amazon, eBay)

## 📄 Licencia

Este proyecto está bajo la **Licencia MIT**. Ver [LICENSE](LICENSE) para más detalles.

---

## 🙏 Agradecimientos

- **[MercadoLibre Developers](https://developers.mercadolibre.com/)** por la API robusta y documentación
- **[Supabase](https://supabase.com/)** por la plataforma de base de datos moderna
- **[Vercel](https://vercel.com/)** por el hosting y edge functions
- **[React Team](https://reactjs.org/)** por el framework UI
- **[Bootstrap](https://getbootstrap.com/)** por los componentes UI

---

**⭐ Si este proyecto te resulta útil, ¡dale una estrella en GitHub!**

**🔗 [Ver Demo en Vivo](https://tu-app.vercel.app)** | **📖 [Documentación Técnica](TECHNICAL.md)** | **🎯 [Roadmap](ROADMAP.md)**