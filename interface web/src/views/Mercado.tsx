import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Download, ExternalLink,
  Filter, Info, Loader2, RefreshCw, Search, Store, Target,
  TrendingDown, TrendingUp, X,
} from 'lucide-react';
import {
  Bar, BarChart, Cell, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import mercadoData from '../data/mercado/mercado.json';
import { buildDoc, buildSearcher } from '../lib/search';
import {
  marketService,
  type MarketStatus,
} from '../services/market.service';

// ─── tipos del dataset (generado por Vassago/scripts-agent/build_mercado_data.py) ──

type StoreId = 'exito' | 'olimpica' | 'carulla' | 'd1';
type Mode = 'exact' | 'all';
type Scope = 'all' | 'food' | 'nonfood';

interface Match {
  price: number;
  name: string;
  score?: number | null;
}

interface Product {
  id: string;
  name: string;
  brand: string;
  category: string;
  category_l2: string;
  category_l3: string;
  nonfood: boolean;
  price: number;
  size: [string, number] | null;
  exact: Partial<Record<StoreId, Match>>;
  equivalent: Partial<Record<StoreId, Match>>;
}

interface StoreStats {
  id: StoreId;
  name: string;
  data_date?: string | null;
  matched: number;
  cheaper: number;
  equal: number;
  pricier: number;
  median_gap: number | null;
  price_index: number | null;
  wins: number;
}

interface CategoryStats {
  id: string;
  root: string;
  name: string;
  total: number;
  compared: number;
  coverage_pct: number;
  median_gap: number | null;
  median_gap_avg: number | null;
  cheapest_share: number;
  overprice_cop: number;
  stores: Partial<Record<StoreId, number | null>>;
}

interface Kpis {
  universe: number;
  compared: number;
  compared_pct: number;
  compared_exact: number;
  compared_equivalent_only: number;
  cheapest: number;
  cheapest_pct: number;
  most_expensive: number;
  most_expensive_pct: number;
  equal: number;
  median_gap: number | null;
  p25_gap: number | null;
  p75_gap: number | null;
  median_gap_other_cheaper: number | null;
  at_risk: number;
  at_risk_pct: number;
  risk_threshold: number;
  potential_overprice: number;
}

interface ModeStats {
  kpis: Kpis;
  stores: StoreStats[];
  categories: CategoryStats[];
  gap_distribution: { bucket: string; count: number }[];
  review: {
    id: string;
    name: string;
    brand: string;
    category: string;
    price: number;
    best_store: StoreId;
    best_price: number;
    gap: number;
    overprice: number;
  }[];
}

interface MercadoData {
  meta: {
    generated_at: string;
    source_generated_at: string | null;
    source_dates?: Record<string, string | null>;
    source_dates_nonfood?: Record<string, string | null>;
    mercaldas_captured_at?: string | null;
    scope: string;
    threshold: number;
    mercaldas_products: number;
    universe_by_scope?: Record<Scope, number>;
    compared: number;
    compared_pct: number;
    compared_exact: number;
    compared_equivalent_only: number;
    pack_mismatch_dropped: number;
    stores: { id: StoreId; name: string; data_date?: string | null }[];
    coverage_by_root: Record<
      string,
      { total: number; compared: number; compared_pct: number; food?: boolean }
    >;
  };
  modes: Record<Mode, Record<Scope, ModeStats>>;
  products: Product[];
}

const DATA = mercadoData as unknown as MercadoData;

const SCOPES: { id: Scope; label: string }[] = [
  { id: 'all', label: 'Todo' },
  { id: 'food', label: 'Alimentos' },
  { id: 'nonfood', label: 'No alimentos' },
];

const SCOPE_PHRASE: Record<Scope, string> = {
  all: '',
  food: ' de alimentos',
  nonfood: ' de no alimentos',
};

// Frescura: cada catálogo se crawlea en una fecha distinta; el chip muestra el
// rango y el tooltip el detalle por almacén. Los no-alimentos se capturan al
// consultar cada EAN, así que llevan su propia fecha y por eso el rango cambia
// según el alcance seleccionado.
interface DateRange {
  oldest: string | null;
  newest: string | null;
  tooltip: string;
}

function dateRange(scope: Scope): DateRange {
  const entries: [string, string][] = [];
  const add = (source: Record<string, string | null> | undefined, suffix: string) => {
    for (const [key, iso] of Object.entries(source ?? {})) {
      if (iso) entries.push([key === 'mercaldas' ? 'Mercaldas' : key + suffix, iso]);
    }
  };
  if (scope !== 'nonfood') add(DATA.meta.source_dates, '');
  if (scope !== 'food') add(DATA.meta.source_dates_nonfood, ' (no alimentos)');

  const ms = entries.map(([, iso]) => new Date(iso).getTime()).filter((n) => !Number.isNaN(n));
  return {
    oldest: ms.length ? new Date(Math.min(...ms)).toISOString() : null,
    newest: ms.length ? new Date(Math.max(...ms)).toISOString() : null,
    tooltip: [
      ...entries.map(([key, iso]) => `${key}: ${fmtFullDay(iso)}`),
      `Radar generado: ${fmtFullDay(DATA.meta.source_generated_at || DATA.meta.generated_at)}`,
    ].join('\n'),
  };
}

const SCOPE_DATES: Record<Scope, DateRange> = {
  all: dateRange('all'),
  food: dateRange('food'),
  nonfood: dateRange('nonfood'),
};

const HAS_NONFOOD = (DATA.meta.universe_by_scope?.nonfood ?? 0) > 0;

// Índice de búsqueda alineado con `DATA.products`: se arma una sola vez.
const SEARCH_INDEX = DATA.products.map((product) =>
  buildDoc(product.name, product.brand, product.id),
);

// ─── helpers ────────────────────────────────────────────────────────────────

const STORE_COLORS: Record<StoreId, string> = {
  exito: '#F59E0B',
  olimpica: '#10B981',
  carulla: '#3B82F6',
  d1: '#8B5CF6',
};

const STORE_NAMES: Record<StoreId, string> = {
  exito: 'Éxito',
  olimpica: 'Olímpica',
  carulla: 'Carulla',
  d1: 'D1',
};

const STORE_ORDER: StoreId[] = ['exito', 'olimpica', 'carulla', 'd1'];

function fmt(n: number | null | undefined) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return '$' + Math.round(n).toLocaleString('es-CO');
}

function fmtNum(n: number | null | undefined) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return Math.round(n).toLocaleString('es-CO');
}

function signed(n: number | null | undefined, digits = 1) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const value = n.toFixed(digits).replace('.', ',');
  return (n > 0 ? '+' : '') + value + ' %';
}

function fmtDay(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
}

function fmtFullDay(iso: string | null | undefined) {
  if (!iso) return 'sin fecha';
  return new Date(iso).toLocaleDateString('es-CO', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function gapTextColor(gap: number | null | undefined) {
  if (gap === null || gap === undefined) return 'text-gray-400';
  if (gap < -5) return 'text-green-600';
  if (gap < -0.5) return 'text-green-500';
  if (gap <= 0.5) return 'text-gray-500';
  if (gap <= 10) return 'text-amber-600';
  if (gap <= 20) return 'text-orange-600';
  return 'text-red-600';
}

function heatBackground(gap: number | null | undefined) {
  if (gap === null || gap === undefined) return 'transparent';
  const magnitude = Math.min(Math.abs(gap), 30) / 30;
  const alpha = 0.08 + magnitude * 0.42;
  return gap < 0 ? `rgba(16,185,129,${alpha})` : `rgba(239,68,68,${alpha})`;
}

/** Precio comparable del producto en una tienda según el nivel de cruce. */
function storeMatch(product: Product, store: StoreId, mode: Mode) {
  const exact = product.exact[store];
  const equivalent = product.equivalent[store];
  if (mode === 'exact') {
    return exact ? { ...exact, type: 'exacto' as const } : null;
  }
  if (equivalent && (!exact || equivalent.price < exact.price)) {
    return { ...equivalent, type: 'equivalente' as const };
  }
  return exact ? { ...exact, type: 'exacto' as const } : null;
}

function bestFor(product: Product, mode: Mode) {
  let best: { store: StoreId; price: number; name: string; type: 'exacto' | 'equivalente' } | null = null;
  for (const store of STORE_ORDER) {
    const match = storeMatch(product, store, mode);
    if (match && (!best || match.price < best.price)) {
      best = { store, price: match.price, name: match.name, type: match.type };
    }
  }
  return best;
}

/** id de categoría de Mercaldas (nivel 2) usado como filtro. */
function categoryId(product: Product) {
  return `${product.category} > ${product.category_l2}`;
}

function gapFor(product: Product, mode: Mode) {
  const best = bestFor(product, mode);
  if (!best || best.price <= 0) return null;
  return ((product.price - best.price) / best.price) * 100;
}

function downloadCsv(rows: Product[], mode: Mode) {
  const header = [
    'Producto', 'Marca', 'Categoría', 'Mercaldas',
    ...STORE_ORDER.map((s) => STORE_NAMES[s]),
    'Mejor almacén', 'Mejor precio', 'Diferencia %', 'Sobreprecio COP', 'Tipo de cruce',
  ];
  const lines = rows.map((product) => {
    const best = bestFor(product, mode);
    const gap = gapFor(product, mode);
    return [
      product.name,
      product.brand,
      `${product.category} > ${product.category_l2}`,
      Math.round(product.price),
      ...STORE_ORDER.map((store) => {
        const match = storeMatch(product, store, mode);
        return match ? `${Math.round(match.price)}${match.type === 'equivalente' ? ' (eq.)' : ''}` : '';
      }),
      best ? STORE_NAMES[best.store] : '',
      best ? Math.round(best.price) : '',
      gap === null ? '' : gap.toFixed(1),
      best ? Math.round(product.price - best.price) : '',
      best ? best.type : '',
    ];
  });
  const csv = [header, ...lines]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
    .join('\n');

  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `radar-precios-${mode === 'exact' ? 'mismo-producto' : 'equivalentes'}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

// ─── sub-componentes ────────────────────────────────────────────────────────

function KpiCard({
  icon: Icon, label, value, sub, hint, tone = 'neutral',
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  hint?: string;
  tone?: 'neutral' | 'good' | 'bad' | 'warn';
}) {
  const toneClasses = {
    neutral: 'bg-amber-50 text-amber-600',
    good: 'bg-green-50 text-green-600',
    bad: 'bg-red-50 text-red-600',
    warn: 'bg-orange-50 text-orange-600',
  }[tone];

  return (
    <div className="bg-surface rounded-2xl border border-gray-100 p-5" title={hint}>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${toneClasses}`}>
        <Icon size={18} />
      </div>
      <p className="text-2xl font-bold text-gray-900 leading-tight">{value}</p>
      <p className="text-sm text-gray-600 mt-1">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function PositionBar({
  cheaper, equal, pricier,
}: {
  cheaper: number;
  equal: number;
  pricier: number;
}) {
  const total = cheaper + equal + pricier || 1;
  return (
    <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
      <div className="bg-green-500" style={{ width: `${(cheaper / total) * 100}%` }} title={`Mercaldas más barato: ${fmtNum(cheaper)}`} />
      <div className="bg-gray-300" style={{ width: `${(equal / total) * 100}%` }} title={`Igual: ${fmtNum(equal)}`} />
      <div className="bg-red-400" style={{ width: `${(pricier / total) * 100}%` }} title={`Mercaldas más caro: ${fmtNum(pricier)}`} />
    </div>
  );
}

function PositionBadge({ gap }: { gap: number | null | undefined }) {
  if (gap === null || gap === undefined) {
    return (
      <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-1 text-[11px] font-semibold text-gray-500">
        sin datos de precio
      </span>
    );
  }
  const abs = Math.abs(gap).toFixed(1).replace('.', ',');
  if (gap > 0.05) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-700">
        <TrendingUp size={12} /> Mercaldas {abs} % por encima
      </span>
    );
  }
  if (gap < -0.05) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-green-50 px-2 py-1 text-[11px] font-semibold text-green-700">
        <TrendingDown size={12} /> Mercaldas {abs} % por debajo
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-1 text-[11px] font-semibold text-gray-600">
      Precios empatados
    </span>
  );
}

function StoreCard({ store, total }: { store: StoreStats; total: number }) {
  // en los datos, `pricier` = la tienda es más cara que Mercaldas
  const mercaldasCheaper = store.pricier;
  const mercaldasPricier = store.cheaper;
  const coverage = total ? (store.matched / total) * 100 : 0;

  return (
    <div className="bg-surface rounded-2xl border border-gray-100 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: STORE_COLORS[store.id] }} />
          <div>
            <p className="font-semibold text-gray-900">{store.name}</p>
            <p className="text-[10px] text-gray-400">precios al {fmtDay(store.data_date)}</p>
          </div>
        </div>
      </div>
      <PositionBar cheaper={mercaldasCheaper} equal={store.equal} pricier={mercaldasPricier} />
      <div className="flex items-center justify-between mt-2 text-[11px] text-gray-500">
        <span>
          <strong className="text-gray-700">{fmtNum(store.matched)}</strong> de {fmtNum(total)} ·{' '}
          <strong className="text-gray-700">{coverage.toFixed(1).replace('.', ',')} %</strong>
        </span>
        <span title="Mediana de precio tienda / precio Mercaldas. < 1: la tienda es más barata">
          índice {store.price_index === null ? '—' : store.price_index.toFixed(2).replace('.', ',')}
        </span>
      </div>
      <div className="mt-2">
        <PositionBadge gap={store.median_gap} />
      </div>
      <div className="grid grid-cols-3 gap-1 mt-3 text-center">
        <div className="rounded-lg bg-green-50 py-1.5">
          <p className="text-xs font-bold text-green-700">{fmtNum(mercaldasCheaper)}</p>
          <p className="text-[10px] text-green-600/80">ganamos</p>
        </div>
        <div className="rounded-lg bg-gray-50 py-1.5">
          <p className="text-xs font-bold text-gray-600">{fmtNum(store.equal)}</p>
          <p className="text-[10px] text-gray-500">igual</p>
        </div>
        <div className="rounded-lg bg-red-50 py-1.5">
          <p className="text-xs font-bold text-red-700">{fmtNum(mercaldasPricier)}</p>
          <p className="text-[10px] text-red-600/80">perdemos</p>
        </div>
      </div>
    </div>
  );
}

function GapDistribution({ buckets }: { buckets: { bucket: string; count: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={buckets} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
        <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} width={38} />
        <Tooltip
          cursor={{ fill: '#F9FAFB' }}
          content={({ active, payload, label }: any) => {
            if (!active || !payload?.length) return null;
            return (
              <div className="bg-surface border border-gray-200 rounded-xl shadow-lg px-3 py-2">
                <p className="text-xs text-gray-500 mb-0.5">Brecha {label} %</p>
                <p className="text-sm font-bold text-gray-900">{fmtNum(payload[0].value)} productos</p>
              </div>
            );
          }}
        />
        <Bar dataKey="count" radius={[6, 6, 0, 0]}>
          {buckets.map((bucket, index) => {
            const color = index < 4 ? '#10B981' : index === 4 ? '#6B7280' : index === 5 ? '#F59E0B' : index === 6 ? '#F97316' : '#EF4444';
            return <Cell key={bucket.bucket} fill={color} />;
          })}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── estado de la ingesta (backend → DB) ───────────────────────────────────

function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  const minutes = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `hace ${hours} h`;
  return `hace ${Math.round(hours / 24)} d`;
}

/**
 * Aviso de la ingesta diaria de catálogos. Se muestra solo cuando hay algo que
 * contar: una corrida en curso, un fallo/cobertura baja o catálogos sin cargar.
 */
function MarketIngestBanner() {
  const [status, setStatus] = useState<MarketStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setStatus(await marketService.status());
      setError(null);
    } catch {
      setError('No se pudo consultar el estado de la ingesta de catálogos.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const running = status?.stores.some((store) => store.isRunning);
    const timer = setInterval(() => void load(), running ? 12_000 : 120_000);
    return () => clearInterval(timer);
  }, [status, load]);

  const retry = async (storeIds: string[]) => {
    setBusy(true);
    try {
      for (const storeId of storeIds) {
        await marketService.trigger(storeId);
      }
      await load();
    } catch {
      setError('No se pudo iniciar la ingesta. ¿Está corriendo el backend?');
    } finally {
      setBusy(false);
    }
  };

  if (!status) return null;

  const running = status.stores.filter((store) => store.isRunning);
  const pending = status.stores.filter((store) => !store.lastRun && !store.isRunning);
  const alerts = status.alerts;
  const hasError = alerts.some((alert) => alert.health === 'error');

  if (!running.length && !alerts.length && !pending.length) return null;

  return (
    <div className="space-y-2">
      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
          <Info size={16} className="mt-0.5 shrink-0 text-gray-500" />
          <p className="text-sm text-gray-600">{error}</p>
        </div>
      )}

      {running.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
          <Loader2 size={16} className="mt-0.5 shrink-0 animate-spin text-blue-600" />
          <div className="text-sm text-blue-900">
            <p className="font-semibold">Actualizando catálogos de la competencia</p>
            <p className="mt-0.5 text-blue-800">
              {running
                .map((store) => {
                  const run = store.lastRun;
                  const progress =
                    run?.progressPct != null
                      ? `${run.progressPct.toFixed(0)} %`
                      : 'preparando…';
                  return `${store.name}: ${progress}`;
                })
                .join(' · ')}
            </p>
          </div>
        </div>
      )}

      {alerts.length > 0 && (
        <div
          className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${
            hasError
              ? 'border-red-200 bg-red-50'
              : 'border-amber-200 bg-amber-50'
          }`}
        >
          <AlertTriangle
            size={16}
            className={`mt-0.5 shrink-0 ${hasError ? 'text-red-600' : 'text-amber-600'}`}
          />
          <div className="flex-1 text-sm">
            <p className={`font-semibold ${hasError ? 'text-red-900' : 'text-amber-900'}`}>
              {hasError
                ? 'Algunas ingestas de catálogo fallaron'
                : 'Ingestas incompletas o desactualizadas'}
            </p>
            <ul className="mt-1 space-y-0.5">
              {alerts.map((alert) => (
                <li
                  key={alert.storeId}
                  className={hasError ? 'text-red-800' : 'text-amber-800'}
                >
                  <strong>{alert.storeName}</strong>: {alert.message ?? alert.title}
                  {alert.startedAt && (
                    <span className="opacity-70"> ({relativeTime(alert.startedAt)})</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
          <button
            onClick={() => retry(alerts.map((alert) => alert.storeId))}
            disabled={busy}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 bg-surface px-2.5 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw size={12} className={busy ? 'animate-spin' : undefined} />
            Reintentar
          </button>
        </div>
      )}

      {pending.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
          <Info size={16} className="mt-0.5 shrink-0 text-gray-500" />
          <div className="flex-1 text-sm text-gray-700">
            <p>
              Aún no hay catálogos cargados para{' '}
              <strong>{pending.map((store) => store.name).join(', ')}</strong>. La ingesta
              automática corre todos los días a las 3:00 a. m.
            </p>
          </div>
          <button
            onClick={() => retry(pending.map((store) => store.id))}
            disabled={busy}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 bg-surface px-2.5 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw size={12} className={busy ? 'animate-spin' : undefined} />
            Cargar ahora
          </button>
        </div>
      )}
    </div>
  );
}

// ─── vista ──────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

export default function Mercado() {
  const [mode, setMode] = useState<Mode>('exact');
  const [scope, setScope] = useState<Scope>('all');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [onlyRisk, setOnlyRisk] = useState(false);
  const [sort, setSort] = useState<'gap' | 'price' | 'name'>('gap');
  const [categoryMetric, setCategoryMetric] = useState<'best' | 'avg'>('best');
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);

  const stats = DATA.modes[mode][scope];
  const kpis = stats.kpis;
  const dates = SCOPE_DATES[scope];

  // al cambiar de alcance la categoría activa puede no existir en el nuevo
  useEffect(() => {
    setCategory(null);
  }, [scope]);

  useEffect(() => {
    setPage(0);
  }, [mode, scope, query, category, onlyRisk, sort]);

  const filtered = useMemo(() => {
    const search = buildSearcher(query);
    const rows: { product: Product; relevance: number }[] = [];
    DATA.products.forEach((product, index) => {
      if (scope === 'food' && product.nonfood) return;
      if (scope === 'nonfood' && !product.nonfood) return;
      if (category && categoryId(product) !== category) return;
      const gap = gapFor(product, mode);
      if (gap === null) return;
      if (onlyRisk && gap < kpis.risk_threshold) return;
      const relevance = search(SEARCH_INDEX[index]);
      if (relevance === null) return;
      rows.push({ product, relevance });
    });
    return rows;
  }, [mode, scope, query, category, onlyRisk, kpis.risk_threshold]);

  const ranked = useMemo(() => {
    const rows = filtered.map(({ product, relevance }) => ({
      product,
      relevance,
      gap: gapFor(product, mode) ?? 0,
      best: bestFor(product, mode),
    }));
    // Como en el ecommerce: con búsqueda activa manda la relevancia y el orden
    // elegido en la tabla solo desempata.
    rows.sort((a, b) => {
      if (b.relevance !== a.relevance) return b.relevance - a.relevance;
      if (sort === 'gap') return b.gap - a.gap;
      if (sort === 'price') return b.product.price - a.product.price;
      return a.product.name.localeCompare(b.product.name, 'es');
    });
    return rows;
  }, [filtered, sort, mode]);

  const pageRows = ranked.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const pages = Math.max(1, Math.ceil(ranked.length / PAGE_SIZE));

  // «Precios a revisar» siempre por brecha, sin importar el orden de la tabla
  const reviewRows = useMemo(() => {
    return filtered
      .map(({ product }) => ({ product, gap: gapFor(product, mode) ?? 0, best: bestFor(product, mode) }))
      .sort((a, b) => b.gap - a.gap)
      .slice(0, 8);
  }, [filtered, mode]);

  const overpriceSum = filtered.reduce((total, { product }) => {
    const gap = gapFor(product, mode);
    if (gap === null || gap <= 0) return total;
    const best = bestFor(product, mode);
    return total + (best ? product.price - best.price : 0);
  }, 0);

  const missingCategories = stats.categories.filter((c) => c.compared === 0);
  const activeCategory = stats.categories.find((c) => c.id === category) ?? null;
  const categoriesByRoot = useMemo(() => {
    const grouped = new Map<string, CategoryStats[]>();
    for (const row of stats.categories) {
      const list = grouped.get(row.root) ?? [];
      list.push(row);
      grouped.set(row.root, list);
    }
    return [...grouped.entries()];
  }, [stats]);
  const totalBuckets = stats.gap_distribution.reduce((sum, b) => sum + b.count, 0);
  const withinTen = stats.gap_distribution
    .filter((b) => b.bucket === '-10 a 0' || b.bucket === '0 a 10')
    .reduce((sum, b) => sum + b.count, 0);
  const withinTenPct = totalBuckets ? Math.round((withinTen / totalBuckets) * 100) : 0;

  return (
    <div className="p-6 space-y-6">
      {/* ── Header ─────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-amber-600">
            Inteligencia de precios · Supermercados
          </p>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">Radar de Precios</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {fmtNum(kpis.universe)} productos{SCOPE_PHRASE[scope]} de Mercaldas ·{' '}
            {DATA.meta.stores.length} almacenes · precios en COP
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            {SCOPES.filter((option) => option.id !== 'nonfood' || HAS_NONFOOD).map((option) => (
              <button
                key={option.id}
                onClick={() => setScope(option.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                  scope === option.id ? 'bg-surface text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setMode('exact')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                mode === 'exact' ? 'bg-surface text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Mismo producto
            </button>
            <button
              onClick={() => setMode('all')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                mode === 'all' ? 'bg-surface text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              + Equivalentes
            </button>
          </div>
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface border border-gray-200 text-xs text-gray-500"
            title={dates.tooltip}
          >
            <Store size={13} />
            {dates.oldest && dates.newest
              ? fmtDay(dates.oldest) === fmtDay(dates.newest)
                ? `Precios al ${fmtDay(dates.newest)}`
                : `Precios ${fmtDay(dates.oldest)} – ${fmtDay(dates.newest)}`
              : 'Precios sin fecha'}
          </div>
        </div>
      </div>

      <MarketIngestBanner />

      {/* ── Buscador global de productos ───────── */}
      <div className="relative w-full max-w-xl">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar producto, marca o código (tolera tildes y errores: «arros», «dianna», 7702…)"
          className="w-full pl-10 pr-10 py-2.5 text-sm rounded-xl border border-gray-200 bg-surface shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-200"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600"
            title="Limpiar búsqueda"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* ── Cobertura ──────────────────────────── */}
      <div className="flex items-start gap-3 bg-amber-50/70 border border-amber-200 rounded-xl px-4 py-3">
        <Info size={16} className="text-amber-600 shrink-0 mt-0.5" />
        <p className="text-sm text-amber-900">
          <strong>{fmtNum(kpis.compared)} de {fmtNum(kpis.universe)}</strong> productos tienen
          comparación ({kpis.compared_pct} %).{' '}
          {kpis.compared_exact > 0 && (
            <>
              {fmtNum(kpis.compared_exact)} cruzan por <strong>EAN exacto</strong> y{' '}
              {fmtNum(kpis.compared_equivalent_only)} solo por <strong>equivalencia</strong>.{' '}
            </>
          )}
          {missingCategories.length > 0 && (
            <>
              Sin comparación en este modo:{' '}
              <strong>
                {missingCategories.map((c) => `${c.name} (${fmtNum(c.total)})`).join(', ')}
              </strong>.
            </>
          )}
        </p>
      </div>

      {/* ── KPIs ───────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={Target}
          label="Productos comparados"
          value={`${kpis.compared_pct} %`}
          sub={`${fmtNum(kpis.compared)} de ${fmtNum(kpis.universe)} del catálogo`}
          hint="Cobertura del análisis: productos de Mercaldas con al menos un precio comparable."
        />
        <KpiCard
          icon={TrendingDown}
          label="Mercaldas es el más barato"
          value={`${kpis.cheapest_pct} %`}
          sub={`${fmtNum(kpis.cheapest)} productos · ${fmtNum(kpis.most_expensive)} más caros`}
          tone="good"
          hint="Productos donde ninguna tienda comparada tiene un precio menor."
        />
        <KpiCard
          icon={TrendingUp}
          label="Brecha mediana vs el más barato"
          value={signed(kpis.median_gap)}
          sub={`p25 ${signed(kpis.p25_gap)} · p75 ${signed(kpis.p75_gap)}`}
          tone="warn"
          hint="Diferencia porcentual de Mercaldas frente al almacén más barato de cada producto."
        />
        <KpiCard
          icon={AlertTriangle}
          label={`En riesgo (> ${kpis.risk_threshold.toFixed(0)} % más caro)`}
          value={fmtNum(kpis.at_risk)}
          sub={`${fmt(kpis.potential_overprice)} de sobreprecio potencial`}
          tone="bad"
          hint="Productos donde Mercaldas está al menos el umbral por encima del competidor más barato."
        />
      </div>

      {/* ── Frente a cada almacén ──────────────── */}
      <div>
        <div className="flex items-end justify-between mb-3 flex-wrap gap-2">
          <div>
            <h2 className="font-semibold text-gray-900">Frente a cada almacén</h2>
            <p className="text-xs text-gray-400">
              Cuántos productos cuestan más, igual o menos en Mercaldas, y la brecha mediana
              {' '}(positivo = Mercaldas más caro)
            </p>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-gray-500">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" /> Mercaldas más barato</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-300" /> Igual</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400" /> Mercaldas más caro</span>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {stats.stores.map((store) => (
            <StoreCard key={store.id} store={store} total={kpis.universe} />
          ))}
        </div>
      </div>

      {/* ── Distribución + categorías ──────────── */}
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="bg-surface rounded-2xl border border-gray-100 p-5">
          <h3 className="font-semibold text-gray-900">Distribución de la brecha</h3>
          <p className="text-xs text-gray-400 mb-3">Productos por rango de diferencia frente al más barato</p>
          <GapDistribution buckets={stats.gap_distribution} />
          <p className="text-xs text-gray-500 mt-2">
            El <strong>{withinTenPct} %</strong> de los productos comparados está dentro de ±10 % de la competencia.
          </p>
        </div>

        <div className="lg:col-span-2 bg-surface rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-semibold text-gray-900">Por categoría</h3>
              <p className="text-xs text-gray-400">
                Brecha mediana {categoryMetric === 'best' ? 'frente al más barato' : 'frente al promedio de la competencia'} · clic para filtrar
              </p>
            </div>
            {category && (
              <button
                onClick={() => setCategory(null)}
                className="flex items-center gap-1 text-xs font-semibold text-amber-700 hover:text-amber-900"
              >
                <X size={12} /> Quitar filtro
              </button>
            )}
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setCategoryMetric('best')}
                className={`px-2 py-1 text-[11px] font-semibold rounded-md transition-all ${
                  categoryMetric === 'best' ? 'bg-surface text-gray-800 shadow-sm' : 'text-gray-500'
                }`}
              >
                vs más barato
              </button>
              <button
                onClick={() => setCategoryMetric('avg')}
                className={`px-2 py-1 text-[11px] font-semibold rounded-md transition-all ${
                  categoryMetric === 'avg' ? 'bg-surface text-gray-800 shadow-sm' : 'text-gray-500'
                }`}
              >
                vs promedio
              </button>
            </div>
          </div>
          <div className="max-h-[290px] overflow-y-auto pr-1">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface">
                <tr className="text-[11px] uppercase tracking-wide text-gray-400">
                  <th className="text-left font-semibold py-1.5">Categoría</th>
                  <th className="text-right font-semibold">Comp.</th>
                  <th className="text-right font-semibold">Cob.</th>
                  <th className="text-right font-semibold w-28">Brecha med.</th>
                  <th className="w-32" />
                </tr>
              </thead>
              <tbody>
                {stats.categories.map((row) => {
                  const value = categoryMetric === 'best' ? row.median_gap : row.median_gap_avg;
                  const width = value === null ? 0 : Math.min(Math.abs(value), 30) / 30 * 50;
                  const active = category === row.id;
                  return (
                    <tr
                      key={row.id}
                      onClick={() => setCategory(active ? null : row.id)}
                      title={`${row.root} > ${row.name} · sobreprecio potencial ${fmt(row.overprice_cop)}`}
                      className={`cursor-pointer border-t border-gray-50 hover:bg-gray-50/80 ${active ? 'bg-amber-50/60' : ''}`}
                    >
                      <td className="py-1.5 pr-2 max-w-[200px]">
                        <p className="text-gray-700 truncate" title={row.id}>{row.name}</p>
                        <p className="text-[10px] text-gray-400 truncate">{row.root}</p>
                      </td>
                      <td className="text-right text-gray-500 text-xs">{fmtNum(row.compared)}</td>
                      <td className={`text-right text-xs ${row.coverage_pct < 20 ? 'text-amber-600 font-semibold' : 'text-gray-400'}`}>
                        {row.coverage_pct.toFixed(0)} %
                      </td>
                      <td className={`text-right font-semibold text-xs ${gapTextColor(value)}`}>
                        {signed(value)}
                      </td>
                      <td>
                        <div className="relative h-2 rounded-full bg-gray-100 ml-2">
                          <div className="absolute inset-y-0 left-1/2 w-px bg-gray-300" />
                          {value !== null && (
                            <div
                              className={`absolute inset-y-0 rounded-full ${value < 0 ? 'bg-green-500' : 'bg-red-400'}`}
                              style={value < 0
                                ? { right: '50%', width: `${width}%` }
                                : { left: '50%', width: `${width}%` }}
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Heatmap categoría × almacén ────────── */}
      <div className="bg-surface rounded-2xl border border-gray-100 p-5">
        <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
          <div>
            <h3 className="font-semibold text-gray-900">Brecha mediana por categoría y almacén</h3>
            <p className="text-xs text-gray-400">
              Rojo = Mercaldas más caro · verde = más barato · gris = sin comparación
            </p>
          </div>
          <p className="text-[11px] text-gray-400">Solo categorías con al menos 20 comparaciones</p>
        </div>
        <div className="max-h-[440px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface z-10">
              <tr className="text-[11px] uppercase tracking-wide text-gray-400">
                <th className="text-left font-semibold pb-2">Categoría</th>
                {STORE_ORDER.map((store) => (
                  <th key={store} className="text-center font-semibold pb-2 w-28">{STORE_NAMES[store]}</th>
                ))}
                <th className="text-center font-semibold pb-2 w-28">Promedio</th>
              </tr>
            </thead>
            <tbody>
              {stats.categories.filter((c) => c.compared >= 20).map((row) => (
                <tr key={row.id} className="border-t border-gray-50">
                  <td className="py-1.5 max-w-[240px]" title={row.id}>
                    <p className="text-gray-700 truncate">{row.name}</p>
                    <p className="text-[10px] text-gray-400 truncate">{row.root}</p>
                  </td>
                  {STORE_ORDER.map((store) => {
                    const gap = row.stores[store] ?? null;
                    return (
                      <td key={store} className="text-center px-1 py-1">
                        <span
                          className="block rounded-md py-1 text-xs font-semibold text-gray-800"
                          style={{ background: heatBackground(gap) }}
                        >
                          {gap === null || gap === undefined ? '—' : signed(gap)}
                        </span>
                      </td>
                    );
                  })}
                  <td className="text-center px-1 py-1">
                    <span
                      className="block rounded-md py-1 text-xs font-semibold text-gray-800"
                      style={{ background: heatBackground(row.median_gap) }}
                    >
                      {signed(row.median_gap)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Precios a revisar ──────────────────── */}
      <div className="bg-surface rounded-2xl border border-gray-100">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-wrap gap-2">
          <div>
            <h3 className="font-semibold text-gray-900">Precios a revisar</h3>
            <p className="text-xs text-gray-400">
              {category ? `Categoría: ${activeCategory?.name ?? category} · ` : ''}
              {fmtNum(ranked.length)} productos · {fmt(overpriceSum)} de sobreprecio acumulado
            </p>
          </div>
          <span className="text-[11px] px-2 py-1 rounded-md bg-red-50 text-red-600 font-semibold">
            Top {reviewRows.length} por brecha
          </span>
        </div>
        <div className="divide-y divide-gray-50">
          {reviewRows.length === 0 && (
            <p className="px-5 py-8 text-sm text-gray-400 text-center">Sin productos para este filtro.</p>
          )}
          {reviewRows.map(({ product, gap, best }) => (
            <button
              key={product.id}
              onClick={() => {
                setOpenId(product.id);
                setCategory(null);
                setPage(0);
                setQuery(product.name.slice(0, 30));
              }}
              className="w-full text-left px-5 py-3 hover:bg-gray-50/70 transition-colors flex items-center gap-4"
            >
              <span className="w-16 text-right font-bold text-red-600 text-sm shrink-0">{gap > 0 ? '+' : ''}{gap.toFixed(1)} %</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 truncate">{product.name}</p>
                <p className="text-xs text-gray-400">
                  {product.category_l2} · {fmt(product.price)}
                  {best && <> vs {STORE_NAMES[best.store]} {fmt(best.price)}</>}
                </p>
              </div>
              {best && (
                <div className="text-right shrink-0">
                  <p className="text-xs font-semibold text-gray-700">{fmt(product.price - best.price)}</p>
                  <p className="text-[10px] text-gray-400">sobreprecio</p>
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Detalle por producto ───────────────── */}
      <div className="bg-surface rounded-2xl border border-gray-100">
        <div className="px-5 py-4 border-b border-gray-100 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="font-semibold text-gray-900">Detalle por producto</h3>
              <p className="text-xs text-gray-400">
                Precio de Mercaldas frente a cada almacén · <em className="not-italic">≈ cursiva = equivalente</em>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => downloadCsv(ranked.map((row) => row.product), mode)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-600 bg-surface border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                <Download size={13} /> Descargar CSV
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[220px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filtrar productos por nombre, marca o PLU…"
                className="w-full pl-9 pr-9 py-2 text-sm rounded-lg border border-gray-200 bg-surface focus:outline-none focus:ring-2 focus:ring-amber-200"
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600"
                  title="Limpiar búsqueda"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <select
              value={category ?? ''}
              onChange={(event) => setCategory(event.target.value || null)}
              className="px-2.5 py-2 text-xs rounded-lg border border-gray-200 bg-surface text-gray-700 max-w-[280px]"
            >
              <option value="">Todas las categorías de Mercaldas</option>
              {categoriesByRoot.map(([root, rows]) => (
                <optgroup key={root} label={root}>
                  {rows.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name} ({fmtNum(row.compared)})
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>

            {category && (
              <button
                onClick={() => setCategory(null)}
                className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-amber-50 text-amber-800 text-xs font-semibold"
              >
                <Filter size={12} /> {activeCategory?.name ?? category} <X size={12} />
              </button>
            )}

            <label className="flex items-center gap-2 text-xs text-gray-600 px-2">
              <input
                type="checkbox"
                checked={onlyRisk}
                onChange={(event) => setOnlyRisk(event.target.checked)}
                className="rounded border-gray-300"
              />
              Solo en riesgo (&gt; {kpis.risk_threshold.toFixed(0)} %)
            </label>

            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as typeof sort)}
              className="px-2.5 py-2 text-xs rounded-lg border border-gray-200 bg-surface text-gray-600"
            >
              <option value="gap">Mayor brecha</option>
              <option value="price">Mayor precio</option>
              <option value="name">Nombre (A-Z)</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-gray-400 bg-gray-50/60">
                <th className="text-left font-semibold px-4 py-2">Producto</th>
                <th className="text-right font-semibold px-2">Mercaldas</th>
                {STORE_ORDER.map((store) => (
                  <th key={store} className="text-right font-semibold px-2">{STORE_NAMES[store]}</th>
                ))}
                <th className="text-right font-semibold px-2">Mejor</th>
                <th className="text-right font-semibold px-4">Diferencia</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map(({ product, gap, best }) => {
                const open = openId === product.id;
                return (
                  <Fragment key={product.id}>
                    <tr
                      onClick={() => setOpenId(open ? null : product.id)}
                      className={`border-t border-gray-50 cursor-pointer hover:bg-gray-50/70 ${open ? 'bg-amber-50/40' : ''}`}
                    >
                      <td className="px-4 py-2 max-w-[280px]">
                        <p className="truncate text-gray-800">{product.name}</p>
                        <p className="text-[11px] text-gray-400 truncate">
                          {product.category_l2} · {product.category_l3}
                        </p>
                      </td>
                      <td className="text-right px-2 font-semibold text-gray-900 whitespace-nowrap">{fmt(product.price)}</td>
                      {STORE_ORDER.map((store) => {
                        const match = storeMatch(product, store, mode);
                        if (!match) return <td key={store} className="text-right px-2 text-gray-300">—</td>;
                        const cheaper = match.price < product.price;
                        return (
                          <td key={store} className="text-right px-2 whitespace-nowrap">
                            <span className={`${match.type === 'equivalente' ? 'italic text-gray-500' : ''} ${cheaper ? 'text-green-700' : 'text-gray-700'}`}>
                              {fmt(match.price)}
                            </span>
                          </td>
                        );
                      })}
                      <td className="text-right px-2 text-gray-500 whitespace-nowrap text-xs">
                        {best ? STORE_NAMES[best.store] : '—'}
                      </td>
                      <td className={`text-right px-4 font-bold whitespace-nowrap ${gapTextColor(gap)}`}>
                        {signed(gap)}
                      </td>
                    </tr>
                    {open && (
                      <tr className="bg-gray-50/60">
                        <td colSpan={4 + STORE_ORDER.length} className="px-4 py-3">
                          <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
                            {STORE_ORDER.map((store) => {
                              const match = storeMatch(product, store, mode);
                              return (
                                <div key={store} className="rounded-xl bg-surface border border-gray-100 px-3 py-2">
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
                                      <span className="w-2 h-2 rounded-full" style={{ background: STORE_COLORS[store] }} />
                                      {STORE_NAMES[store]}
                                    </span>
                                    <span className={`text-xs font-bold ${match ? (match.price < product.price ? 'text-green-600' : 'text-red-600') : 'text-gray-300'}`}>
                                      {match ? fmt(match.price) : '—'}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-gray-500 leading-snug">
                                    {match ? (
                                      <>
                                        {match.type === 'equivalente' ? '≈ ' : ''}
                                        {match.name}
                                        {match.type === 'equivalente' && match.score
                                          ? ` · similitud ${(match.score * 100).toFixed(0)} %`
                                          : ''}
                                      </>
                                    ) : (
                                      'Sin producto comparable'
                                    )}
                                  </p>
                                </div>
                              );
                            })}
                          </div>
                          <div className="flex items-center gap-2 mt-3 text-[11px] text-gray-500">
                            <ExternalLink size={12} />
                            PLU Mercaldas {product.id} · precio {fmt(product.price)}
                            {best && <> · mejor precio en {STORE_NAMES[best.store]} ({fmt(best.price)})</>}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 text-xs text-gray-500">
          <span>
            {ranked.length === 0 ? '0 productos' : `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, ranked.length)} de ${fmtNum(ranked.length)}`}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-2.5 py-1 rounded-md border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
            >
              Anterior
            </button>
            <span>Página {page + 1} de {pages}</span>
            <button
              onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
              disabled={page >= pages - 1}
              className="px-2.5 py-1 rounded-md border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
            >
              Siguiente
            </button>
          </div>
        </div>
      </div>

      {/* ── Nota metodológica ──────────────────── */}
      <div className="flex items-start gap-3 text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
        <Info size={14} className="text-gray-400 shrink-0 mt-0.5" />
        <p>
          <strong className="text-gray-700">Método.</strong> «Mismo producto» cruza por EAN idéntico; «+ Equivalentes»
          añade productos del mismo tipo y mismo contenido (peso/volumen/unidades) de otra marca, con similitud de
          nombre ≥ {(DATA.meta.threshold * 100).toFixed(0)} %. La diferencia se calcula contra el <em>almacén más
          barato</em> de cada producto. Se descartaron {fmtNum(DATA.meta.pack_mismatch_dropped)} pares por empaque
          incompatible (pack vs unidad).{' '}
          {HAS_NONFOOD
            ? 'Los no-alimentos solo cruzan por EAN idéntico (marca y especificaciones no admiten equivalencia por nombre).'
            : 'Cobertura actual: solo catálogos de alimentos.'}
        </p>
      </div>
    </div>
  );
}
