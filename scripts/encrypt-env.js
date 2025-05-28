#!/usr/bin/env node

/**
 * Script para cifrar valores para el archivo .env
 * 
 * Uso: node scripts/encrypt-env.js VALOR_A_CIFRAR
 */

const path = require('path');
const cryptoHelper = require('../src/utils/cryptoHelper');

// Verificar argumentos
if (process.argv.length < 3) {
  console.error('Error: Debes proporcionar un valor para cifrar');
  console.error('Uso: node scripts/encrypt-env.js VALOR_A_CIFRAR');
  process.exit(1);
}

// Obtener el valor a cifrar
const valueToEncrypt = process.argv[2];

try {
  // Cifrar el valor
  const encryptedValue = cryptoHelper.encrypt(valueToEncrypt);
  
  console.log('\n==================================================');
  console.log('               VALOR CIFRADO                      ');
  console.log('==================================================');
  console.log('\nValor original: ', valueToEncrypt);
  console.log('Valor cifrado:  ', encryptedValue);
  console.log('\nUtiliza este valor cifrado en tu archivo .env');
  console.log('Ejemplo: ML_CLIENT_SECRET=', encryptedValue);
  console.log('\n==================================================');
  
} catch (error) {
  console.error('Error al cifrar el valor:', error.message);
  process.exit(1);
}