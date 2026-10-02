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
  ShoppingCart,
  Zap,
  Users,
  Palette,
  Check,
} from "lucide-react";
import Dashboard from "./views/Dashboard";
import Campaigns from "./views/Campaigns";
import { authService, type UserProfile } from "./services/auth.service";
import { THEMES, useTheme } from "./theme";

export type ViewId = "dashboard" | "campaigns";

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
    items: [{ id: "campaigns", label: "Campañas", icon: Send }],
  },
];

const VIEW_PATHS: Record<string, ViewId> = {
  "": "dashboard",
  dashboard: "dashboard",
  campaigns: "campaigns",
};

const VIEW_SLUGS: Record<ViewId, string> = {
  dashboard: "dashboard",
  campaigns: "campaigns",
};

const LABELS: Record<ViewId, string> = {
  dashboard: "Dashboard",
  campaigns: "Campañas",
};

const QUICK_COMMANDS = [
  { icon: LayoutDashboard, label: "Ir al Dashboard", view: "dashboard" as ViewId },
  { icon: Send, label: "Ver campañas", view: "campaigns" as ViewId },
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
        className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden"
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

function Notifications({ onClose }: { onClose: () => void }) {
  const items = [
    {
      icon: AlertTriangle,
      color: "text-amber-500 bg-amber-50",
      title: "Stock bajo detectado",
      sub: "Leche Alquería — quedan 12 unidades",
      time: "hace 5m",
    },
    {
      icon: ShoppingCart,
      color: "text-blue-500 bg-blue-50",
      title: "Nuevo pedido #MC-3821",
      sub: "Total: $124.900 — Pago confirmado",
      time: "hace 12m",
    },
    {
      icon: Zap,
      color: "text-green-500 bg-green-50",
      title: "Campaña activada",
      sub: "Flash Sale Viernes — 47 productos",
      time: "hace 1h",
    },
    {
      icon: Users,
      color: "text-purple-500 bg-purple-50",
      title: "100 nuevos clientes hoy",
      sub: "+18% comparado con ayer",
      time: "hace 2h",
    },
  ];

  return (
    <div
      className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-xl border border-gray-200 z-40"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <span className="font-semibold text-sm text-gray-900">Notificaciones</span>
        <button
          onClick={onClose}
          className="text-xs text-amber-600 hover:text-amber-700 font-medium"
        >
          Marcar todo como leído
        </button>
      </div>
      <div className="divide-y divide-gray-50">
        {items.map((n) => (
          <div
            key={n.title}
            className="flex gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors"
          >
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${n.color}`}
            >
              <n.icon size={14} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">{n.title}</p>
              <p className="text-xs text-gray-500 truncate mt-0.5">{n.sub}</p>
            </div>
            <span className="text-xs text-gray-400 shrink-0">{n.time}</span>
          </div>
        ))}
      </div>
      <div className="px-4 py-2.5 border-t border-gray-100">
        <button className="text-xs text-gray-500 hover:text-gray-700 w-full text-center">
          Ver todas las notificaciones
        </button>
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
      className="relative flex flex-col h-full border-r border-white/[0.06] transition-all duration-300"
      style={{ background: "var(--app-sidebar)", width: collapsed ? 56 : 240 }}
    >
      {/* Logo + título / empresa */}
      <div className="flex flex-col gap-3 px-4 py-5 border-b border-white/[0.06] shrink-0">
        {/* logo.png junto al título "Web Analytics" */}
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
            <p className="text-base font-extrabold uppercase tracking-wide text-amber-400">
              Analytics
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
            <p className="text-xs font-semibold text-white/70 truncate">{companyName}</p>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {NAV.map((section) => (
          <div key={section.title} className="mb-4">
            {!collapsed && (
              <p className="text-white/30 text-[10px] font-semibold uppercase tracking-widest px-2 mb-1">
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
                  className={`w-full flex items-center gap-3 px-2 py-2 rounded-lg text-sm font-medium transition-all mb-0.5 group relative ${
                    active
                      ? "bg-white/10 text-amber-400"
                      : "text-white/50 hover:bg-white/[0.06] hover:text-white/80"
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
        className="absolute top-1/2 -translate-y-1/2 -right-3 z-20 w-6 h-6 flex items-center justify-center rounded-full border border-white/15 bg-(--app-sidebar) text-white/70 hover:text-white shadow-md transition-colors cursor-pointer"
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
}: {
  current: ViewId;
  onOpenCommand: () => void;
  user: UserProfile | null;
}) {
  const [notifOpen, setNotifOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const { theme, setTheme } = useTheme();

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
    <header className="h-14 bg-white border-b border-gray-100 flex items-center gap-3 px-4 shrink-0 z-30">
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
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-amber-400 rounded-full" />
          </button>
          {notifOpen && <Notifications onClose={() => setNotifOpen(false)} />}
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
            <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-xl shadow-xl border border-gray-200 py-1.5 z-40">
              <div className="px-4 py-2 border-b border-gray-100 mb-1">
                <p className="text-sm font-semibold text-gray-800">{displayName}</p>
                <p className="text-xs text-gray-500">{displayEmail}</p>
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
                            ? "ring-2 ring-offset-2 ring-gray-800"
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
                <button className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors">
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
    default:
      return <Dashboard userName={userName} onNavigate={onNavigate} />;
  }
}

export default function App() {
  const [view, navigate] = useViewFromUrl();
  const [cmdOpen, setCmdOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);
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

  // Perfil autenticado (cookie). Si falla, se usa el nombre por defecto.
  useEffect(() => {
    authService
      .getProfile()
      .then((profile) => setUser(profile))
      .catch(() => {});
  }, []);

  // Logo de la tienda configurado en el admin (público: /landing/general).
  useEffect(() => {
    const base = import.meta.env.VITE_API_URL || "http://localhost:3000";
    fetch(`${base}/landing/general`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { url?: string } | null) => setStoreLogo(d?.url?.trim() || null))
      .catch(() => setStoreLogo(null));
  }, []);

  // Nombre de la empresa/tienda configurado en el admin (público: /admin/settings/public-info).
  useEffect(() => {
    const base = import.meta.env.VITE_API_URL || "http://localhost:3000";
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
            <p className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
              © 2026 Desarrollado por <span className="font-bold text-white/70">DSI SA</span> · Todos los derechos reservados
            </p>
            <p className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
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
