#!/usr/bin/env node

/**
 * Script para configurar el entorno de desarrollo local
 * Crea archivos necesarios y configura todo para testing
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Colores para output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

function log(message, color = 'reset') {
  console.log(colors[color] + message + colors.reset);
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'blue');
}

async function setupLocal() {
  log('\n🚀 Configurando entorno de desarrollo local\n', 'blue');
  
  try {
    // 1. Crear directorio logs si no existe
    if (!fs.existsSync('logs')) {
      fs.mkdirSync('logs');
      logSuccess('Directorio logs creado');
    }
    
    // 2. Generar claves de cifrado para desarrollo
    let secretKey, secretIv;
    
    if (!fs.existsSync('.secret_key') || !fs.existsSync('.secret_iv')) {
      secretKey = crypto.randomBytes(32).toString('hex');
      secretIv = crypto.randomBytes(16).toString('hex');
      
      fs.writeFileSync('.secret_key', secretKey);
      fs.writeFileSync('.secret_iv', secretIv);
      
      logSuccess('Claves de cifrado generadas para desarrollo');
    } else {
      secretKey = fs.readFileSync('.secret_key', 'utf8');
      secretIv = fs.readFileSync('.secret_iv', 'utf8');
      logInfo('Usando claves de cifrado existentes');
    }
    
    // 3. Crear archivo .env.local si no existe
    if (!fs.existsSync('.env.local')) {
      const envContent = `# Configuración para desarrollo local - GENERADO AUTOMÁTICAMENTE
NODE_ENV=development
PORT=3000
LOG_LEVEL=debug

# Para testing sin credenciales reales de Mercado Libre
MOCK_ML_API=true
ENABLE_MOCKS=true
MOCK_PRODUCTS=true
LOG_REQUESTS=true

# Credenciales de Mercado Libre (opcionales para testing con mocks)
ML_CLIENT_ID=test_client_id
ML_CLIENT_SECRET=test_client_secret
ML_REDIRECT_URI=http://localhost:3000/auth/callback

# Claves de cifrado para desarrollo (GENERADAS AUTOMÁTICAMENTE)
SECRET_KEY=${secretKey}
SECRET_IV=${secretIv}

# Configuración de notificaciones para testing
NOTIFICATION_METHOD=console
EMAIL_SERVICE=gmail
EMAIL_USER=test@example.com
EMAIL_PASSWORD=test_password

# Configuración de monitoreo para desarrollo
STOCK_CHECK_INTERVAL=60000  # 1 minuto para testing rápido
STOCK_THRESHOLD=3           # Umbral bajo para testing
`;
      
      fs.writeFileSync('.env.local', envContent);
      logSuccess('Archivo .env.local creado con configuración de desarrollo');
    } else {
      logInfo('Archivo .env.local ya existe');
    }
    
    // 4. Crear directorio public si no existe (para archivos estáticos)
    if (!fs.existsSync('src/public')) {
      fs.mkdirSync('src/public', { recursive: true });
      logSuccess('Directorio público creado');
    }
    
    // 5. Verificar estructura de directorios necesarios
    const requiredDirs = ['src/api', 'src/models', 'src/services', 'src/utils', 'config'];
    for (const dir of requiredDirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        logSuccess(`Directorio ${dir} creado`);
      }
    }
    
    // 6. Mostrar instrucciones finales
    console.log('\n' + '='.repeat(60));
    logSuccess('🎉 Configuración de desarrollo completada!');
    console.log('\n📋 Próximos pasos:');
    logInfo('1. Instalar dependencias: npm install');
    logInfo('2. Ejecutar tests locales: npm run test:local');
    logInfo('3. Iniciar en modo desarrollo con mocks: npm run dev:mock');
    logInfo('4. O iniciar en modo desarrollo normal: npm run dev');
    
    console.log('\n🔧 Comandos disponibles:');
    logInfo('npm run dev:mock     - Desarrollo con API mock (sin credenciales reales)');
    logInfo('npm run dev          - Desarrollo normal');
    logInfo('npm run test:local   - Ejecutar tests locales');
    logInfo('npm run encrypt      - Cifrar credenciales');
    logInfo('npm start            - Modo producción');
    
    console.log('\n📁 Archivos creados:');
    logInfo('.env.local           - Configuración de desarrollo');
    logInfo('.secret_key          - Clave de cifrado');
    logInfo('.secret_iv           - Vector de inicialización');
    logInfo('logs/                - Directorio de logs');
    
    console.log('\n⚠️  Importante:');
    logWarning('Los archivos .env.local, .secret_key y .secret_iv están en .gitignore');
    logWarning('No subas estos archivos a tu repositorio');
    
    console.log('='.repeat(60) + '\n');
    
  } catch (error) {
    logError(`Error durante la configuración: ${error.message}`);
    process.exit(1);
  }
}

// Ejecutar setup si el script se ejecuta directamente
if (require.main === module) {
  setupLocal().catch(error => {
    logError(`Error inesperado: ${error.message}`);
    process.exit(1);
  });
}

module.exports = { setupLocal };