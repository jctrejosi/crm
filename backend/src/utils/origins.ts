/**
 * Utilidades para reconocer orígenes de la red local.
 *
 * Los paneles (`admin`, `picking`, `delivery`…) se abren desde el celular con la
 * IP del equipo servidor, y esa IP cambia con cada red. En vez de mantener una
 * lista de IPs que hay que editar cada vez, se reconoce el origen por su forma.
 */

/** ¿Es un host local o de red privada? (localhost, *.local, 10/8, 172.16/12, 192.168/16) */
export function isPrivateHostname(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '127.0.0.1') return true;
  if (hostname.endsWith('.local')) return true;
  if (hostname.startsWith('10.') || hostname.startsWith('192.168.')) return true;
  // 172.16.0.0 – 172.31.255.255
  const m = /^172\.(\d+)\./.exec(hostname);
  return m != null && Number(m[1]) >= 16 && Number(m[1]) <= 31;
}

/** ¿El origen (`http://host:puerto`) pertenece a la red local? */
export function isLanOrigin(origin: string): boolean {
  try {
    const { hostname, protocol } = new URL(origin);
    if (protocol !== 'http:' && protocol !== 'https:') return false;
    return isPrivateHostname(hostname);
  } catch {
    return false;
  }
}
