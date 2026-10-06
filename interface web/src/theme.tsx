import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

/**
 * Temas de acento de analytics.
 *
 * No cambian cada clase de color a mano: el acento de la app es la familia
 * `amber` de Tailwind (botones, nav activo, wizard, degradados...). Como
 * Tailwind v4 compila cada utilidad a `var(--color-amber-400)`, redefiniendo
 * esas variables por tema se recolorea toda la interfaz. El tema activo se
 * marca en `<html data-theme="...">` y los valores viven en `index.css`.
 */
export type ThemeId = "amber" | "blue" | "emerald" | "violet" | "rose";

/** Modo claro/oscuro. Se combina con el tema de acento (son ejes independientes). */
export type ModeId = "light" | "dark";

export interface ThemeOption {
  id: ThemeId;
  label: string;
  /** Color de muestra del panel (tono 500 del tema). */
  swatch: string;
}

export const THEMES: ThemeOption[] = [
  { id: "amber", label: "Ámbar", swatch: "#f59e0b" },
  { id: "blue", label: "Azul", swatch: "#3b82f6" },
  { id: "emerald", label: "Esmeralda", swatch: "#10b981" },
  { id: "violet", label: "Violeta", swatch: "#8b5cf6" },
  { id: "rose", label: "Rosa", swatch: "#f43f5e" },
];

export const MODES: { id: ModeId; label: string }[] = [
  { id: "light", label: "Claro" },
  { id: "dark", label: "Oscuro" },
];

const STORAGE_KEY = "mercaldas-analytics-theme";
const STORAGE_KEY_MODE = "mercaldas-analytics-mode";
const DEFAULT_THEME: ThemeId = "blue";
const DEFAULT_MODE: ModeId = "light";

function isThemeId(value: string | null): value is ThemeId {
  return !!value && THEMES.some((t) => t.id === value);
}

function readStoredTheme(): ThemeId {
  if (typeof window === "undefined") return DEFAULT_THEME;
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return isThemeId(saved) ? saved : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

function isModeId(value: string | null): value is ModeId {
  return value === "light" || value === "dark";
}

function readStoredMode(): ModeId {
  if (typeof window === "undefined") return DEFAULT_MODE;
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY_MODE);
    return isModeId(saved) ? saved : DEFAULT_MODE;
  } catch {
    return DEFAULT_MODE;
  }
}

interface ThemeContextValue {
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
  mode: ModeId;
  setMode: (mode: ModeId) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: DEFAULT_THEME,
  setTheme: () => {},
  mode: DEFAULT_MODE,
  setMode: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(() => {
    const initial = readStoredTheme();
    // Aplica el tema antes del primer pintado para evitar un flash de color.
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", initial);
    }
    return initial;
  });

  const [mode, setModeState] = useState<ModeId>(() => {
    const initial = readStoredMode();
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-mode", initial);
    }
    return initial;
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // localStorage puede no estar disponible; el tema igual se aplica.
    }
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute("data-mode", mode);
    // Ajusta el color de la barra del navegador / controles nativos.
    document.documentElement.style.colorScheme = mode;
    try {
      window.localStorage.setItem(STORAGE_KEY_MODE, mode);
    } catch {
      // localStorage puede no estar disponible; el modo igual se aplica.
    }
  }, [mode]);

  const setTheme = useCallback((next: ThemeId) => setThemeState(next), []);
  const setMode = useCallback((next: ModeId) => setModeState(next), []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, mode, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
