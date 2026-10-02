/**
 * Calcula la distancia entre dos puntos en metros usando la fórmula del haversine
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371e3; // Radio de la Tierra en metros
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Verifica si un punto está dentro del radio de otro
 */
export function isWithinRadius(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  radiusMeters: number,
): boolean {
  const distance = calculateDistance(lat1, lon1, lat2, lon2);
  return distance <= radiusMeters;
}

/**
 * Valida si las coordenadas son válidas
 */
export function isValidCoordinates(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): boolean {
  if (latitude === null || latitude === undefined) return false;
  if (longitude === null || longitude === undefined) return false;
  if (isNaN(latitude) || isNaN(longitude)) return false;
  if (latitude < -90 || latitude > 90) return false;
  if (longitude < -180 || longitude > 180) return false;
  return true;
}

/**
 * Obtiene la precisión de GPS en texto
 */
export function getGpsPrecisionLabel(accuracy: number | null): {
  label: string;
  color: string;
} {
  if (accuracy === null || accuracy === undefined) {
    return { label: 'No disponible', color: 'bg-gray-100 text-gray-500' };
  }

  if (accuracy <= 5) {
    return { label: 'Excelente', color: 'bg-green-100 text-green-700' };
  }

  if (accuracy <= 15) {
    return { label: 'Buena', color: 'bg-blue-100 text-blue-700' };
  }

  if (accuracy <= 30) {
    return { label: 'Regular', color: 'bg-yellow-100 text-yellow-700' };
  }

  return { label: 'Baja', color: 'bg-red-100 text-red-700' };
}

export interface ParsedPoint {
  lng: number;
  lat: number;
}

/**
 * Interpreta el punto que guardan las columnas `location` (son de tipo `text`).
 *
 * El formato normal es WKT, p. ej. `POINT(-75.5188 5.0329)`. Pero un `::geometry`
 * suelto en SQL guarda la geometría como hexadecimal EWKB (`0101000000…`) y el
 * valor se perdía en silencio: los mapas se quedaban sin destino y las rutas
 * respondían "el pedido no tiene coordenadas". Aquí se aceptan ambos formatos.
 */
export function parsePointText(
  value: string | null | undefined,
): ParsedPoint | null {
  if (!value) return null;
  const text = String(value).trim();

  const wkt = text.match(
    /POINT\s*\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)/i,
  );
  if (wkt) return { lng: parseFloat(wkt[1]), lat: parseFloat(wkt[2]) };

  return parseEwkbPoint(text);
}

/**
 * Punto a partir de EWKB hexadecimal (lo que Postgres devuelve/guarda al pasar
 * por `geometry`). Estructura: 1 byte de orden de bytes, 4 de tipo y, si el tipo
 * trae el flag 0x20000000, 4 más de SRID; después los dos doubles del punto.
 */
function parseEwkbPoint(text: string): ParsedPoint | null {
  if (!/^(00|01)[0-9a-f]{38,}$/i.test(text)) return null;

  const buffer = Buffer.from(text, 'hex');
  if (buffer.length < 21) return null;

  const littleEndian = buffer[0] === 1;
  const type = littleEndian ? buffer.readUInt32LE(1) : buffer.readUInt32BE(1);
  const baseType = type & 0xff;
  if (baseType !== 1) return null; // solo puntos de 2 dimensiones
  if ((type & 0x40000000) !== 0 || (type & 0x80000000) !== 0) return null; // Z/M

  const offset = (type & 0x20000000) !== 0 ? 9 : 5;
  if (buffer.length < offset + 16) return null;

  const lng = littleEndian
    ? buffer.readDoubleLE(offset)
    : buffer.readDoubleBE(offset);
  const lat = littleEndian
    ? buffer.readDoubleLE(offset + 8)
    : buffer.readDoubleBE(offset + 8);

  if (!isValidCoordinates(lat, lng)) return null;
  return { lng, lat };
}
