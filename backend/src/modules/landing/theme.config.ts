/**
 * Temas de color del cliente (claro y oscuro).
 *
 * El cliente sólo alterna entre claro y oscuro; los colores de cada tema se
 * configuran desde el admin (`/contenido/general`) y se guardan como
 * personalizaciones dentro del ajuste `general_logo`. La API devuelve siempre
 * la paleta **efectiva** (por defecto + personalizaciones), de modo que el
 * cliente sólo tiene que pintar lo que recibe.
 */

/** Tokens de color configurables. Deben existir en `styles/theme.css`. */
export const THEME_TOKENS = [
  '--background',
  '--foreground',
  '--card',
  '--card-foreground',
  '--popover',
  '--popover-foreground',
  '--primary',
  '--primary-foreground',
  '--secondary',
  '--secondary-foreground',
  '--muted',
  '--muted-foreground',
  '--accent',
  '--accent-foreground',
  '--border',
  '--ring',
] as const;

export type ThemeName = 'claro' | 'oscuro';
export type ThemePalette = Record<string, string>;
export type ThemeConfig = Record<ThemeName, ThemePalette>;

/**
 * Valores por defecto de cada tema. Son los mismos que `styles/theme.css` del
 * cliente, que actúa de respaldo si la API no responde.
 */
export const DEFAULT_THEMES: ThemeConfig = {
  claro: {
    '--background': '#ffffff',
    '--foreground': '#1a1a2e',
    '--card': '#ffffff',
    '--card-foreground': '#1a1a2e',
    '--popover': '#ffffff',
    '--popover-foreground': '#1a1a2e',
    '--primary': '#fff200',
    '--primary-foreground': '#1a1a2e',
    '--secondary': '#1a1a2e',
    '--secondary-foreground': '#fff200',
    '--muted': '#f4f4f6',
    '--muted-foreground': '#6b7280',
    '--accent': '#ff4444',
    '--accent-foreground': '#ffffff',
    '--border': 'rgba(0, 0, 0, 0.08)',
    '--ring': '#fff200',
  },
  oscuro: {
    '--background': '#0f0f1a',
    '--foreground': '#f5f5f7',
    '--card': '#1a1a26',
    '--card-foreground': '#f5f5f7',
    '--popover': '#1a1a26',
    '--popover-foreground': '#f5f5f7',
    '--primary': '#fff200',
    '--primary-foreground': '#1a1a2e',
    '--secondary': '#2d2d44',
    '--secondary-foreground': '#f5f5f7',
    '--muted': '#26263d',
    '--muted-foreground': '#a1a1aa',
    '--accent': '#ff6b6b',
    '--accent-foreground': '#1a1a2e',
    '--border': 'rgba(255, 255, 255, 0.14)',
    '--ring': '#fff200',
  },
};

/** Acepta hex (#rgb / #rrggbb / #rrggbbaa) y rgb()/rgba()/hsl()/hsla(). */
const COLOR_RE = /^(#[0-9a-fA-F]{3,8}|(?:rgb|rgba|hsl|hsla)\([0-9.,%\s/]+\))$/;

/**
 * Normaliza lo recibido desde el admin: se queda sólo con tokens conocidos
 * cuyo valor sea un color válido (evita guardar basura o CSS arbitrario).
 */
export function sanitizeTheme(input: unknown): Partial<ThemeConfig> {
  if (!input || typeof input !== 'object') return {};
  const source = input as Record<string, unknown>;
  const out: Partial<ThemeConfig> = {};

  for (const name of ['claro', 'oscuro'] as ThemeName[]) {
    const palette = source[name];
    if (!palette || typeof palette !== 'object') continue;
    const clean: ThemePalette = {};
    for (const token of THEME_TOKENS) {
      const raw = (palette as Record<string, unknown>)[token];
      if (typeof raw !== 'string') continue;
      const value = raw.trim();
      if (value.length === 0 || value.length > 64) continue;
      if (!COLOR_RE.test(value)) continue;
      clean[token] = value;
    }
    // `{ claro: {} }` es una petición válida: significa "volver a por defecto".
    out[name] = clean;
  }

  return out;
}

/** Paleta efectiva: valores por defecto con las personalizaciones encima. */
export function mergeTheme(overrides: Partial<ThemeConfig> = {}): ThemeConfig {
  return {
    claro: { ...DEFAULT_THEMES.claro, ...(overrides.claro ?? {}) },
    oscuro: { ...DEFAULT_THEMES.oscuro, ...(overrides.oscuro ?? {}) },
  };
}
