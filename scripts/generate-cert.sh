#!/bin/bash

# Script para generar certificados SSL autofirmados
# Este script genera certificados para localhost

# Crear directorio para certificados si no existe
mkdir -p ssl

# Generar certificado y clave privada
openssl req -x509 -newkey rsa:4096 -keyout ssl/key.pem -out ssl/cert.pem -days 365 -nodes -subj "/CN=localhost"

echo "Certificados SSL generados correctamente"
echo "  - Clave privada: ssl/key.pem"
echo "  - Certificado: ssl/cert.pem"
echo ""
echo "IMPORTANTE: Estos son certificados autofirmados para desarrollo local."
echo "            El navegador mostrará una advertencia de seguridad que deberás aceptar."