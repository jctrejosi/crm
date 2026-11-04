import { useState, useEffect, useRef, useCallback } from "react";
import footerLogo from "./assets/logo.png";
import sidebarLogo from "./assets/logo.png";
import {
  LayoutDashboard,
  Send,
  Search,
  Bell,
  ChevronRight,
  ChevronDown,
  User,
  HelpCircle,
  Command,
  LogOut,
  ChevronLeft,
  AlertTriangle,
  Info,
  Palette,
  Check,
  Sun,
  Moon,
  Loader2,
  LineChart,
} from "lucide-react";
import Dashboard from "./views/Dashboard";
import Campaigns from "./views/Campaigns";
import Mercado from "./views/Mercado";
import Login from "./components/Login";
import { authService, type UserProfile } from "./services/auth.service";
import {
  marketService,
  type AppNotification,
} from "./services/market.service";
import { THEMES, MODES, useTheme } from "./theme";

export type ViewId = "dashboard" | "campaigns" | "mercado";

interface NavItem {
  id: ViewId;
  label: string;
  icon: React.ElementType;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const NAV: NavSection[] = [
  {
    title: "Visión General",
    items: [{ id: "dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    title: "Marketing",
    items: [
      { id: "campaigns", label: "Campañas", icon: Send },
      { id: "mercado", label: "Mercado", icon: LineChart },
    ],
  },
];

const VIEW_PATHS: Record<string, ViewId> = {
  "": "dashboard",
  dashboard: "dashboard",
  campaigns: "campaigns",
  mercado: "mercado",
};

const VIEW_SLUGS: Record<ViewId, string> = {
  dashboard: "dashboard",
  campaigns: "campaigns",
  mercado: "mercado",
};

const LABELS: Record<ViewId, string> = {
  dashboard: "Dashboard",
  campaigns: "Campañas",
  mercado: "Mercado",
};

const QUICK_COMMANDS = [
  { icon: LayoutDashboard, label: "Ir al Dashboard", view: "dashboard" as ViewId },
  { icon: Send, label: "Ver campañas", view: "campaigns" as ViewId },
  { icon: LineChart, label: "Radar de precios", view: "mercado" as ViewId },
];

function useViewFromUrl(): [ViewId, (v: ViewId) => void] {
  const path = location.pathname.replace(/^\/+/g, "");
  const [view, setView] = useState<ViewId>(VIEW_PATHS[path] || "dashboard");

  // Ruta inexistente → redirigir a la raíz del proyecto
  useEffect(() => {
    if (!(path in VIEW_PATHS)) {
      history.replaceState(null, "", "/");
      setView("dashboard");
    }
  }, [path]);

  useEffect(() => {
    const onPop = () => {
      const p = location.pathname.replace(/^\/+/g, "");
      if (!(p in VIEW_PATHS)) {
        history.replaceState(null, "", "/");
        setView("dashboard");
        return;
      }
      setView(VIEW_PATHS[p]);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = useCallback((v: ViewId) => {
    setView(v);
    history.pushState(null, "", `/${VIEW_SLUGS[v]}`);
  }, []);

  return [view, navigate];
}

function CommandPalette({
  onNavigate,
  onClose,
}: {
  onNavigate: (v: ViewId) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = QUICK_COMMANDS.filter((c) =>
    c.label.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4 cursor-pointer"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-surface rounded-2xl shadow-2xl border border-gray-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
          <Search size={16} className="text-gray-400 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar o ejecutar comando..."
            className="flex-1 outline-none text-sm text-gray-800 placeholder-gray-400"
          />
          <kbd className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded font-mono">
            ESC
          </kbd>
        </div>
        <div className="py-2 max-h-80 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400">
              Sin resultados
            </div>
          ) : (
            filtered.map((cmd) => (
              <button
                key={cmd.label}
                onClick={() => {
                  onNavigate(cmd.view);
                  onClose();
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-amber-50 text-left transition-colors group"
              >
                <div className="w-8 h-8 rounded-lg bg-gray-100 group-hover:bg-amber-100 flex items-center justify-center shrink-0 transition-colors">
                  <cmd.icon
                    size={15}
                    className="text-gray-500 group-hover:text-amber-600"
                  />
                </div>
                <span className="text-sm text-gray-700">{cmd.label}</span>
                <ChevronRight
                  size={14}
                  className="ml-auto text-gray-300 group-hover:text-amber-400"
                />
              </button>
            ))
          )}
        </div>
        <div className="px-4 py-2.5 border-t border-gray-100 flex items-center gap-4">
          <span className="flex items-center gap-1 text-xs text-gray-400">
            <kbd className="bg-gray-100 px-1.5 py-0.5 rounded font-mono">↑↓</kbd> navegar
          </span>
          <span className="flex items-center gap-1 text-xs text-gray-400">
            <kbd className="bg-gray-100 px-1.5 py-0.5 rounded font-mono">↵</kbd> abrir
          </span>
          <span className="flex items-center gap-1 text-xs text-gray-400">
            <kbd className="bg-gray-100 px-1.5 py-0.5 rounded font-mono">ESC</kbd> cerrar
          </span>
        </div>
      </div>
    </div>
  );
}

const NOTIFICATION_META = {
  error: { Icon: AlertTriangle, color: "text-red-600 bg-red-50" },
  warning: { Icon: AlertTriangle, color: "text-amber-500 bg-amber-50" },
  info: { Icon: Info, color: "text-blue-500 bg-blue-50" },
} as const;

function relativeTime(iso: string): string {
  const minutes = Math.max(
    1,
    Math.round((Date.now() - new Date(iso).getTime()) / 60000),
  );
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `hace ${hours} h`;
  return `hace ${Math.round(hours / 24)} d`;
}

function Notifications({ onRead }: { onRead: () => void }) {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    marketService
      .notifications(false, 30)
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  const markAll = async () => {
    try {
      await marketService.markAllRead();
      setItems((current) =>
        current.map((n) => ({
          ...n,
          readAt: n.readAt ?? new Date().toISOString(),
        })),
      );
      onRead();
    } catch {
      /* la campana no debe romper la sesión si el backend no responde */
    }
  };

  const markOne = async (item: AppNotification) => {
    if (item.readAt) return;
    try {
      await marketService.markRead(item.id);
      setItems((current) =>
        current.map((n) =>
          n.id === item.id
            ? { ...n, readAt: new Date().toISOString() }
            : n,
        ),
      );
      onRead();
    } catch {
      /* idem */
    }
  };

  return (
    <div
      className="absolute right-0 top-full mt-2 w-96 bg-surface rounded-xl shadow-xl border border-gray-200 z-40"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <span className="font-semibold text-sm text-gray-900">Notificaciones</span>
        <button
          onClick={markAll}
          className="text-xs text-amber-600 hover:text-amber-700 font-medium"
        >
          Marcar todo como leído
        </button>
      </div>
      <div className="max-h-96 overflow-y-auto divide-y divide-gray-50">
        {loading && (
          <div className="px-4 py-6 text-center text-xs text-gray-400">
            Cargando…
          </div>
        )}
        {!loading && items.length === 0 && (
          <div className="px-4 py-6 text-center text-xs text-gray-400">
            Sin notificaciones
          </div>
        )}
        {items.map((n) => {
          const meta = NOTIFICATION_META[n.severity] ?? NOTIFICATION_META.info;
          return (
            <button
              key={n.id}
              onClick={() => markOne(n)}
              className={`w-full text-left flex gap-3 px-4 py-3 hover:bg-gray-50 transition-colors ${
                n.readAt ? "opacity-60" : ""
              }`}
            >
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${meta.color}`}
              >
                <meta.Icon size={14} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800">{n.title}</p>
                {n.body && (
                  <p className="text-xs text-gray-500 mt-0.5 whitespace-pre-line">
                    {n.body}
                  </p>
                )}
                <p className="text-[11px] text-gray-400 mt-1">
                  {relativeTime(n.createdAt)}
                </p>
              </div>
              {!n.readAt && (
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
              )}
            </button>
          );
        })}
      </div>
      <div className="px-4 py-2.5 border-t border-gray-100 text-center text-[11px] text-gray-400">
        La ingesta de catálogos corre a diario a las 3:00 a. m.
      </div>
    </div>
  );
}

function Sidebar({
  current,
  onNavigate,
  collapsed,
  onToggleCollapse,
  storeLogo,
  companyName,
}: {
  current: ViewId;
  onNavigate: (v: ViewId) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  storeLogo?: string | null;
  companyName: string;
}) {
  return (
    <aside
      className="relative flex flex-col h-full border-r transition-all duration-300"
      style={{
        background: "var(--app-sidebar)",
        borderColor: "var(--app-sidebar-border)",
        width: collapsed ? 56 : 240,
      }}
    >
      {/* Logo + título / empresa */}
      <div
        className="flex flex-col gap-3 px-4 py-5 border-b shrink-0"
        style={{ borderColor: "var(--app-sidebar-border)" }}
      >
        {/* logo.png junto al título "CRM" */}
        <div className={`flex items-center gap-2.5 ${collapsed ? "justify-center" : ""}`}>
          <a
            href="https://dsi.com.co"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center shrink-0 hover:opacity-80 transition-opacity"
          >
            <img
              src={sidebarLogo}
              alt="Mercaldas"
              className={`shrink-0 object-contain ${collapsed ? "w-7 h-7" : "h-7 w-auto"}`}
            />
          </a>
          {!collapsed && (
            <p
              className="text-base font-extrabold uppercase tracking-wide"
              style={{ color: "var(--app-sidebar-accent)" }}
            >
              CRM
            </p>
          )}
        </div>
        {/* Logo de la tienda (configurado en el admin) + "Empresa - Nombre" */}
        <div className={`flex items-center gap-2 min-w-0 ${collapsed ? "justify-center" : ""}`}>
          {storeLogo && !collapsed && (
            <img
              src={storeLogo}
              alt="Empresa"
              className={`shrink-0 object-contain ${collapsed ? "w-7 h-7" : "h-7 w-auto"}`}
            />
          )}
          {!collapsed && (
            <p
              className="text-xs font-semibold truncate"
              style={{ color: "var(--app-sidebar-fg-muted)" }}
            >
              {companyName}
            </p>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {NAV.map((section) => (
          <div key={section.title} className="mb-4">
            {!collapsed && (
              <p
                className="text-[10px] font-semibold uppercase tracking-widest px-2 mb-1"
                style={{ color: "var(--app-sidebar-fg-subtle)" }}
              >
                {section.title}
              </p>
            )}
            {section.items.map((item) => {
              const active = current === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  title={collapsed ? item.label : undefined}
                  className={`w-full flex items-center gap-3 px-2 py-2 rounded-lg text-sm font-medium mb-0.5 group relative ${
                    active ? "sidebar-item-active" : "sidebar-item"
                  }`}
                >
                  <item.icon size={15} className="shrink-0" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Colapsar/expandir: pegado al borde derecho del sidebar (se mueve con él) */}
      <button
        onClick={onToggleCollapse}
        title={collapsed ? "Expandir menú" : "Ocultar menú"}
        className="sidebar-item absolute top-1/2 -translate-y-1/2 -right-3 z-20 w-6 h-6 flex items-center justify-center rounded-full border shadow-md cursor-pointer"
        style={{
          background: "var(--app-sidebar)",
          borderColor: "var(--app-sidebar-border)",
        }}
      >
        {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>
    </aside>
  );
}

function TopBar({
  current,
  onOpenCommand,
  user,
  onLogout,
}: {
  current: ViewId;
  onOpenCommand: () => void;
  user: UserProfile | null;
  onLogout: () => void;
}) {
  const [notifOpen, setNotifOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const { theme, setTheme, mode, setMode } = useTheme();

  const refreshUnread = useCallback(() => {
    marketService
      .notifications(true, 50)
      .then((items) => setUnread(items.length))
      .catch(() => setUnread(0));
  }, []);

  useEffect(() => {
    refreshUnread();
    const timer = setInterval(refreshUnread, 60_000);
    return () => clearInterval(timer);
  }, [refreshUnread]);

  useEffect(() => {
    const handler = () => {
      setNotifOpen(false);
      setUserOpen(false);
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  const initials = user
    ? [user.firstName, user.lastName]
        .filter(Boolean)
        .map((n) => n?.[0] ?? "")
        .join("")
        .toUpperCase() || user.username?.[0]?.toUpperCase() || "U"
    : "JR";
  const displayName = user?.fullName || "Jorge Ramírez";
  const displayEmail = user?.email || "jorge@mercaldas.com";

  return (
    <header className="h-14 bg-surface border-b border-gray-100 flex items-center gap-3 px-4 shrink-0 z-30">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm">
        <span className="text-gray-400">Mercaldas</span>
        <ChevronRight size={14} className="text-gray-300" />
        <span className="text-gray-800 font-semibold">{LABELS[current]}</span>
      </div>

      <div className="ml-auto flex items-center gap-2">
        {/* Search trigger */}
        <button
          onClick={onOpenCommand}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-400 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors"
        >
          <Search size={14} />
          <span className="hidden sm:inline">Buscar...</span>
          <kbd className="hidden sm:inline text-xs bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded font-mono">
            ⌘K
          </kbd>
        </button>

        {/* Notifications */}
        <div className="relative" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => {
              setNotifOpen(!notifOpen);
              setUserOpen(false);
            }}
            className="relative w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
          >
            <Bell size={16} />
            {unread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 flex items-center justify-center rounded-full bg-amber-400 text-[10px] font-bold text-white">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </button>
          {notifOpen && <Notifications onRead={refreshUnread} />}
        </div>

        {/* User */}
        <div className="relative" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => {
              setUserOpen(!userOpen);
              setNotifOpen(false);
            }}
            className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center">
              <span className="text-xs font-bold text-white">{initials}</span>
            </div>
            <ChevronDown size={13} className="text-gray-400" />
          </button>
          {userOpen && (
            <div className="absolute right-0 top-full mt-2 w-52 bg-surface rounded-xl shadow-xl border border-gray-200 py-1.5 z-40">
              <div className="px-4 py-2 border-b border-gray-100 mb-1">
                <p className="text-sm font-semibold text-gray-800">{displayName}</p>
                <p className="text-xs text-gray-500">{displayEmail}</p>
              </div>

              {/* Panel de modo claro/oscuro */}
              <div className="px-4 py-2 border-b border-gray-100">
                <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-2">
                  <Sun size={11} /> Modo
                </p>
                <div className="flex items-center gap-1 rounded-lg bg-gray-100 p-0.5">
                  {MODES.map((m) => {
                    const active = mode === m.id;
                    const Icon = m.id === "light" ? Sun : Moon;
                    return (
                      <button
                        key={m.id}
                        onClick={() => setMode(m.id)}
                        aria-label={`Modo ${m.label}`}
                        aria-pressed={active}
                        className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1 rounded-md text-xs font-semibold transition-colors ${
                          active
                            ? "bg-amber-400 text-amber-900 shadow-sm"
                            : "text-gray-500 hover:text-gray-700"
                        }`}
                      >
                        <Icon size={13} /> {m.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Panel de temas */}
              <div className="px-4 py-2 border-b border-gray-100">
                <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-2">
                  <Palette size={11} /> Tema
                </p>
                <div className="flex items-center gap-2">
                  {THEMES.map((t) => {
                    const active = theme === t.id;
                    return (
                      <button
                        key={t.id}
                        onClick={() => setTheme(t.id)}
                        title={t.label}
                        aria-label={`Tema ${t.label}`}
                        aria-pressed={active}
                        className={`w-6 h-6 rounded-full flex items-center justify-center transition-transform hover:scale-110 ${
                          active
                            ? "ring-2 ring-offset-2 ring-offset-surface ring-gray-800"
                            : "ring-1 ring-black/10"
                        }`}
                        style={{ background: t.swatch }}
                      >
                        {active && <Check size={12} className="text-white" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {[
                { icon: User, label: "Mi perfil" },
                { icon: HelpCircle, label: "Ayuda y soporte" },
                { icon: Command, label: "Atajos de teclado" },
              ].map((item) => (
                <button
                  key={item.label}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <item.icon size={14} className="text-gray-400" />
                  {item.label}
                </button>
              ))}
              <div className="border-t border-gray-100 mt-1 pt-1">
                <button
                  onClick={() => {
                    setUserOpen(false);
                    onLogout();
                  }}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  <LogOut size={14} />
                  Cerrar sesión
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function ViewRenderer({
  view,
  user,
  onNavigate,
}: {
  view: ViewId;
  user: UserProfile | null;
  onNavigate: (v: string) => void;
}) {
  const userName = user?.firstName || user?.fullName?.split(" ")[0] || "Usuario";

  switch (view) {
    case "dashboard":
      return <Dashboard userName={userName} onNavigate={onNavigate} />;
    case "campaigns":
      return <Campaigns />;
    case "mercado":
      return <Mercado />;
    default:
      return <Dashboard userName={userName} onNavigate={onNavigate} />;
  }
}

export default function App() {
  const [view, navigate] = useViewFromUrl();
  const [cmdOpen, setCmdOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [storeLogo, setStoreLogo] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string>("Mercaldas");

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCmdOpen((o) => !o);
      }
      if (e.key === "Escape") setCmdOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Perfil autenticado (cookie httpOnly). Sin sesión se muestra el login.
  useEffect(() => {
    authService
      .getProfile()
      .then((profile) => setUser(profile))
      .catch(() => setUser(null))
      .finally(() => setAuthChecked(true));
  }, []);

  const handleLogout = useCallback(async () => {
    await authService.logout();
    setUser(null);
  }, []);

  // Logo de la tienda configurado en el admin (público: /landing/general).
  useEffect(() => {
    const base = import.meta.env.VITE_API_URL || "http://localhost:3100";
    fetch(`${base}/landing/general`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { url?: string } | null) => setStoreLogo(d?.url?.trim() || null))
      .catch(() => setStoreLogo(null));
  }, []);

  // Nombre de la empresa/tienda configurado en el admin (público: /admin/settings/public-info).
  useEffect(() => {
    const base = import.meta.env.VITE_API_URL || "http://localhost:3100";
    fetch(`${base}/admin/settings/public-info`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { tradeName?: string } | null) => setCompanyName(d?.tradeName?.trim() || "Mercaldas"))
      .catch(() => {});
  }, []);

  // El dashboard puede pedir navegar a secciones que no existen aquí
  // (pedidos, promociones...); solo navegamos a las vistas disponibles.
  const handleDashboardNavigate = useCallback(
    (v: string) => {
      if (v === "dashboard" || v === "campaigns") navigate(v);
    },
    [navigate],
  );

  if (!authChecked) {
    return (
      <div
        className="flex h-screen items-center justify-center"
        style={{ background: "var(--app-bg)" }}
      >
        <Loader2 size={24} className="animate-spin text-gray-400" />
      </div>
    );
  }

  if (!user) {
    return <Login onSuccess={setUser} />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-(--app-bg)">
      <Sidebar
        current={view}
        onNavigate={navigate}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((c) => !c)}
        storeLogo={storeLogo}
        companyName={companyName}
      />

      <div className="flex flex-col flex-1 min-w-0">
        <TopBar
          current={view}
          onOpenCommand={() => setCmdOpen(true)}
          user={user}
          onLogout={handleLogout}
        />
        <main className="flex-1 overflow-y-auto">
          <ViewRenderer view={view} user={user} onNavigate={handleDashboardNavigate} />
        </main>
        <footer className="shrink-0" style={{ background: "var(--app-footer)" }}>
          <div className="flex flex-col md:flex-row items-center justify-center gap-x-4 gap-y-1 px-3 py-2 text-center">
            <a
              href="https://dsi.com.co"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center hover:opacity-80 transition-opacity"
            >
              <img src={footerLogo} alt="Mercaldas" className="h-[25.6px] w-auto object-contain" />
            </a>
            <p className="text-xs" style={{ color: "var(--app-footer-fg)" }}>
              © 2026 Desarrollado por <span className="font-bold" style={{ color: "var(--app-footer-fg-strong)" }}>DSI SA</span> · Todos los derechos reservados
            </p>
            <p className="text-xs" style={{ color: "var(--app-footer-fg)" }}>
              Manizales, Caldas, Colombia
            </p>
          </div>
        </footer>
      </div>

      {cmdOpen && (
        <CommandPalette onNavigate={navigate} onClose={() => setCmdOpen(false)} />
      )}
    </div>
  );
}
