#!/usr/bin/env node

/**
 * Script para generar claves secretas para utilizar en Railway
 * Genera los valores SECRET_KEY y SECRET_IV como variables de entorno
 */

const crypto = require('crypto');

// Generar clave secreta (32 bytes = 256 bits)
const secretKey = crypto.randomBytes(32).toString('hex');

// Generar vector de inicialización (16 bytes = 128 bits)
const secretIv = crypto.randomBytes(16).toString('hex');

console.log('\n==================================================');
console.log('        CLAVES PARA VARIABLES DE ENTORNO          ');
console.log('==================================================');
console.log('\nAnota estos valores para configurarlos en Railway:');
console.log('\nSECRET_KEY=' + secretKey);
console.log('SECRET_IV=' + secretIv);
console.log('\n==================================================');
console.log('IMPORTANTE: Guarda estos valores en un lugar seguro.');
console.log('Son necesarios para descifrar tus credenciales.');
console.log('==================================================\n');