/**
 * Formatea una fecha a string en formato ISO (YYYY-MM-DD)
 */
export function formatDateToISO(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Formatea una fecha a string con hora (YYYY-MM-DD HH:mm:ss)
 */
export function formatDateTime(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');

  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * Obtiene el inicio del día para una fecha
 */
export function getStartOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

/**
 * Obtiene el fin del día para una fecha
 */
export function getEndOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

/**
 * Obtiene el inicio de la semana (lunes)
 */
export function getStartOfWeek(date: Date): Date {
  const result = new Date(date);
  const day = result.getDay();
  const diff = result.getDate() - day + (day === 0 ? -6 : 1);
  result.setDate(diff);
  result.setHours(0, 0, 0, 0);
  return result;
}

/**
 * Obtiene el fin de la semana (domingo)
 */
export function getEndOfWeek(date: Date): Date {
  const start = getStartOfWeek(date);
  const result = new Date(start);
  result.setDate(result.getDate() + 6);
  result.setHours(23, 59, 59, 999);
  return result;
}

/**
 * Obtiene el inicio del mes
 */
export function getStartOfMonth(date: Date): Date {
  const result = new Date(date);
  result.setDate(1);
  result.setHours(0, 0, 0, 0);
  return result;
}

/**
 * Obtiene el fin del mes
 */
export function getEndOfMonth(date: Date): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + 1);
  result.setDate(0);
  result.setHours(23, 59, 59, 999);
  return result;
}

/**
 * Compara dos fechas (solo día, mes, año)
 */
export function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

/**
 * Compara dos fechas (solo mes y año)
 */
export function isSameMonth(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth()
  );
}

/**
 * Compara dos fechas (solo año)
 */
export function isSameYear(date1: Date, date2: Date): boolean {
  return date1.getFullYear() === date2.getFullYear();
}

/**
 * Calcula la edad a partir de la fecha de nacimiento
 */
export function calculateAge(birthDate: Date): number {
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();

  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < birthDate.getDate())
  ) {
    age--;
  }

  return age;
}

/**
 * Valida si una fecha es válida
 */
export function isValidDate(date: any): boolean {
  if (date instanceof Date) {
    return !isNaN(date.getTime());
  }
  if (typeof date === 'string') {
    const d = new Date(date);
    return !isNaN(d.getTime());
  }
  return false;
}

/**
 * Parsea una fecha de forma segura
 */
export function parseDateSafe(
  date: string | Date | null | undefined,
): Date | null {
  if (!date) return null;
  const d = new Date(date);
  return isValidDate(d) ? d : null;
}

/**
 * Normaliza una marca de tiempo al formato ISO 8601.
 *
 * Postgres entrega sus `timestamptz` como texto ("2026-09-16 20:12:57.406364+00")
 * porque las columnas están declaradas con `mode: 'string'`. Ese formato no es
 * ISO 8601 y los motores JS estrictos (Hermes, el de React Native) devuelven
 * `Invalid Date` al intentar parsearlo, así que se convierte antes de responder.
 */
export function toIsoTimestamp(
  value: string | Date | null | undefined,
): string | null {
  const date = parseDateSafe(value);
  return date ? date.toISOString() : null;
}

/**
 * Obtiene la diferencia en días entre dos fechas
 */
export function daysBetween(date1: Date, date2: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const diff = Math.abs(date1.getTime() - date2.getTime());
  return Math.floor(diff / msPerDay);
}

/**
 * Obtiene la diferencia en horas entre dos fechas
 */
export function hoursBetween(date1: Date, date2: Date): number {
  const msPerHour = 60 * 60 * 1000;
  const diff = Math.abs(date1.getTime() - date2.getTime());
  return Math.floor(diff / msPerHour);
}
