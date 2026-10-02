import { getCountries, getCountryCallingCode } from "libphonenumber-js";

export interface PhonePrefix {
  /** Código ISO del país (ej. "CO"). */
  code: string;
  /** Nombre del país en español (ej. "Colombia"). */
  name: string;
  /** Código de marcado sin el "+" (ej. "57"). */
  dial: string;
}

let cache: PhonePrefix[] | null = null;

/**
 * Lista de prefijos telefónicos (ISO + nombre en español + código de marcado),
 * ordenada alfabéticamente con Colombia primero. Usa `libphonenumber-js` para
 * los códigos y `Intl.DisplayNames` para los nombres localizados.
 */
export function getPhonePrefixes(): PhonePrefix[] {
  if (cache) return cache;

  let display: Intl.DisplayNames | null = null;
  try {
    // Algunos navegadores/entornos no soportan DisplayNames: se usa el ISO.
    display = new Intl.DisplayNames(["es"], { type: "region" });
  } catch {
    display = null;
  }

  const list: PhonePrefix[] = getCountries().map((code) => {
    let name: string = code;
    try {
      name = display?.of(code) ?? code;
    } catch {
      name = code;
    }
    return { code, name, dial: getCountryCallingCode(code) };
  });

  list.sort((a, b) => a.name.localeCompare(b.name, "es"));

  // Colombia primero (país por defecto de la tienda).
  const co = list.findIndex((p) => p.code === "CO");
  if (co > 0) list.unshift(list.splice(co, 1)[0]);

  cache = list;
  return list;
}

/** Prefijo por defecto: Colombia (+57). */
export const DEFAULT_PHONE_PREFIX: PhonePrefix =
  getPhonePrefixes().find((p) => p.code === "CO") ?? {
    code: "CO",
    name: "Colombia",
    dial: "57",
  };

/**
 * Arma el número en formato internacional a partir del prefijo y lo digitado:
 * limpia todo lo que no sea dígito, quita ceros iniciales y evita duplicar el
 * prefijo de país si el usuario ya lo escribió.
 */
export function buildInternationalPhone(dial: string, raw: string): string {
  let digits = raw.replace(/\D/g, "");
  digits = digits.replace(/^0+/, "");
  if (dial && digits.startsWith(dial)) return digits;
  return `${dial}${digits}`;
}
