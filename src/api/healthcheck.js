/**
 * Endpoint de verificación de salud para Vercel
 * Las funciones serverless en Vercel necesitan este tipo de endpoints
 * para verificar que la aplicación está funcionando correctamente
 */

module.exports = (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'El servicio está funcionando correctamente',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'production',
    vercel: true
  });
};