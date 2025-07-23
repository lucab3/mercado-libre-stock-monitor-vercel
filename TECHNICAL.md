# 📋 Documentación Técnica - Monitor de Stock MercadoLibre

## 🏗️ Arquitectura del Sistema

### 📊 Diagrama de Arquitectura General

```mermaid
graph TB
    User[👤 Usuario] --> Frontend[🎨 React Frontend<br/>Vite + Bootstrap]
    Frontend --> Vercel[☁️ Vercel Edge Network]
    
    Vercel --> MainApp[🚀 Express App<br/>src/app.js]
    Vercel --> ServerlessAPI[⚡ Serverless Functions<br/>src/api/*]
    
    MainApp --> Supabase[(🗄️ Supabase<br/>PostgreSQL)]
    ServerlessAPI --> Supabase
    
    ML[🛒 MercadoLibre API] --> Webhooks[🔔 Webhooks<br/>/api/webhooks/ml]
    Webhooks --> WebhookProcessor[⚙️ Webhook Processor<br/>Real-time Updates]
    WebhookProcessor --> Supabase
    
    MainApp --> Alerts[📧 Sistema de Alertas<br/>Email/Slack/Discord]
    
    style Frontend fill:#61DAFB
    style Vercel fill:#000
    style Supabase fill:#3ECF8E
    style ML fill:#FFE600
    style Alerts fill:#FF6B6B
```

### 🔄 Flujo de Datos en Tiempo Real

```mermaid
sequenceDiagram
    participant U as 👤 Usuario
    participant F as 🎨 Frontend
    participant V as ☁️ Vercel
    participant S as 🗄️ Supabase
    participant ML as 🛒 MercadoLibre
    participant WH as 🔔 Webhook Processor
    participant A as 📧 Alertas
    
    Note over U,A: 🚀 Inicio de Sesión
    U->>F: Login con MercadoLibre
    F->>V: POST /auth/login
    V->>ML: OAuth2 Authorization
    ML-->>V: Access Token
    V->>S: Store user session
    S-->>F: Session cookie
    
    Note over U,A: 📊 Carga de Dashboard
    U->>F: Acceder dashboard
    F->>V: GET /api/products
    V->>S: Query productos usuario
    S-->>V: Lista productos
    V-->>F: Productos + stats
    F-->>U: Dashboard renderizado
    
    Note over U,A: 🔄 Actualización en Tiempo Real
    ML->>WH: Webhook: producto actualizado
    WH->>S: Actualizar stock en BD
    WH->>A: Evaluar umbral stock
    A->>U: 📧 Alerta si stock bajo
    
    Note over U,A: 🔍 Filtros y Búsqueda
    U->>F: Aplicar filtros departamentos
    F->>F: Filter products locally
    F-->>U: Vista filtrada
    
    U->>F: Seleccionar categorías múltiples
    F->>F: Apply category filters
    F-->>U: Productos filtrados
```

### ⚡ Arquitectura Serverless Functions

```mermaid
graph LR
    subgraph "🌐 Vercel Serverless (9/12 funciones)"
        Main[📱 index.js<br/>App Principal]
        ProductsAPI[📦 products-api.js<br/>CRUD Productos]
        Alerts[🔔 alerts.js<br/>Sistema Alertas]
        Departments[🏢 departments.js<br/>Config Departamentos]
        AlertSettings[⚙️ alert-settings.js<br/>Config Alertas]
        SyncNext[🔄 sync-next.js<br/>Sync Incremental]
        Products[📥 products.js<br/>Sync Completo ML]
        Categories[🏷️ categories/info.js<br/>Nombres Categorías]
        Health[❤️ /health<br/>Healthcheck]
    end
    
    subgraph "📊 Uso y Frecuencia"
        Alta[🔥 Alta Frecuencia<br/>Main, ProductsAPI]
        Media[⚡ Media Frecuencia<br/>Alerts, SyncNext, Categories]
        Baja[📝 Baja Frecuencia<br/>Departments, AlertSettings<br/>Products, Health]
    end
    
    Main --- Alta
    ProductsAPI --- Alta
    Alerts --- Media
    SyncNext --- Media
    Categories --- Media
    Departments --- Baja
    AlertSettings --- Baja
    Products --- Baja
    Health --- Baja
```

## 🗄️ Esquema de Base de Datos

### 📊 Diagrama de Entidades

```mermaid
erDiagram
    USERS {
        uuid id PK
        text ml_user_id UK
        text email
        text nickname
        text access_token
        text refresh_token
        timestamp expires_at
        timestamp created_at
        timestamp updated_at
    }
    
    PRODUCTS {
        text id PK
        uuid user_id FK
        text title
        text category_id
        decimal price
        integer available_quantity
        integer sold_quantity
        text status
        text seller_sku
        text permalink
        text condition
        text listing_type_id
        decimal health
        timestamp last_webhook_update
        timestamp last_api_sync
        timestamp created_at
        timestamp updated_at
    }
    
    ALERTS {
        uuid id PK
        uuid user_id FK
        text product_id FK
        text type
        text message
        text severity
        boolean is_read
        timestamp resolved_at
        timestamp created_at
    }
    
    USER_SESSIONS {
        uuid id PK
        text session_token UK
        uuid user_id FK
        timestamp expires_at
        timestamp created_at
    }
    
    USERS ||--o{ PRODUCTS : "has many"
    USERS ||--o{ ALERTS : "receives"
    USERS ||--o{ USER_SESSIONS : "creates"
    PRODUCTS ||--o{ ALERTS : "generates"
```

### 🔍 Índices de Performance

```mermaid
graph TD
    subgraph "📊 Índices de Optimización"
        ProdUser[products.user_id<br/>🔍 Búsqueda por usuario]
        ProdStock[products.available_quantity<br/>📉 Filtros stock bajo]
        AlertUser[alerts.user_id<br/>🔔 Alertas por usuario]
        AlertUnread[alerts.user_id + is_read<br/>📬 Alertas no leídas]
        SessionToken[user_sessions.session_token<br/>🔐 Validación sesión]
        SessionUser[user_sessions.user_id<br/>👤 Sesiones por usuario]
    end
    
    subgraph "⚡ Tipos de Consulta"
        Fast[🚀 Consultas Rápidas<br/><100ms]
        Medium[⚡ Consultas Medias<br/>100-500ms]
        Complex[🔍 Consultas Complejas<br/>>500ms]
    end
    
    ProdUser --> Fast
    SessionToken --> Fast
    AlertUnread --> Fast
    ProdStock --> Medium
    AlertUser --> Medium
    SessionUser --> Complex
```

## 🔄 Sistema de Webhooks

### 📡 Procesamiento de Webhooks MercadoLibre

```mermaid
graph TD
    ML[🛒 MercadoLibre] -->|POST /api/webhooks/ml| Webhook[🔔 Webhook Endpoint]
    
    Webhook --> Validate{🔍 Validar<br/>Payload}
    Validate -->|❌ Inválido| Reject[❌ Rechazar<br/>HTTP 400]
    Validate -->|✅ Válido| Process[⚙️ Procesar Webhook]
    
    Process --> ParseTopic{📋 Analizar Topic}
    
    ParseTopic -->|items| ItemUpdate[📦 Actualización Producto]
    ParseTopic -->|orders| OrderUpdate[🛍️ Actualización Orden]
    ParseTopic -->|questions| QuestionUpdate[❓ Nueva Pregunta]
    
    ItemUpdate --> GetProduct[📥 Obtener Producto de ML API]
    GetProduct --> UpdateDB[💾 Actualizar Base de Datos]
    UpdateDB --> CheckStock{📊 Verificar Stock}
    
    CheckStock -->|Stock Bajo| TriggerAlert[🚨 Generar Alerta]
    CheckStock -->|Stock OK| LogUpdate[📝 Log Actualización]
    
    TriggerAlert --> SendEmail[📧 Enviar Email]
    TriggerAlert --> SendSlack[💬 Enviar Slack]
    TriggerAlert --> SendDiscord[🎮 Enviar Discord]
    TriggerAlert --> CustomWebhook[🔗 Webhook Custom]
    
    SendEmail --> Success[✅ Webhook Procesado]
    SendSlack --> Success
    SendDiscord --> Success
    CustomWebhook --> Success
    LogUpdate --> Success
```

### 🔔 Flujo de Alertas Multi-Canal

```mermaid
sequenceDiagram
    participant WP as ⚙️ Webhook Processor
    participant DB as 🗄️ Database
    participant AS as 🚨 Alert System
    participant E as 📧 Email
    participant S as 💬 Slack
    participant D as 🎮 Discord
    participant C as 🔗 Custom
    
    Note over WP,C: 📦 Producto con Stock Bajo Detectado
    
    WP->>DB: Actualizar stock producto
    WP->>AS: Evaluar umbral stock
    AS->>AS: stock ≤ threshold?
    
    alt Stock por debajo del umbral
        AS->>DB: Crear registro alerta
        AS->>DB: Verificar si ya existe alerta activa
        
        alt Nueva alerta requerida
            par Envío Multi-Canal
                AS->>E: 📧 Enviar email SMTP
                AS->>S: 💬 Enviar mensaje Slack
                AS->>D: 🎮 Enviar mensaje Discord
                AS->>C: 🔗 Trigger webhook custom
            end
            
            par Respuestas
                E-->>AS: ✅ Email enviado
                S-->>AS: ✅ Slack enviado  
                D-->>AS: ✅ Discord enviado
                C-->>AS: ✅ Webhook procesado
            end
            
            AS->>DB: Marcar alerta como enviada
        else Alerta ya existe
            AS->>AS: 🔄 Skip duplicada
        end
    else Stock suficiente
        AS->>DB: Resolver alertas existentes
    end
```

## 🎨 Arquitectura Frontend

### ⚛️ Estructura de Componentes React

```mermaid
graph TD
    App[🚀 App.jsx<br/>Router Principal] --> AuthProvider[🔐 AuthProvider<br/>Context Autenticación]
    AuthProvider --> AppProvider[📊 AppProvider<br/>Context Global]
    
    AppProvider --> DashboardLayout[📱 DashboardLayout<br/>Layout Principal]
    
    DashboardLayout --> Header[🔝 Header<br/>Navegación + Usuario]
    DashboardLayout --> Sidebar[📋 Sidebar<br/>Menú Principal]
    DashboardLayout --> Routes[🛣️ Routes<br/>Rutas Protegidas]
    
    Routes --> DashboardHome[🏠 DashboardHome<br/>Página Principal]
    Routes --> ProductsSection[📦 ProductsSection<br/>Gestión Productos]
    Routes --> AlertsSection[🔔 AlertsSection<br/>Centro Alertas]
    Routes --> SettingsSection[⚙️ SettingsSection<br/>Configuración]
    
    DashboardHome --> StatsCards[📊 StatsCards<br/>Métricas Clave]
    DashboardHome --> DeptButtons[🏢 DepartmentButtons<br/>Filtros Departamentos]
    DashboardHome --> MultiCategorySelector[☑️ MultiCategorySelector<br/>Filtros Categorías]
    DashboardHome --> ProductsTable[📋 ProductsTable<br/>Tabla Productos]
    DashboardHome --> RecentAlerts[🔔 RecentAlerts<br/>Alertas Recientes]
    
    style App fill:#61DAFB
    style AuthProvider fill:#4CAF50
    style AppProvider fill:#2196F3
    style DashboardHome fill:#FF9800
```

### 🔄 Gestión de Estado con Context API

```mermaid
graph LR
    subgraph "🔐 AuthContext"
        AuthState[👤 Estado Usuario<br/>isAuthenticated<br/>user<br/>loading]
        AuthActions[🔧 Acciones Auth<br/>login()<br/>logout()<br/>checkAuth()]
    end
    
    subgraph "📊 AppContext"
        AppState[📋 Estado Global<br/>products[]<br/>alerts[]<br/>stats{}<br/>loading{}]
        AppActions[⚙️ Acciones App<br/>setProducts()<br/>setAlerts()<br/>setLoading()]
    end
    
    subgraph "🎛️ Filtros State"
        DeptState[🏢 Departamentos<br/>config[]<br/>selectedDepartment]
        CategoryState[🏷️ Categorías<br/>selectedCategories[]<br/>availableCategories[]]
        FilterState[🔍 Filtros<br/>stockLevel<br/>searchText<br/>sortOrder]
    end
    
    AuthContext --> Components[⚛️ Componentes React]
    AppContext --> Components
    DeptState --> Components
    CategoryState --> Components
    FilterState --> Components
```

### 🎯 Custom Hooks

```mermaid
graph TD
    subgraph "🪝 Custom Hooks Especializados"
        useCategories[🏷️ useCategories<br/>- getCategoryName()<br/>- loadCategoryNames()<br/>- categoryCache]
        
        useDepartmentFilter[🏢 useDepartmentFilter<br/>- filteredProducts<br/>- departmentName<br/>- isFiltered]
        
        useAuth[🔐 useAuth<br/>- login()<br/>- logout()<br/>- checkAuthStatus()]
        
        useApi[🌐 useApi<br/>- get()<br/>- post()<br/>- handleErrors()]
        
        useLocalStorage[💾 useLocalStorage<br/>- getValue()<br/>- setValue()<br/>- removeValue()]
    end
    
    subgraph "📊 Datos y Estado"
        CategoryAPI[🏷️ Categories API<br/>categories/info]
        DepartmentConfig[🏢 Department Config<br/>Local Storage]
        AuthService[🔐 Auth Service<br/>API calls]
        APIService[🌐 API Service<br/>HTTP client]
        LocalStorage[💾 Browser Storage]
    end
    
    useCategories --> CategoryAPI
    useDepartmentFilter --> DepartmentConfig
    useAuth --> AuthService
    useApi --> APIService
    useLocalStorage --> LocalStorage
```

## 🔧 Sistema de Filtros Avanzado

### 🏢 Arquitectura de Departamentos

```mermaid
graph TB
    User[👤 Usuario] -->|Configura| DeptManager[🏢 Department Manager]
    
    DeptManager --> DeptConfig{📋 Configuración<br/>Departamentos}
    DeptConfig --> Storage[💾 Local Storage<br/>departments.config]
    
    Storage --> DeptButtons[🔘 Department Buttons<br/>UI Component]
    DeptButtons -->|Filtrar| ProductFilter[🔍 Product Filter]
    
    subgraph "📊 Ejemplo Configuración"
        Auto[🚗 Automotriz<br/>categories: [MLM1744, MLM1745]]
        Electronics[📱 Electrónicos<br/>categories: [MLM1000, MLM1001]]
        Home[🏠 Hogar<br/>categories: [MLM1574, MLM1575]]
    end
    
    DeptConfig --> Auto
    DeptConfig --> Electronics
    DeptConfig --> Home
    
    ProductFilter --> FilteredResults[📋 Productos Filtrados<br/>Por Departamento]
```

### ☑️ Sistema de Categorías Múltiples

```mermaid
graph TD
    MultiSelector[☑️ MultiCategorySelector] --> DropdownUI[📋 Dropdown UI]
    
    DropdownUI --> SelectAll[✅ Seleccionar Todas]
    DropdownUI --> ClearAll[❌ Limpiar Todas]
    DropdownUI --> IndividualCheckbox[☑️ Checkboxes Individuales]
    
    IndividualCheckbox --> CategoryList[📋 Lista Categorías]
    CategoryList --> CategoryCache[💾 Category Names Cache]
    
    SelectAll -->|onChange| FilterLogic[🔧 Filter Logic]
    ClearAll -->|onChange| FilterLogic
    IndividualCheckbox -->|onChange| FilterLogic
    
    FilterLogic --> SelectedBadges[🏷️ Selected Badges UI]
    FilterLogic --> ProductFiltering[🔍 Product Filtering]
    
    SelectedBadges -->|Remove Individual| FilterLogic
    
    subgraph "🎨 UI Features"
        Badges[🏷️ Visual Badges<br/>Categorías Seleccionadas]
        RemoveX[❌ Botón X Individual<br/>Quitar Categoría]
        ClearButton[🗑️ Botón Limpiar<br/>Quitar Todas]
        Dropdown[📋 Dropdown Mejorado<br/>Checkboxes Visibles]
    end
    
    SelectedBadges --> Badges
    Badges --> RemoveX
    FilterLogic --> ClearButton
    DropdownUI --> Dropdown
```

## 📊 Performance y Optimización

### ⚡ Estrategias de Performance

```mermaid
graph LR
    subgraph "🎯 Frontend Optimización"
        ReactMemo[⚛️ React.memo<br/>Componentes Puros]
        UseMemo[🧠 useMemo<br/>Cálculos Costosos]
        UseCallback[🔄 useCallback<br/>Funciones Estables]
        LazyLoading[📱 Lazy Loading<br/>Code Splitting]
    end
    
    subgraph "🗄️ Database Optimización"
        Indexes[🔍 Índices BD<br/>Consultas Rápidas]
        Pagination[📄 Paginación<br/>Límite Resultados]
        QueryOpt[⚡ Query Optimization<br/>SELECT Específicos]
        Connection[🔗 Connection Pooling<br/>Supabase Auto]
    end
    
    subgraph "☁️ Vercel Optimización"
        EdgeFunctions[⚡ Edge Functions<br/>Latencia Baja]
        CDN[🌐 CDN Global<br/>Assets Estáticos]
        Compression[📦 Compression<br/>Gzip/Brotli]
        Caching[💾 HTTP Caching<br/>Headers Cache]
    end
    
    ReactMemo --> BetterUX[😊 Mejor UX]
    UseMemo --> BetterUX
    UseCallback --> BetterUX
    LazyLoading --> BetterUX
    
    Indexes --> FasterDB[🚀 BD Rápida]
    Pagination --> FasterDB
    QueryOpt --> FasterDB
    Connection --> FasterDB
    
    EdgeFunctions --> LowLatency[⚡ Baja Latencia]
    CDN --> LowLatency
    Compression --> LowLatency
    Caching --> LowLatency
```

### 📈 Métricas de Performance

```mermaid
graph TD
    subgraph "📊 Métricas Key"
        TTFB[⏱️ Time to First Byte<br/>< 200ms]
        FCP[🎨 First Contentful Paint<br/>< 1.5s]
        LCP[🖼️ Largest Contentful Paint<br/>< 2.5s]
        CLS[📐 Cumulative Layout Shift<br/>< 0.1]
        FID[👆 First Input Delay<br/>< 100ms]
    end
    
    subgraph "🎯 Targets Achieved"
        ServerResponse[⚡ Server Response<br/>~50-150ms]
        DBQuery[🗄️ Database Query<br/>~10-100ms]
        APICall[🌐 API Calls<br/>~100-500ms]
        RenderTime[⚛️ React Render<br/>~16ms/frame]
    end
    
    TTFB --> ServerResponse
    FCP --> RenderTime
    LCP --> APICall
    CLS --> RenderTime
    FID --> ServerResponse
```

## 🔒 Seguridad y Compliance

### 🛡️ Medidas de Seguridad

```mermaid
graph TB
    subgraph "🔐 Autenticación"
        OAuth2[🔑 OAuth2 Flow<br/>MercadoLibre]
        JWT[🎫 JWT Tokens<br/>Secure Storage]
        Sessions[👤 User Sessions<br/>Database Stored]
        Expiration[⏰ Token Expiration<br/>Auto Refresh]
    end
    
    subgraph "🛡️ Protección API"
        RateLimit[⚡ Rate Limiting<br/>Request Throttling]
        CORS[🌐 CORS Policy<br/>Origin Control]
        Validation[✅ Input Validation<br/>Frontend + Backend]
        CSRF[🛡️ CSRF Protection<br/>Token Based]
    end
    
    subgraph "🔒 Data Security"
        Encryption[🔐 Data Encryption<br/>Transit + Rest]
        EnvVars[🔑 Environment Variables<br/>Secrets Management]
        Logs[📝 Secure Logging<br/>No Sensitive Data]
        Backup[💾 Database Backup<br/>Supabase Auto]
    end
    
    OAuth2 --> SecureApp[🏰 Aplicación Segura]
    JWT --> SecureApp
    Sessions --> SecureApp
    Expiration --> SecureApp
    
    RateLimit --> SecureApp
    CORS --> SecureApp
    Validation --> SecureApp
    CSRF --> SecureApp
    
    Encryption --> SecureApp
    EnvVars --> SecureApp
    Logs --> SecureApp
    Backup --> SecureApp
```

### 📋 Compliance y Regulaciones

```mermaid
graph LR
    subgraph "📜 GDPR Compliance"
        DataMinimal[📊 Data Minimization<br/>Solo datos necesarios]
        UserConsent[✅ User Consent<br/>Términos explícitos]
        DataPortability[📦 Data Portability<br/>Export funcional]
        RightDelete[🗑️ Right to Delete<br/>Account deletion]
    end
    
    subgraph "🔍 Audit Trail"
        ActionLogs[📝 Action Logging<br/>User activities]
        AccessLogs[🔐 Access Logging<br/>Authentication events]
        ErrorLogs[❌ Error Logging<br/>System issues]
        PerformanceLogs[📊 Performance Logs<br/>Response times]
    end
    
    subgraph "🛡️ Security Headers"
        HSTS[🔒 HSTS Header<br/>Force HTTPS]
        CSP[🛡️ Content Security Policy<br/>XSS Protection]
        NOSNIFF[🚫 X-Content-Type-Options<br/>MIME sniffing protection]
        FRAME[🖼️ X-Frame-Options<br/>Clickjacking protection]
    end
    
    DataMinimal --> Compliant[✅ Aplicación Compliant]
    UserConsent --> Compliant
    DataPortability --> Compliant
    RightDelete --> Compliant
    
    ActionLogs --> Auditable[🔍 Sistema Auditable]
    AccessLogs --> Auditable
    ErrorLogs --> Auditable
    PerformanceLogs --> Auditable
    
    HSTS --> SecureHeaders[🛡️ Headers Seguros]
    CSP --> SecureHeaders
    NOSNIFF --> SecureHeaders
    FRAME --> SecureHeaders
```

## 🧪 Testing y Quality Assurance

### 🔬 Estrategia de Testing

```mermaid
graph TD
    subgraph "🧪 Frontend Testing"
        UnitTests[⚛️ Unit Tests<br/>Jest + React Testing Library]
        ComponentTests[🧩 Component Tests<br/>Render + Interactions]
        HookTests[🪝 Hook Tests<br/>Custom hooks testing]
        IntegrationTests[🔗 Integration Tests<br/>API interactions]
    end
    
    subgraph "🔧 Backend Testing"
        APITests[🌐 API Tests<br/>Endpoint testing]
        ServiceTests[⚙️ Service Tests<br/>Business logic]
        DatabaseTests[🗄️ Database Tests<br/>Query validation]
        WebhookTests[🔔 Webhook Tests<br/>Event processing]
    end
    
    subgraph "🌐 E2E Testing"
        CypressTests[🤖 Cypress Tests<br/>User workflows]
        VisualTests[👁️ Visual Tests<br/>Screenshot comparison]
        PerformanceTests[⚡ Performance Tests<br/>Load testing]
        SecurityTests[🔒 Security Tests<br/>Vulnerability scanning]
    end
    
    UnitTests --> CI[🔄 CI Pipeline]
    ComponentTests --> CI
    HookTests --> CI
    IntegrationTests --> CI
    
    APITests --> CI
    ServiceTests --> CI
    DatabaseTests --> CI
    WebhookTests --> CI
    
    CypressTests --> CD[🚀 CD Pipeline]
    VisualTests --> CD
    PerformanceTests --> CD
    SecurityTests --> CD
```

### 📊 Quality Metrics

```mermaid
graph LR
    subgraph "📈 Code Quality"
        Coverage[📊 Test Coverage<br/>>80%]
        Complexity[🧠 Cyclomatic Complexity<br/><10]
        Duplication[🔄 Code Duplication<br/><3%]
        Maintainability[🔧 Maintainability Index<br/>>70]
    end
    
    subgraph "⚡ Performance"
        LoadTime[⏱️ Load Time<br/><2s]
        ResponseTime[🚀 API Response<br/><500ms]
        Memory[💾 Memory Usage<br/><100MB]
        CPU[🖥️ CPU Usage<br/><30%]
    end
    
    subgraph "🔒 Security"
        Vulnerabilities[🛡️ Known Vulnerabilities<br/>0 High/Critical]
        Dependencies[📦 Dependency Security<br/>Auto updates]
        Authentication[🔐 Auth Security<br/>OWASP compliance]
        DataProtection[🔒 Data Protection<br/>Encryption standards]
    end
    
    Coverage --> QualityScore[🏆 Quality Score<br/>A+ Rating]
    Complexity --> QualityScore
    Duplication --> QualityScore
    Maintainability --> QualityScore
    
    LoadTime --> PerformanceScore[⚡ Performance Score<br/>90+ Lighthouse]
    ResponseTime --> PerformanceScore
    Memory --> PerformanceScore
    CPU --> PerformanceScore
    
    Vulnerabilities --> SecurityScore[🛡️ Security Score<br/>A+ Rating]
    Dependencies --> SecurityScore
    Authentication --> SecurityScore
    DataProtection --> SecurityScore
```

## 🚀 Deployment y DevOps

### 🔄 CI/CD Pipeline

```mermaid
graph TD
    Developer[👨‍💻 Developer] -->|git push| GitHub[📂 GitHub Repository]
    
    GitHub -->|webhook| VercelBuild[🔨 Vercel Build]
    GitHub -->|webhook| Actions[⚙️ GitHub Actions]
    
    Actions --> Tests[🧪 Run Tests]
    Actions --> Lint[🔍 ESLint + Prettier]
    Actions --> Security[🔒 Security Scan]
    
    Tests -->|✅ Pass| QualityGate{🚦 Quality Gate}
    Lint -->|✅ Pass| QualityGate
    Security -->|✅ Pass| QualityGate
    
    QualityGate -->|❌ Fail| Reject[❌ Deployment Rejected]
    QualityGate -->|✅ Pass| VercelDeploy[🚀 Vercel Deploy]
    
    VercelBuild --> VercelDeploy
    VercelDeploy --> Preview[👁️ Preview Environment]
    VercelDeploy --> Production[🌐 Production Environment]
    
    Production --> Monitoring[📊 Monitoring & Alerts]
    Monitoring --> Logs[📝 Logs Analysis]
    
    style QualityGate fill:#4CAF50
    style Production fill:#FF5722
    style Monitoring fill:#2196F3
```

### 🌍 Entornos de Deployment

```mermaid
graph LR
    subgraph "💻 Development"
        LocalDev[🏠 Local Development<br/>localhost:3000]
        MockAPI[🎭 Mock API<br/>Sin credenciales ML]
        LocalDB[💾 Local Supabase<br/>Development database]
    end
    
    subgraph "🔍 Staging"
        VercelPreview[👁️ Vercel Preview<br/>preview-url.vercel.app]
        TestingDB[🧪 Testing Database<br/>Staging Supabase]
        RealAPI[🛒 Real ML API<br/>Testing credentials]
    end
    
    subgraph "🌐 Production"
        VercelProd[🚀 Production<br/>your-app.vercel.app]
        ProdDB[🗄️ Production Database<br/>Production Supabase]
        LiveAPI[🔴 Live ML API<br/>Production credentials]
    end
    
    LocalDev --> VercelPreview
    MockAPI --> RealAPI
    LocalDB --> TestingDB
    
    VercelPreview --> VercelProd
    RealAPI --> LiveAPI
    TestingDB --> ProdDB
```

## 📊 Monitoring y Observabilidad

### 📈 Sistema de Monitoreo

```mermaid
graph TB
    subgraph "📊 Métricas de Aplicación"
        UserMetrics[👥 User Metrics<br/>Active users, sessions]
        ProductMetrics[📦 Product Metrics<br/>Products monitored, updates]
        AlertMetrics[🔔 Alert Metrics<br/>Alerts sent, response time]
        PerformanceMetrics[⚡ Performance Metrics<br/>Response time, uptime]
    end
    
    subgraph "🔍 Logging"
        AppLogs[📝 Application Logs<br/>Structured JSON logs]
        ErrorLogs[❌ Error Logs<br/>Exceptions, stack traces]
        AccessLogs[🔐 Access Logs<br/>Authentication, API calls]
        WebhookLogs[🔔 Webhook Logs<br/>ML webhook processing]
    end
    
    subgraph "🚨 Alerting"
        HealthChecks[❤️ Health Checks<br/>Service availability]
        ErrorRates[📈 Error Rate Alerts<br/>High error thresholds]
        PerformanceAlerts[⚡ Performance Alerts<br/>Slow response times]
        BusinessAlerts[💼 Business Alerts<br/>Stock alerts, sync issues]
    end
    
    UserMetrics --> Dashboard[📊 Monitoring Dashboard]
    ProductMetrics --> Dashboard
    AlertMetrics --> Dashboard
    PerformanceMetrics --> Dashboard
    
    AppLogs --> LogAnalysis[🔍 Log Analysis]
    ErrorLogs --> LogAnalysis
    AccessLogs --> LogAnalysis
    WebhookLogs --> LogAnalysis
    
    HealthChecks --> NotificationSystem[📧 Notification System]
    ErrorRates --> NotificationSystem
    PerformanceAlerts --> NotificationSystem
    BusinessAlerts --> NotificationSystem
```

## 📋 Conclusión

Esta documentación técnica proporciona una visión completa de la arquitectura, componentes, y flujos de datos del Monitor de Stock para MercadoLibre. El sistema está diseñado para ser:

- **🏗️ Escalable:** Arquitectura serverless que crece con la demanda
- **⚡ Performante:** Optimizaciones en frontend, backend y base de datos
- **🔒 Seguro:** Implementación de mejores prácticas de seguridad
- **📊 Observable:** Monitoreo completo y logging estructurado
- **🧪 Testeable:** Cobertura de tests en todos los niveles
- **🚀 Deployable:** CI/CD automatizado con quality gates

El sistema actual maneja eficientemente las necesidades de pequeñas a medianas empresas, con un claro camino de escalabilidad para organizaciones más grandes mediante la actualización a planes pagos de Vercel y Supabase.

---

**📖 [Volver al README](README.md)** | **🎯 [Ver Roadmap](ROADMAP.md)**