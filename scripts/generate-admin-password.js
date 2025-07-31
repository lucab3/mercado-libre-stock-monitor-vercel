/**
 * Script para generar hash de password de administrador
 * Uso: node scripts/generate-admin-password.js [password]
 */

const bcrypt = require('bcrypt');

async function generateAdminPassword() {
  const password = process.argv[2];
  
  if (!password) {
    console.error('❌ Error: Debes proporcionar una contraseña');
    console.log('Uso: node scripts/generate-admin-password.js <password>');
    process.exit(1);
  }

  if (password.length < 8) {
    console.error('❌ Error: La contraseña debe tener al menos 8 caracteres');
    process.exit(1);
  }

  try {
    console.log('🔐 Generando hash de contraseña...');
    
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    
    console.log('\n✅ Hash generado exitosamente:');
    console.log('='.repeat(80));
    console.log(`ADMIN_PASSWORD=${hashedPassword}`);
    console.log('='.repeat(80));
    console.log('\n📝 Instrucciones:');
    console.log('1. Copia el hash completo (incluyendo ADMIN_PASSWORD=)');
    console.log('2. Agrégalo a tu archivo .env o .env.local');
    console.log('3. Establece ADMIN_ENABLED=true');
    console.log('4. Opcionalmente configura ADMIN_USERNAME (por defecto: admin)');
    console.log('\n🔒 Ejemplo de configuración completa en .env:');
    console.log('ADMIN_ENABLED=true');
    console.log('ADMIN_USERNAME=admin');
    console.log(`ADMIN_PASSWORD=${hashedPassword}`);
    console.log('ADMIN_SESSION_TIMEOUT=3600000  # 1 hora');
    
  } catch (error) {
    console.error('❌ Error generando hash:', error.message);
    process.exit(1);
  }
}

generateAdminPassword();