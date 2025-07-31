/**
 * Obtener la IP real del cliente considerando proxies de Vercel
 */
function getRealClientIP(req) {
  // En Vercel, la IP real viene en x-forwarded-for y x-real-ip
  const xForwardedFor = req.headers['x-forwarded-for'];
  const xRealIP = req.headers['x-real-ip'];
  
  // x-forwarded-for puede contener múltiples IPs separadas por comas
  if (xForwardedFor) {
    const ip = xForwardedFor.split(',')[0].trim();
    if (ip && ip !== '127.0.0.1' && ip !== 'localhost') {
      return ip;
    }
  }
  
  // Fallback a x-real-ip
  if (xRealIP && xRealIP !== '127.0.0.1' && xRealIP !== 'localhost') {
    return xRealIP;
  }
  
  // Último fallback (aunque será 127.0.0.1 en Vercel)
  return req.ip || 'unknown';
}

/**
 * Validar si una IP está en la lista de IPs permitidas
 */
function isIPAllowed(clientIP, allowedIPs) {
  if (!allowedIPs || allowedIPs.length === 0) {
    return true; // Sin restricciones
  }

  if (!clientIP || clientIP === 'unknown') {
    return false;
  }

  return allowedIPs.includes(clientIP);
}

/**
 * Obtener lista de IPs permitidas desde variable de entorno
 */
function getAllowedIPs() {
  const allowedIPsEnv = process.env.ALLOWED_IPS;
  
  if (!allowedIPsEnv) {
    return []; // Sin restricciones
  }

  return allowedIPsEnv
    .split(',')
    .map(ip => ip.trim())
    .filter(ip => ip.length > 0);
}

module.exports = {
  getRealClientIP,
  isIPAllowed,
  getAllowedIPs
};