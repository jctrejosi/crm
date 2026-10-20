import { useState, type FormEvent } from "react";
import { Loader2, Lock, User as UserIcon } from "lucide-react";
import { authService, type UserProfile } from "../services/auth.service";
import logo from "../assets/logo.png";

type Props = {
  onSuccess: (profile: UserProfile) => void;
};

export default function Login({ onSuccess }: Props) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!identifier.trim() || !password) {
      setError("Escribe tu usuario (o correo) y tu contraseña.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await authService.login(identifier.trim(), password);
      const profile = await authService.getProfile();
      onSuccess(profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar sesión.");
      setPassword("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: "var(--app-bg)" }}
    >
      <div className="w-full max-w-sm bg-surface rounded-2xl shadow-xl border border-gray-200 p-8">
        <div className="flex flex-col items-center gap-3 mb-6">
          <img src={logo} alt="Mercaldas" className="h-12 w-auto object-contain" />
          <div className="text-center">
            <h1 className="text-lg font-semibold text-gray-800">CRM Mercaldas</h1>
            <p className="text-sm text-gray-500">Inicia sesión para continuar</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="block text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1.5">
              Usuario o correo
            </span>
            <div className="relative">
              <UserIcon
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                autoComplete="username"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="admin@dsi.com.co"
                disabled={loading}
                autoFocus
                className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm text-gray-800 outline-none transition-colors focus:border-amber-400 focus:ring-2 focus:ring-amber-200 disabled:opacity-60"
              />
            </div>
          </label>

          <label className="block">
            <span className="block text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1.5">
              Contraseña
            </span>
            <div className="relative">
              <Lock
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={loading}
                className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm text-gray-800 outline-none transition-colors focus:border-amber-400 focus:ring-2 focus:ring-amber-200 disabled:opacity-60"
              />
            </div>
          </label>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-amber-400 px-4 py-2.5 text-sm font-semibold text-amber-900 shadow-sm transition-colors hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            {loading ? "Ingresando…" : "Ingresar"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-gray-400">
          © 2026 DSI SA · Manizales, Caldas
        </p>
      </div>
    </div>
  );
}
