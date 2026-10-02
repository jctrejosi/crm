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

const STORAGE_KEY = "mercaldas-analytics-theme";
const DEFAULT_THEME: ThemeId = "blue";

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

interface ThemeContextValue {
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: DEFAULT_THEME,
  setTheme: () => {},
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

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // localStorage puede no estar disponible; el tema igual se aplica.
    }
  }, [theme]);

  const setTheme = useCallback((next: ThemeId) => setThemeState(next), []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
