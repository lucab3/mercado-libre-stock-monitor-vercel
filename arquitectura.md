# 🚀 Sistema de Monitoreo de Stock MercadoLibre

Arquitectura Webhook-Driven con Supabase - Documentación Técnica Completa

## 📋 Resumen Ejecutivo

El sistema migró de una arquitectura basada en polling manual a una arquitectura webhook-driven con persistencia en Supabase. Esta migración elimina el 99% de las llamadas innecesarias a ML API y proporciona actualizaciones en tiempo real.

## 🎯 Beneficios Clave

- ⚡ **Tiempo real**: Actualizaciones instantáneas vía webhooks
- 💰 **Eficiencia**: 99% menos llamadas a ML API después del scan inicial
- 🛡️ **Robustez**: Persistencia que sobrevive restarts de Vercel fe
- 📈 **Escalabilidad**: Optimizado para 10,000+ productos

## 🏗️ Arquitectura General del Sistema

```mermaid
graph TB
    subgraph "🌐 MercadoLibre Ecosystem"
        MLAPI["ML API - Products Endpoint"]
        MLWH["ML Webhooks - Real-time Events"]
    end

    subgraph "☁️ Vercel Deployment"
        subgraph "🎯 API Endpoints"
            WHEP["/api/webhooks/ml - New Endpoint"]
            LEGEP["/webhook/notifications - Legacy Endpoint"]
            APIEP["/api/monitor/* - Monitor APIs"]
        end

        subgraph "🧠 Core Services"
            SM["StockMonitor - Main Controller"]
            WP["WebhookProcessor - Event Handler"]
            DS["DatabaseService - Data Layer"]
            PS["ProductsService - ML API Client"]
        end

        subgraph "🔧 Utils & Models"
            SC["SupabaseClient - DB Connection"]
            PM["Product Model - Data Structure"]
            AUTH["Auth Service - User Management"]
        end
    end

    subgraph "🗄️ Supabase Database"
        PROD["products - Main Data"]
        WHEV["webhook_events - Event Log"]
        CONF["app_config - Settings"]
    end

    subgraph "👤 User Interface"
        UI["Frontend - Dashboard"]
        NOT["Notifications - Alerts"]
    end

    %% Data Flow - Initial Sync
    MLAPI -->|1. Initial Scan| PS
    PS -->|2. Process Data| SM
    SM -->|3. Bulk Insert| DS
    DS -->|4. Store Products| PROD

    %% Data Flow - Webhook Updates
    MLWH -->|5. Real-time Events| WHEP
    MLWH -->|5. Legacy Support| LEGEP
    WHEP -->|6. Process| WP
    WP -->|7. Validate & Extract| SM
    SM -->|8. Single Product Update| PS
    PS -->|9. Get Fresh Data| MLAPI
    SM -->|10. Update Specific| DS
    DS -->|11. Upsert Product| PROD

    %% Data Flow - Monitoring
    UI -->|12. Check Stock| APIEP
    APIEP -->|13. Get Status| SM
    SM -->|14. Read Cache| DS
    DS -->|15. Query Low Stock| PROD
    SM -->|16. Send Alerts| NOT

    %% Configuration & Logging
    DS -->|Config| CONF
    WP -->|Log Events| WHEV
    SC -->|Connection Pool| DS
    AUTH -->|User Context| SM
    PM -->|Data Validation| PS
```

## 🔄 Flujo de Inicialización Completa

**Primera Vez - Scan Automático de ~10,000 Productos**

```mermaid
sequenceDiagram
    participant U as 👤 Usuario
    participant SM as 📈 StockMonitor
    participant PS as 🔗 ProductsService
    participant ML as 🌐 ML API
    participant DS as 💾 DatabaseService
    participant DB as 🗄️ Supabase

    Note over U,DB: 🚀 PRIMERA INICIALIZACIÓN

    U->>SM: start()
    SM->>DS: needsApiSync(userId)
    DS->>DB: SELECT COUNT(*) FROM products WHERE user_id = ?
    DB-->>DS: 0 productos
    DS-->>SM: true (BD vacía)

    Note over SM,ML: 📊 SCAN COMPLETO AUTOMÁTICO

    loop Hasta scanCompleted = true
        SM->>PS: getAllProducts()
        PS->>ML: GET /users/me/items/search
        ML-->>PS: {results: [MLA123, MLA456...], scanCompleted: false}
        PS-->>SM: 300 IDs + hasMoreProducts
        Note over SM: ⏳ Rate Limiting: 2 segundos
    end

    Note over SM: ✅ Total IDs acumulados: ~10,000

    Note over SM,DB: 🔍 OBTENCIÓN DE DETALLES (Lotes de 30)

    loop Por cada lote de 30 productos
        SM->>PS: getMultipleProducts([MLA123, MLA456...])
        PS->>ML: GET /items?ids=MLA123,MLA456...
        ML-->>PS: [{id, title, stock, price, status...}]
        PS-->>SM: Datos completos (30 productos)
        Note over SM: ⏳ Rate Limiting: 1.5 segundos
    end

    Note over SM: ✅ ~334 lotes procesados

    SM->>DS: upsertMultipleProducts(productsArray)
    DS->>DB: INSERT/UPDATE products (id, user_id, title, stock...)
    DB-->>DS: ✅ ~10,000 productos guardados

    SM->>DS: updateSessionCache(userId)
    DS->>DB: SELECT * FROM products WHERE available_quantity <= threshold
    DB-->>DS: Productos con stock bajo
    DS-->>SM: Cache actualizado

    SM-->>U: ✅ Sistema listo - Monitoreo webhook-driven activo

    Note over U,DB: ⏱️ Tiempo total: ~8-10 minutos
```

## 📊 Desglose del Scan Inicial

| Fase | Operación | Tiempo | Detalles |
|------|-----------|--------|----------|
| 🔍 Obtención de IDs | getAllProducts() en loop | ~2 minutos | ~34 lotes de 300 IDs c/u |
| 📦 Detalles de productos | getMultipleProducts() | ~8 minutos | ~334 lotes de 30 productos c/u |
| 💾 Guardado en BD | upsertMultipleProducts() | ~30 segundos | Batch insert optimizado |
| 🔄 Actualización cache | updateSessionCache() | ~5 segundos | Query de productos con stock bajo |

## 🔗 Campos Procesados en Inicialización

| Campo ML API | Procesamiento | Destino BD | Ejemplo |
|--------------|---------------|------------|---------|
| id | Directo | id (PK) | MLA123456789 |
| title | Directo | title | iPhone 14 Pro 128GB |
| seller_sku | Extracción inteligente | seller_sku | IP14-PRO-128 |
| available_quantity | 0 fallback | available_quantity | 5 |
| price | Directo | price | 850000.00 |
| status | Directo | status | active |
| permalink | Directo | permalink | https://articulo.mercadolibre... |
| category_id | Directo | category_id | MLA1055 |
| condition | Directo | condition | new |
| listing_type_id | Directo | listing_type_id | gold_special |
| health | Directo | health | good |
| - | Generated | user_id | user_12345 |
| - | NOW() | last_api_sync | 2024-07-02T14:30:00Z |

## ⚡ Flujo de Webhooks - Tiempo Real

**Actualización Individual por Evento ML**

```mermaid
sequenceDiagram
    participant ML as 🌐 ML API
    participant WH as 🔔 Webhook Endpoint
    participant WP as ⚡ WebhookProcessor
    participant SM as 📈 StockMonitor
    participant PS as 🔗 ProductsService
    participant DS as 💾 DatabaseService
    participant DB as 🗄️ Supabase
    participant U as 👤 Usuario

    Note over ML,U: 🔄 CAMBIO DETECTADO EN ML

    ML->>WH: POST /api/webhooks/ml
    Note over WH: Webhook Data:<br/>{<br/>"_id": "webhook-123",<br/>"topic": "stock-location",<br/>"resource": "/user-products/MLA123/stock",<br/>"user_id": 123456789,<br/>"sent": "2024-07-02T14:34:59Z"<br/>}

    WH->>WP: validateWebhookOrigin(clientIP, headers)
    Note over WP: ✅ IP: 54.88.218.97 (autorizada)<br/>✅ Content-Type: application/json
    WP-->>WH: {valid: true, reason: "authorized_ip"}

    WH->>WP: validateWebhookData(webhookData)
    Note over WP: ✅ Topic: stock-location (soportado)<br/>✅ ProductId: MLA123 (extraído)
    WP-->>WH: {valid: true, productId: "MLA123"}

    WH->>WP: handleWebhook(webhookData, clientIP, headers)
    Note over WH,WP: ⚡ RESPUESTA RÁPIDA <500ms

    WP-->>ML: 200 OK {<br/>"status": "received",<br/>"webhook_id": "webhook-123",<br/>"processingTime": "45ms"<br/>}

    Note over WP,DB: 🔄 PROCESAMIENTO ASÍNCRONO

    par Logging
        WP->>DS: saveWebhookEvent(webhookData)
        DS->>DB: INSERT INTO webhook_events<br/>(webhook_id, topic, resource, user_id, product_id,<br/>client_ip, received_at)
    and Processing
        WP->>SM: processProductFromWebhook("MLA123", userId)
        SM->>PS: getProduct("MLA123")
        PS->>ML: GET /items/MLA123
        ML-->>PS: {<br/>"id": "MLA123",<br/>"available_quantity": 2,<br/>"price": 1500,<br/>"status": "active"<br/>}
        PS-->>SM: Datos frescos del producto

        SM->>DS: upsertProduct(productData)
        DS->>DB: UPDATE products SET<br/>available_quantity = 2,<br/>price = 1500,<br/>last_webhook_sync = NOW(),<br/>webhook_source = 'ml_webhook'<br/>WHERE id = 'MLA123'

        SM->>DS: updateSessionCache(userId)
        DS->>DB: SELECT * FROM products<br/>WHERE user_id = ? AND available_quantity <= ?
        DB-->>DS: Lista actualizada de stock bajo
        DS-->>SM: sessionCache.lowStockProducts actualizado
    end

    alt Stock bajo detectado (≤ threshold)
        SM->>U: 📧 Notificación: "MLA123 tiene solo 2 unidades"
    end

    WP->>DS: markWebhookProcessed("webhook-123", true, result)
    DS->>DB: UPDATE webhook_events SET<br/>processed = true,<br/>processed_at = NOW(),<br/>processing_status = 'completed'

    Note over ML,U: ✅ Producto actualizado en ~1 segundo
```

## 🔔 Tipos de Webhooks Manejados

### 📦 Stock-Location Webhook

```json
{
  "_id": "webhook-stock-123",
  "topic": "stock-location",
  "resource": "/user-products/MLA123456789/stock",
  "user_id": 123456789,
  "application_id": 213123389095511,
  "sent": "2024-07-02T14:34:59Z",
  "attempts": 1,
  "received": "2024-07-02T14:35:00Z"
}
```
→ **Actualiza**: available_quantity del producto específico

### 📋 Items Webhook

```json
{
  "_id": "webhook-items-456",
  "topic": "items",
  "resource": "/items/MLA123456789",
  "user_id": 123456789,
  "application_id": 213123389095511,
  "sent": "2024-07-02T14:34:59Z",
  "attempts": 1,
  "received": "2024-07-02T14:35:00Z"
}
```
→ **Actualiza**: Todos los datos del producto (precio, título, estado, etc.)

## 🛡️ Validación de Webhooks

| Validación | Criterio | Acción si Falla |
|------------|----------|-----------------|
| IP Address | Lista autorizada de ML | HTTP 403 Forbidden |
| Content-Type | application/json | HTTP 400 Bad Request |
| Estructura | Campos requeridos presentes | HTTP 400 Bad Request |
| Topic | stock-location o items | HTTP 400 Bad Request |
| Product ID | Extraíble del resource | HTTP 400 Bad Request |

## 🔐 IPs Autorizadas de MercadoLibre

```javascript
const allowedIPs = [
  '54.88.218.97',
  '18.215.140.160',
  '18.213.114.129',
  '18.206.34.84'
];
```

## 📊 Mapeo Completo de Datos

### 🔄 Transformación ML API → Supabase

```mermaid
graph LR
    subgraph "🌐 ML API Response"
        API_ID["id: MLA123456789"]
        API_TITLE["title: iPhone 14 Pro"]
        API_SKU["seller_sku: IP14-PRO-128"]
        API_STOCK["available_quantity: 5"]
        API_PRICE["price: 850000"]
        API_STATUS["status: active"]
        API_PERMALINK["permalink: https://..."]
        API_CATEGORY["category_id: MLA1055"]
        API_CONDITION["condition: new"]
        API_LISTING["listing_type_id: gold_special"]
        API_HEALTH["health: good"]
        API_CURRENCY["currency_id: ARS"]
        API_THUMB["thumbnail: https://..."]
        API_DATE["date_created: 2024-01-15"]
    end

    subgraph "🗄️ Supabase Products Table"
        DB_ID["id - TEXT PK"]
        DB_USER["user_id - TEXT"]
        DB_TITLE["title - TEXT"]
        DB_SKU["seller_sku - TEXT"]
        DB_STOCK["available_quantity - INT"]
        DB_PRICE["price - DECIMAL"]
        DB_STATUS["status - TEXT"]
        DB_PERMALINK["permalink - TEXT"]
        DB_CATEGORY["category_id - TEXT"]
        DB_CONDITION["condition - TEXT"]
        DB_LISTING["listing_type_id - TEXT"]
        DB_HEALTH["health - TEXT"]
        DB_API_SYNC["last_api_sync - TIMESTAMP"]
        DB_WH_SYNC["last_webhook_sync - TIMESTAMP"]
        DB_WH_SOURCE["webhook_source - TEXT"]
        DB_UPDATED["updated_at - TIMESTAMP"]
        DB_CREATED["created_at - TIMESTAMP"]
    end

    subgraph "❌ No Persistidos en BD"
        NP_CURRENCY["currency_id - No guardado"]
        NP_THUMB["thumbnail - No guardado"]
        NP_DATE["date_created - No guardado"]
        NP_STOP["stop_time - No guardado"]
        NP_LAST["last_updated - No guardado"]
        NP_CATALOG["catalog_listing - No guardado"]
    end

    %% Mapeo directo 1:1
    API_ID --> DB_ID
    API_TITLE --> DB_TITLE
    API_SKU --> DB_SKU
    API_STOCK --> DB_STOCK
    API_PRICE --> DB_PRICE
    API_STATUS --> DB_STATUS
    API_PERMALINK --> DB_PERMALINK
    API_CATEGORY --> DB_CATEGORY
    API_CONDITION --> DB_CONDITION
    API_LISTING --> DB_LISTING
    API_HEALTH --> DB_HEALTH

    %% Campos no persistidos
    API_CURRENCY -.-> NP_CURRENCY
    API_THUMB -.-> NP_THUMB
    API_DATE -.-> NP_DATE
```

## 💾 Cache de Sesión (Estructura en Memoria)

El sistema mantiene un cache optimizado para respuestas rápidas de UI:

```javascript
// sessionCache - Estructura optimizada para UI
{
  lowStockProducts: [
    {
      id: "MLA123456789",          // products.id
      title: "iPhone 14 Pro 128GB", // products.title
      seller_sku: "IP14-PRO-128",  // products.seller_sku
      stock: 2,                    // products.available_quantity (renombrado)
      status: "active",            // products.status
      permalink: "https://articulo...", // products.permalink
      productUrl: "https://articulo...", // permalink o generado
      lastUpdated: "2024-07-02T14:35:00Z" // products.updated_at (renombrado)
    }
  ],
  totalProducts: 9847,             // COUNT(*) WHERE status='active'
  lastScanInfo: {
    lastSync: "2024-07-02T14:30:00Z", // Último sync completo
    source: "webhook_updated_database" // Fuente de los datos
  }
}
```

## 🗄️ Esquema Completo de Base de Datos

### 📦 Tabla Principal: products

```sql
CREATE TABLE products (
  -- 🔑 Identificadores
  id                TEXT PRIMARY KEY,       -- 'MLA123456789'
  user_id           TEXT NOT NULL,          -- 'user_12345'

  -- 📋 Información del Producto
  title             TEXT,                   -- 'iPhone 14 Pro 128GB'
  seller_sku        TEXT,                   -- 'IP14-PRO-128'
  category_id       TEXT,                   -- 'MLA1055'
  condition         TEXT,                   -- 'new' | 'used'
  listing_type_id   TEXT,                   -- 'gold_special' | 'bronze'

  -- 💰 Información Comercial
  available_quantity INTEGER DEFAULT 0,     -- 5
  price             DECIMAL(15,2),          -- 850000.00
  status            TEXT,                   -- 'active' | 'paused' | 'closed'
  health            TEXT,                   -- 'good' | 'bad' | 'warning'

  -- 🔗 Enlaces
  permalink         TEXT,                   -- 'https://articulo.mercadolibre.com.ar/...'

  -- ⏰ Metadatos de Sincronización
  last_api_sync     TIMESTAMP,              -- '2024-07-02 14:30:00'
  last_webhook_sync TIMESTAMP,              -- '2024-07-02 14:35:00'
  webhook_source    TEXT,                   -- 'ml_webhook'
  updated_at        TIMESTAMP DEFAULT NOW(), -- Auto-timestamp
  created_at        TIMESTAMP DEFAULT NOW(), -- Auto-timestamp

  -- 📊 Índices para Performance
  INDEX idx_user_stock (user_id, available_quantity),
  INDEX idx_user_status (user_id, status),
  INDEX idx_last_sync (last_api_sync),
  INDEX idx_webhook_sync (last_webhook_sync)
);
```

### 🔔 Tabla de Eventos: webhook_events

```sql
CREATE TABLE webhook_events (
  -- 🔑 Identificador
  id                    SERIAL PRIMARY KEY,
  webhook_id            TEXT UNIQUE NOT NULL, -- 'webhook-123-456'

  -- 📨 Datos del Webhook
  topic                 TEXT NOT NULL,        -- 'stock-location' | 'items'
  resource              TEXT NOT NULL,        -- '/user-products/MLA123/stock'
  user_id               INTEGER NOT NULL,     -- 123456789
  product_id            TEXT,                 -- 'MLA123456789' (extraído del resource)

  -- 🔄 Estado de Procesamiento
  processed             BOOLEAN DEFAULT FALSE, -- true | false
  processing_status     TEXT,                 -- 'completed' | 'failed' | 'pending'
  processing_result     JSONB,                -- {"updated": true, "stock": 5}
  attempts              INTEGER DEFAULT 1,    -- 1, 2, 3...

  -- ⏰ Timestamps
  received_at           TIMESTAMP DEFAULT NOW(), -- Cuando lo recibimos
  processed_at          TIMESTAMP,             -- Cuando terminamos de procesarlo
  sent_at               TIMESTAMP,             -- Cuando ML lo envió
  webhook_received_at   TIMESTAMP,             -- Timestamp interno del webhook

  -- 🌐 Metadatos de Red
  client_ip             TEXT,                 -- '54.88.218.97'
  request_headers       JSONB,                -- {"content-type": "application/json"}

  -- 📊 Índices
  INDEX idx_processed (processed),
  INDEX idx_product_id (product_id),
  INDEX idx_received_at (received_at),
  INDEX idx_webhook_id (webhook_id)
);
```

### ⚙️ Tabla de Configuración: app_config

```sql
CREATE TABLE app_config (
  key         TEXT PRIMARY KEY,     -- 'stock_threshold' | 'auto_scan_interval'
  value       TEXT,                 -- '5' | '60'
  updated_at  TIMESTAMP DEFAULT NOW() -- Auto-timestamp
);

-- 📊 Configuraciones por Defecto
INSERT INTO app_config (key, value) VALUES
  ('stock_threshold', '5'),          -- Umbral de stock bajo
  ('auto_scan_interval', '60'),      -- Minutos entre scans (no usado en webhook mode)
  ('webhook_retry_attempts', '3'),   -- Intentos de retry para webhooks
  ('cache_ttl_minutes', '5');        -- TTL del cache de sesión
```

## 🎯 Operaciones Críticas de Base de Datos

### 📊 Consultas de Alto Rendimiento

#### 🔍 Obtener Productos con Stock Bajo
```sql
-- Usada en: updateSessionCache(), checkStock()
-- Frecuencia: Cada webhook + UI requests
-- Performance: <100ms para 10K productos

SELECT 
  id, title, seller_sku, available_quantity, permalink, updated_at
FROM products 
WHERE user_id = $1 
  AND available_quantity <= $2 
  AND status = 'active'
ORDER BY available_quantity ASC, updated_at DESC
LIMIT 100;
```

#### 📦 Upsert Masivo de Productos
```sql
-- Usada en: syncProductsWithAPI() - Scan inicial
-- Frecuencia: Solo primera vez
-- Performance: ~30 segundos para 10K productos

INSERT INTO products (
  id, user_id, title, seller_sku, available_quantity, price, status,
  permalink, category_id, condition, listing_type_id, health, last_api_sync
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  seller_sku = EXCLUDED.seller_sku,
  available_quantity = EXCLUDED.available_quantity,
  price = EXCLUDED.price,
  status = EXCLUDED.status,
  permalink = EXCLUDED.permalink,
  category_id = EXCLUDED.category_id,
  condition = EXCLUDED.condition,
  listing_type_id = EXCLUDED.listing_type_id,
  health = EXCLUDED.health,
  last_api_sync = EXCLUDED.last_api_sync,
  updated_at = NOW();
```

#### ⚡ Upsert Individual por Webhook
```sql
-- Usada en: processProductFromWebhook()
-- Frecuencia: Cada webhook (tiempo real)
-- Performance: <50ms por producto

INSERT INTO products (
  id, user_id, title, seller_sku, available_quantity, price, status,
  permalink, category_id, condition, listing_type_id, health,
  last_webhook_sync, webhook_source
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), 'ml_webhook')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  available_quantity = EXCLUDED.available_quantity,
  price = EXCLUDED.price,
  status = EXCLUDED.status,
  last_webhook_sync = NOW(),
  webhook_source = 'ml_webhook',
  updated_at = NOW();
```

#### 🔔 Logging de Webhooks
```sql
-- Usada en: saveWebhookEvent()
-- Frecuencia: Cada webhook
-- Performance: <20ms

INSERT INTO webhook_events (
  webhook_id, topic, resource, user_id, product_id,
  client_ip, request_headers, sent_at, webhook_received_at
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);
```

#### ⚙️ Gestión de Configuración
```sql
-- Obtener configuración
SELECT value FROM app_config WHERE key = $1;

-- Actualizar configuración
INSERT INTO app_config (key, value) VALUES ($1, $2)
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = NOW();
```

## 🔄 Flujo Completo de Monitoreo desde UI

### 📱 Interacción Usuario → Sistema

```mermaid
sequenceDiagram
    participant U as 👤 Usuario
    participant FE as 🖥️ Frontend
    participant API as 🎯 API Routes
    participant SM as 📈 StockMonitor
    participant DS as 💾 DatabaseService
    participant DB as 🗄️ Supabase
    participant NOT as 📧 Notifier

    Note over U,NOT: 🖥️ MONITOREO DESDE UI

    U->>FE: Clic en "Verificar Stock"
    FE->>API: GET /api/monitor/check
    API->>SM: checkStock()

    SM->>DS: updateSessionCache(userId)
    DS->>DB: SELECT * FROM products<br/>WHERE user_id = ? AND available_quantity <= ?
    DB-->>DS: [<br/>{id: "MLA123", stock: 2, title: "iPhone"},<br/>{id: "MLA456", stock: 0, title: "Samsung"}<br/>]
    DS-->>SM: lowStockProducts updated

    loop Para cada producto con stock bajo
        SM->>NOT: sendLowStockAlert(product)
        NOT-->>U: 📧 "iPhone tiene solo 2 unidades"
    end

    SM-->>API: {<br/>totalProducts: 9847,<br/>lowStockCount: 15,<br/>lowStockProducts: [...],<br/>source: "webhook_updated_database"<br/>}
    API-->>FE: JSON response
    FE-->>U: 📊 Dashboard actualizado

    Note over U,NOT: ⚡ Datos siempre frescos (actualizados por webhooks)
```

## 📊 Estados del Sistema

| Estado | Descripción | Indicador UI | Acción Requerida |
|--------|-------------|--------------|------------------|
| 🚀 Inicializando | Primera sincronización en curso | "Cargando productos..." | Esperar ~10 minutos |
| ✅ Webhook-Ready | Sistema operativo normal | "Monitoreo activo" | Usar normalmente |
| ⚠️ Datos obsoletos | Sin webhooks recientes | "Última actualización: 2h" | Verificar config ML |
| ❌ Error de BD | Problema con Supabase | "Error de conexión" | Revisar logs |
| 🔄 Sincronizando | Actualización manual | "Sincronizando..." | No interrumpir |

## 📈 Métricas de Performance y Escalabilidad

### ⏱️ Tiempos de Respuesta Esperados

| Operación | Frecuencia | Tiempo Objetivo | Observaciones |
|-----------|------------|----------------|---------------|
| 🚀 Scan inicial completo | 1 vez al setup | ~8-10 minutos | 10,000 productos con rate limiting |
| 🔔 Webhook processing | Tiempo real | <500ms | Requisito crítico de ML |
| 📊 Stock check (UI) | On-demand | <1 segundo | Lectura desde cache |
| 💾 Cache update | Cada webhook | <200ms | Solo productos afectados |
| 🔍 Low stock query | UI request | <100ms | Índice optimizado |
| 📦 Single product update | Por webhook | <50ms | Upsert individual |

### 🛡️ Rate Limiting Implementado

| Componente | Límite | Razón | Configuración |
|------------|--------|-------|---------------|
| 📊 Scan de IDs | 2s entre lotes | Evitar 429 de ML API | `await sleep(2000)` |
| 🔍 Detalles de productos | 1.5s entre lotes de 30 | Rate limit de ML | `await sleep(1500)` |
| ❌ Recovery de errores | 5s pausa extra | Tiempo de recuperación | En catch blocks |
| 🔔 Webhooks individuales | Sin límite | 1 producto por request | Sin pausa necesaria |

### 📊 Capacidad y Límites

| Métrica | Valor Actual | Límite Técnico | Plan de Escalado |
|---------|--------------|----------------|------------------|
| Productos por usuario | ~10,000 | 50,000 | Paginación + índices |
| Webhooks por minuto | Ilimitado | ~1,000 | Batch processing |
| Usuarios concurrentes | 10-50 | 500 | Connection pooling |
| Storage Supabase | ~50MB | 500MB (free) | Plan Pro si necesario |
| API calls ML/hora | ~2,000 | 10,000 | Rate limiting adaptativo |

## 💰 Análisis de Costos

### Antes (Polling)
- 📊 **API Calls**: ~100,000/día (polling cada 10 min)
- 💸 **Costo estimado**: Alto riesgo de rate limiting
- ⏰ **Latencia**: 5-10 minutos promedio

### Después (Webhook-Driven)
- 📊 **API Calls**: ~1,000/día (solo cambios reales)
- 💸 **Costo estimado**: 99% reducción
- ⏰ **Latencia**: <1 segundo

## 🛠️ Configuración de Producción

### 🌍 Variables de Entorno Críticas

#### 🗄️ Base de Datos
```env
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...  # Para operaciones del servidor
```

#### 🔐 MercadoLibre API
```env
MOCK_ML_API=false  # ¡CRÍTICO: false en producción!
ML_CLIENT_ID=123456789
ML_CLIENT_SECRET=xyz...
```

#### ⚙️ Sistema
```env
NODE_ENV=production
PORT=3000
```

#### 📊 Monitoreo (Opcional)
```env
STOCK_THRESHOLD=5      # Override del threshold por defecto
LOG_LEVEL=info         # debug | info | warn | error
```

### 🔧 Configuración ML Panel

```json
{
  "webhook_url": "https://tu-app.vercel.app/api/webhooks/ml",
  "topics": [
    "stock-location",
    "items"
  ],
  "events": [
    "created",
    "updated"
  ]
}
```

### 📋 Checklist de Deploy

- ✅ `MOCK_ML_API=false` en producción
- ✅ Supabase credentials configurados
- ✅ Tablas creadas en Supabase con índices
- ✅ Webhook URL actualizada en ML panel
- ✅ Rate limiting configurado correctamente
- ✅ Logs y monitoreo activos
- ✅ Notificaciones configuradas
- ✅ Cache TTL optimizado
- ✅ Connection pooling habilitado

## 🎉 Beneficios de la Arquitectura Webhook-Driven

### ⚡ Performance
- 99% menos llamadas a ML API después del scan inicial
- Tiempo real en actualizaciones de stock
- <500ms tiempo de respuesta para webhooks
- Cache inteligente para consultas frecuentes

### 💰 Eficiencia de Costos
- Mínimas API calls = menos rate limiting
- Escalabilidad sin aumentar costos ML API
- Plan gratuito Supabase suficiente para 10K productos
- Vercel Hobby plan suficiente para el tráfico

### 🛡️ Robustez
- Persistencia sobrevive restarts de Vercel
- Logging completo de eventos para debugging
- Retry logic en caso de errores
- Validación estricta de webhooks
- Connection pooling para alta concurrencia

### 🔄 Mantenibilidad
- Separación clara de responsabilidades
- Código modular y testeable
- Documentación completa del flujo
- Monitoreo integrado para troubleshooting
- Rate limiting configurable

### 📈 Escalabilidad
- Arquitectura event-driven naturalmente escalable
- Base de datos optimizada con índices
- Cache inteligente reduce carga
- Microservicios ready para futuras expansiones

## 🔍 Casos de Uso y Escenarios

### 📊 Escenario 1: Nuevo Usuario
1. Usuario se registra e inicia sesión
2. Sistema detecta BD vacía → `needsApiSync()` = true
3. Ejecuta scan inicial automático (~10 min)
4. Usuario recibe notificación: "Sistema listo"
5. Webhooks comienzan a funcionar inmediatamente

### ⚡ Escenario 2: Cambio de Stock en ML
1. Usuario vende producto en ML
2. ML detecta cambio → envía webhook
3. Sistema recibe webhook en <100ms
4. Responde a ML con 200 OK
5. Actualiza producto específico en BD
6. Si stock bajo → envía notificación inmediata

### 🔄 Escenario 3: Usuario Consulta Estado
1. Usuario abre dashboard
2. Frontend consulta `/api/monitor/check`
3. Sistema lee desde cache (datos frescos por webhooks)
4. Respuesta en <1 segundo con datos actualizados
5. Dashboard muestra estado en tiempo real

### 🛠️ Escenario 4: Mantenimiento del Sistema
1. Vercel reinicia la aplicación
2. Datos persisten en Supabase
3. Cache se reconstruye automáticamente
4. Webhooks siguen funcionando sin pérdida
5. Sistema operativo en <30 segundos

## 🚨 Troubleshooting y Monitoreo

### 📊 Logs Críticos a Monitorear

```javascript
// Logs de inicialización
"🚀 Iniciando monitoreo webhook-driven con persistencia Supabase..."
"📭 Base de datos vacía - sync inicial necesario"
"✅ Sincronización inicial completada - de ahora en adelante solo webhooks"

// Logs de webhooks
"🔔 Procesando producto desde webhook: MLA123456789"
"✅ Producto MLA123456789 actualizado desde webhook"
"❌ Error procesando producto desde webhook: timeout"

// Logs de performance
"📦 Procesando lote 1/334 de detalles (30 productos)..."
"✅ Lote 1/334 completado: 30 productos obtenidos"
"🎉 Sincronización completa finalizada: 9985 productos guardados"
```

### 🚨 Alertas Críticas

| Condición | Severidad | Acción Requerida |
|-----------|-----------|------------------|
| Webhook IP no autorizada | HIGH | Verificar IPs ML actualizadas |
| Rate limit 429 de ML | MEDIUM | Aumentar delays en rate limiting |
| Error conexión Supabase | HIGH | Verificar credentials y status |
| Webhook timeout >500ms | MEDIUM | Optimizar queries de BD |
| Sin webhooks >1 hora | MEDIUM | Verificar config ML panel |

### 📈 Métricas a Trackear

```javascript
// Métricas de negocio
- Productos totales monitoreados
- Productos con stock bajo
- Webhooks procesados/hora
- Tiempo promedio de procesamiento

// Métricas técnicas
- Uptime del sistema
- Latencia de webhooks
- Error rate de ML API
- Uso de BD (storage/queries)
```

## 🔮 Futuras Mejoras

### 📊 Dashboard Avanzado
- Gráficos de tendencias de stock
- Alertas personalizables por producto
- Reportes de ventas correlacionados
- Predicción de stock-out

### 🔧 Optimizaciones Técnicas
- Cache Redis para mayor performance
- CDN para assets estáticos
- Background jobs para tareas pesadas
- Real-time WebSocket notifications

### 🌐 Integraciones
- Shopify/WooCommerce sync
- WhatsApp Business notifications
- Slack/Discord webhooks
- Google Analytics events

### 📈 Escalabilidad
- Multi-tenant architecture
- Microservices separation
- Auto-scaling basado en carga
- Geographic distribution

---

## 🎯 Sistema Webhook-Driven Completamente Optimizado

✅ **~10,000 productos** • ⚡ **Tiempo real** • 💾 **Persistente** • 🛡️ **Rate limiting** • 🔔 **Event-driven** • 📊 **Monitoreo completo**

**Documentación técnica v1.0 - Sistema de Monitoreo de Stock MercadoLibre**

*Arquitectura diseñada para producción con escalabilidad y robustez empresarial*e