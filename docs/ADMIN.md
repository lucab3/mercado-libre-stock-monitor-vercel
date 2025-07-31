# 🔐 Sistema de Administración

El sistema de administración permite gestionar sesiones de usuarios y monitorear el estado del sistema de manera segura.

## ✨ Características

- **🔑 Autenticación segura**: Login con username/password con hash bcrypt
- **👥 Gestión de sesiones**: Ver todas las sesiones activas de usuarios
- **🚨 Revocación de sesiones**: Cerrar sesiones de usuarios específicos
- **📊 Estadísticas del sistema**: Monitoreo de base de datos, memoria y rendimiento
- **⏱️ Sesiones temporales**: Auto-expiración configurable para seguridad

## 🚀 Configuración

### 1. Habilitar el sistema de administración

Agrega estas variables a tu archivo `.env` o `.env.local`:

```bash
ADMIN_ENABLED=true
ADMIN_USERNAME=admin
ADMIN_PASSWORD=tu_contraseña_segura
ADMIN_SESSION_TIMEOUT=3600000  # 1 hora en millisegundos
```

## 🌐 Acceso al Panel

Una vez configurado, accede al panel de administración en:

```
http://localhost:3000/admin/login
```

O en producción:

```
https://tu-dominio.com/admin/login
```

## 🔧 Funcionalidades

### Panel Principal (`/admin/dashboard`)

- **📈 Estadísticas en tiempo real**:
  - Usuarios activos
  - Sesiones totales
  - Productos en base de datos
  - Tiempo de actividad del sistema

- **👥 Gestión de sesiones de usuarios**:
  - Lista completa de sesiones activas
  - Información de última actividad
  - Botón para revocar sesiones por usuario

- **🔐 Sesiones de administradores**:
  - Monitor de sesiones admin activas
  - Tiempos de creación y expiración

### API Endpoints

#### `GET /admin/api/stats`
Obtiene estadísticas del sistema en formato JSON.

#### `POST /admin/api/revoke-sessions`
Revoca todas las sesiones de un usuario específico.

```json
{
  "userId": "MLU1234567890"
}
```

## 🔒 Seguridad

### Características de Seguridad

1. **🔐 Hashing de contraseñas**: Utiliza bcrypt con salt rounds de 12
2. **⏱️ Sesiones temporales**: Expiración automática configurable
3. **🍪 Cookies seguras**: HttpOnly, SameSite, Secure en producción
4. **📝 Logging de seguridad**: Registro de intentos de login fallidos
5. **🚫 Protección de rutas**: Middleware de autenticación en todas las rutas protegidas

### Buenas Prácticas

- **Contraseña fuerte**: Mínimo 8 caracteres, combina letras, números y símbolos
- **Actualización regular**: Cambia la contraseña periódicamente
- **Monitoreo de logs**: Revisa regularmente los logs de acceso
- **Sesiones cortas**: Configura timeouts apropiados para tu entorno

## 🛠️ Desarrollo

### Estructura de Archivos

```
src/
├── services/adminService.js      # Lógica de negocio admin
├── controllers/adminController.js # Controladores HTTP
├── middleware/adminAuth.js       # Middleware de autenticación
├── api/admin.js                 # Rutas API
└── app.js                       # Integración con Express
```

### Extender Funcionalidades

Para agregar nuevas funcionalidades administrativas:

1. **Agregar método en `adminService.js`**
2. **Crear endpoint en `adminController.js`**
3. **Agregar ruta en `api/admin.js`**
4. **Actualizar interfaz en `showDashboard()`**

### Testing

```bash
# Verificar configuración
curl http://localhost:3000/admin/login

# Test de autenticación
curl -X POST http://localhost:3000/admin/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin&password=tu_contraseña"
```

## 📊 Monitoreo

### Logs de Administración

El sistema registra todas las actividades administrativas:

- ✅ Login exitoso
- ❌ Intentos de login fallidos
- 🚨 Revocación de sesiones
- ⏰ Expiración de sesiones
- 🔄 Limpieza automática

### Alertas de Seguridad

Monitorea estos eventos en los logs:

```
🚨 Intento de login admin fallido: [username] desde [IP]
🔑 Sesión admin creada para [username]
🚨 Admin [username] revocó [count] sesiones del usuario [userId]
```

## ❓ Troubleshooting

### Problemas Comunes

1. **"Sistema de administración deshabilitado"**
   - Verifica que `ADMIN_ENABLED=true`
   - Reinicia el servidor

2. **"Credenciales incorrectas"**
   - Verifica el hash de contraseña
   - Asegúrate de usar el username correcto

3. **"Sesión expirada"**
   - Aumenta `ADMIN_SESSION_TIMEOUT`
   - Haz login nuevamente

4. **Error de bcrypt**
   - Instala bcrypt: `npm install bcrypt`
   - En algunos sistemas: `npm install bcrypt --build-from-source`

### Logs Útiles

```bash
# Ver logs de administración
grep "Admin\|admin\|🔐" logs/app.log

# Ver intentos de login fallidos
grep "🚨.*admin.*fallido" logs/app.log
```

## 🔄 Migración y Backup

### Respaldo de Configuración

Guarda de forma segura:
- Variables de entorno admin (`ADMIN_*`)
- Hash de contraseña
- Configuración de timeouts

### Actualización de Contraseña

1. Genera nuevo hash: `npm run generate-admin-password nueva_contraseña`
2. Actualiza `ADMIN_PASSWORD` en .env
3. Reinicia el servidor
4. Las sesiones existentes se mantendrán hasta expirar

---

**⚠️ Importante**: Nunca compartas el hash de contraseña ni las credenciales de administrador. Mantén los archivos `.env` fuera del control de versiones.