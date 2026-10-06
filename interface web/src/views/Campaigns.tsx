import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Plus, Search, MessageCircle, Mail, Smartphone, Zap,
  ArrowRight, ChevronLeft, ChevronDown, RefreshCw, Send, Clock,
  CheckCircle, Users, TrendingUp, Eye, Edit3, X,
  Sparkles, Target, BarChart2, Calendar,
  Palette, ShoppingBag, Pencil, Trash2, History, RotateCw,
  Filter, CheckSquare, SlidersHorizontal, MapPin, Wallet, ShieldCheck,
  PawPrint, Upload, Maximize2, Info, LayoutGrid, List, Save,
} from "lucide-react";
import EmailEditor, {
  newBlock,
  defaultTemplate,
  blocksToHtml,
  type EmailBlock,
} from "../components/EmailEditor";
import { EmailHtmlPreview, EmailFullPreviewModal } from "../components/EmailFullPreview";
import {
  campaignsService,
  type Campaign as ApiCampaign,
  type CampaignChannel,
  type CampaignHistoryEntry,
  type Recipient,
  type SegmentPreviewResult,
  type SegmentRankingRow,
  type ScoredClient,
  type ScoreClientsPayload,
  type ClientFilterOptions,
} from "../services/campaigns.service";
import { catalogService, type CatalogProduct, type CatalogCategory, type PluFileImportResult } from "../services/catalog.service";
import footerLogo from "../assets/logo.png";
import { getPhonePrefixes, DEFAULT_PHONE_PREFIX, buildInternationalPhone } from "../lib/phone-prefixes";

/* ─── Types ─────────────────────────────────────── */
/** Producto del catálogo real (alias del tipo del servicio de catálogo). */
type Product = CatalogProduct;

interface GeneratedContent {
  whatsapp: string; email: { subject: string; body: string }; sms: string;
}

type CampaignStatus = "borrador" | "programada" | "enviando" | "enviada" | "fallida";
type Step = 1 | 2 | 3 | 4;

/* ─── Placeholders de segmentación ──────────────── */
// Respaldo del público objetivo mientras la segmentación no ha respondido.
const ESTIMATED_AUDIENCE = 500;

const STATUS_CFG: Record<CampaignStatus, { label: string; color: string; bg: string; border: string }> = {
  borrador:   { label: "Borrador",   color: "text-gray-600",  bg: "bg-gray-100",   border: "border-gray-200" },
  programada: { label: "Programada", color: "text-blue-700",  bg: "bg-blue-50",    border: "border-blue-200" },
  enviando:   { label: "Enviando",   color: "text-amber-700", bg: "bg-amber-50",   border: "border-amber-200" },
  enviada:    { label: "Enviada",    color: "text-green-700", bg: "bg-green-50",   border: "border-green-200" },
  fallida:    { label: "Fallida",    color: "text-red-700",   bg: "bg-red-50",     border: "border-red-200" },
};

const CHANNEL_CFG = {
  wa:    { label: "WhatsApp", bg: "bg-green-500",  icon: MessageCircle },
  email: { label: "Email",    bg: "bg-blue-500",   icon: Mail },
  sms:   { label: "SMS",      bg: "bg-purple-500", icon: Smartphone },
};

/** Orden por defecto del canal prioritario (whatsapp → email → sms). */
const CHANNEL_ORDER: (keyof typeof CHANNEL_CFG)[] = ["wa", "email", "sms"];

/** Claves del wizard (wa/email/sms) ↔ canales de la API (whatsapp/email/sms). */
const CHANNEL_TO_API: Record<keyof typeof CHANNEL_CFG, CampaignChannel> = {
  wa: "whatsapp",
  email: "email",
  sms: "sms",
};

/** Servicio de SMS (Vassago/sms_service). Solo este canal está conectado para pruebas. */
const SMS_TEST_API_URL = import.meta.env.VITE_SMS_API_URL || "http://localhost:8015";

/** Código legible de la campaña (derivado del id). */
function campaignCode(id: number): string {
  return `CMP-${String(id).padStart(4, "0")}`;
}

const CHANNEL_FROM_API: Record<CampaignChannel, keyof typeof CHANNEL_CFG> = {
  whatsapp: "wa",
  email: "email",
  sms: "sms",
};

/** Forma de la tarjeta de campaña (lo que consume CampaignCard). */
interface CampaignCardData {
  id: number;
  name: string;
  product: string;
  /** Ids de los productos de la campaña (para filtrar por producto). */
  productIds: number[];
  channels: (keyof typeof CHANNEL_CFG)[];
  audience: number;
  audienceMode?: "auto" | "manual" | "mixed";
  status: CampaignStatus;
  sent: number;
  opens: number;
  conversions: number;
  date: string;
}

function apiToCard(c: ApiCampaign): CampaignCardData {
  return {
    id: c.id,
    name: c.name,
    product:
      c.products?.length
        ? c.products.map((p) => p.name).join(", ")
        : c.product?.name ?? "Sin producto",
    productIds: c.products?.length
      ? c.products.map((p) => p.id)
      : c.product
        ? [c.product.id]
        : [],
    channels: c.channels
      .map((ch) => CHANNEL_FROM_API[ch])
      .filter(Boolean),
    audience: c.audienceCount,
    audienceMode: c.audienceMode,
    status: c.status,
    sent: c.sentCount,
    opens: c.openedCount,
    conversions: c.convertedCount,
    date: (c.scheduledAt ?? c.createdAt ?? "").slice(0, 10),
  };
}

/** Extrae un texto plano de los bloques del correo (para el preview). */
function blocksToText(bloques: { type: string; props: Record<string, unknown> }[]): string {
  const strip = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const partes: string[] = [];
  for (const b of bloques ?? []) {
    const p = b.props ?? {};
    if (b.type === "text" && typeof p.text === "string") {
      const t = strip(p.text);
      if (t) partes.push(t);
    } else if (b.type === "columns" && Array.isArray(p.items)) {
      for (const it of p.items as { text?: string }[]) {
        if (typeof it.text === "string" && it.text.trim()) partes.push(strip(it.text));
      }
    }
  }
  return partes.join("\n");
}

/* ─── Helpers ───────────────────────────────────── */
function fmt(n: number) { return "$" + n.toLocaleString("es-CO"); }

/** Convierte el contenido generado en bloques para el diseñador de correo. */
function buildEmailBlocks(product: Product, content: GeneratedContent): EmailBlock[] {
  const bodyHtml = content.email.body
    .split(/\n\n+/)
    .map((p) => `<p style="margin:0 0 8px;">${p.replace(/\n/g, "<br/>")}</p>`)
    .join("");
  return [
    { ...newBlock("text"), props: { text: "🛒 Mercaldas", fontSize: 24, color: "#B45309", align: "center", bold: true } },
    { ...newBlock("image"), props: { src: product.image ?? undefined, alt: product.name, width: 100, borderRadius: 12, borderWidth: 0, shadow: true } },
    { ...newBlock("text"), props: { text: bodyHtml, fontSize: 15, color: "#1F2937", align: "left" } },
    { ...newBlock("button"), props: { text: "Ver oferta →", link: "https://mercaldas.com/promo", bg: "#FBBF24", color: "#78350F", radius: 10, align: "center" } },
    newBlock("divider"),
    newBlock("social"),
    { ...newBlock("text"), props: { text: "El equipo de Mercaldas 💛<br/>Si no quieres recibir más correos, haz clic aquí.", fontSize: 12, color: "#9CA3AF", align: "center" } },
  ];
}

/**
 * La IA arma los bloques del correo sin recibir la imagen real del producto, así
 * que suele inventar la URL de la imagen (p. ej. `mercaldas.com/img/<slug>.jpg`,
 * que ya no existe). Aquí forzamos la imagen real del producto (Cloudinary) para
 * que el correo muestre siempre una imagen válida; si el producto no tiene
 * imagen, se limpia la `src` para no dejar una imagen rota.
 */
function withRealProductImage(blocks: EmailBlock[], image: string | null | undefined): EmailBlock[] {
  return blocks.map((b) =>
    b.type === "image"
      ? { ...b, props: { ...b.props, src: image ?? undefined } }
      : b,
  );
}

/* ─── Channel preview components ───────────────── */
function WhatsAppPreview({ text, editable, onEdit }: { text: string; editable: boolean; onEdit: (t: string) => void }) {
  return (
    <div className="flex flex-col h-full rounded-2xl overflow-hidden shadow-lg" style={{ background: "#ECE5DD" }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3" style={{ background: "#075E54" }}>
        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
          <MessageCircle size={16} className="text-white" />
        </div>
        <div>
          <p className="text-white text-sm font-semibold leading-tight">Mercaldas</p>
          <p className="text-white/70 text-[10px]">en línea</p>
        </div>
      </div>
      {/* Body */}
      <div className="flex-1 p-4 overflow-y-auto">
        <div className="max-w-[85%] rounded-2xl rounded-tl-sm p-3 shadow-sm" style={{ background: "#DCF8C6" }}>
          {editable ? (
            <textarea
              value={text}
              onChange={(e) => onEdit(e.target.value)}
              className="w-full text-xs text-gray-800 bg-transparent resize-none focus:outline-none leading-relaxed"
              rows={10}
            />
          ) : (
            <p className="text-xs text-gray-800 whitespace-pre-wrap leading-relaxed">{text}</p>
          )}
          <p className="text-right text-[10px] text-gray-500 mt-1">12:00 ✓✓</p>
        </div>
      </div>
    </div>
  );
}

function EmailPreview({ subject, body, editableBody, onEditSubject, onEditBody, html }: {
  subject: string; body: string; editableBody: boolean;
  onEditSubject: (s: string) => void; onEditBody: (b: string) => void;
  html?: string | null;
}) {
  // Con HTML del diseñador el correo define su propio alto (ocupa el ancho de la
  // tarjeta); sin él se conserva el alto fijo del contenedor de la tarjeta.
  const autoHeight = !!html;
  return (
    <div className={`flex flex-col rounded-2xl overflow-hidden shadow-lg border border-gray-200 bg-white ${autoHeight ? "" : "h-full"}`}>
      {/* Fake browser bar */}
      <div className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 border-b border-gray-200">
        <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
        <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
        <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
        <p className="ml-3 text-[10px] text-gray-400">Gmail — Bandeja de entrada</p>
      </div>
      {/* Email header */}
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-6 h-6 rounded-full bg-amber-400 flex items-center justify-center shrink-0">
            <span className="text-[10px] font-bold text-white">M</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-gray-800">Mercaldas <span className="text-gray-400 font-normal">noreply@mercaldas.com</span></p>
          </div>
        </div>
        <input
          value={subject}
          onChange={(e) => onEditSubject(e.target.value)}
          className="text-xs font-bold text-gray-900 w-full focus:outline-none focus:bg-gray-50 rounded px-1 -mx-1"
        />
      </div>
      {/* Email body */}
      <div className={autoHeight ? "" : "flex-1 overflow-hidden"}>
        {html ? (
          <EmailHtmlPreview html={html} variant="card" />
        ) : (
          <div className="h-full overflow-y-auto">
            {/* Fake banner */}
            <div className="h-16 bg-gradient-to-r from-amber-400 to-amber-500 flex items-center justify-center">
              <p className="text-amber-900 font-bold text-sm">🛒 Mercaldas</p>
            </div>
            <div className="px-4 py-3">
              {editableBody ? (
                <textarea
                  value={body}
                  onChange={(e) => onEditBody(e.target.value)}
                  className="w-full text-xs text-gray-700 leading-relaxed bg-transparent resize-none focus:outline-none focus:bg-gray-50 rounded"
                  rows={12}
                />
              ) : (
                <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">{body}</p>
              )}
              <button className="mt-3 w-full py-2 text-xs font-bold bg-amber-400 text-amber-900 rounded-xl">
                Ver oferta →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SmsPreview({ text, editable, onEdit }: { text: string; editable: boolean; onEdit: (t: string) => void }) {
  const chars = text.length;
  const overLimit = chars > 160;
  return (
    <div className="flex flex-col h-full rounded-2xl overflow-hidden shadow-lg border border-gray-200" style={{ background: "#F2F2F7" }}>
      {/* Header */}
      <div className="flex items-center justify-center px-4 py-3 bg-white border-b border-gray-200">
        <div className="text-center">
          <p className="text-sm font-semibold text-gray-900">Mercaldas</p>
          <p className="text-[10px] text-gray-400">Mensaje de texto</p>
        </div>
      </div>
      {/* Body */}
      <div className="flex-1 p-4">
        <div className="max-w-[80%] rounded-2xl rounded-tl-sm p-3 bg-gray-300 shadow-sm">
          {editable ? (
            <textarea
              value={text}
              onChange={(e) => onEdit(e.target.value)}
              className={`w-full text-xs bg-transparent resize-none focus:outline-none leading-relaxed ${overLimit ? "text-red-600" : "text-gray-800"}`}
              rows={5}
            />
          ) : (
            <p className={`text-xs whitespace-pre-wrap leading-relaxed ${overLimit ? "text-red-600" : "text-gray-800"}`}>{text}</p>
          )}
        </div>
        <div className={`mt-2 text-right text-[10px] font-semibold ${overLimit ? "text-red-500" : "text-gray-400"}`}>
          {chars}/160 {overLimit && "⚠ supera el límite"}
        </div>
      </div>
    </div>
  );
}

/* ─── Step components ───────────────────────────── */
function Step1({
  selectedProducts, onToggle, onClear, channels, onNext, onOpenImport,
}: {
  selectedProducts: Product[];
  onToggle: (p: Product) => void;
  onClear: () => void;
  channels: Record<string, boolean>;
  onNext: () => void;
  onOpenImport: () => void;
}) {
  const [search, setSearch] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [activeCats, setActiveCats] = useState<number[]>([]);
  const [showSelected, setShowSelected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    Promise.all([
      catalogService.getProducts({ limit: 200, isActive: true }),
      catalogService.getCategories(),
    ])
      .then(([list, cats]) => {
        if (cancelled) return;
        setProducts(list);
        setCategories(cats);
      })
      .catch((e) => {
        if (!cancelled)
          setLoadError(
            e instanceof Error ? e.message : "No se pudieron cargar los productos",
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleCat = (id: number) =>
    setActiveCats((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const q = search.trim().toLowerCase();
  const catNames = new Set(
    categories.filter((c) => activeCats.includes(c.id)).map((c) => c.name),
  );
  const filtered = products.filter((p) => {
    if (activeCats.length) {
      const byId = p.categoryId != null && activeCats.includes(p.categoryId);
      const byName = catNames.has(p.category ?? "");
      if (!byId && !byName) return false;
    }
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      (p.category ?? "").toLowerCase().includes(q) ||
      (p.brandName ?? "").toLowerCase().includes(q) ||
      (p.productTypeName ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0 p-6 flex flex-col">
        <div className="max-w-4xl mx-auto w-full flex-1 min-h-0 flex flex-col">
          <div className="mb-6 flex items-start justify-between gap-4 shrink-0">
            <div>
              <h2 className="text-xl font-bold text-gray-900">¿Qué producto(s) quieres promocionar?</h2>
              <p className="text-sm text-gray-500 mt-1">Puedes seleccionar varios productos para una misma campaña.</p>
            </div>
            <div className="shrink-0 flex items-center gap-2">
              {selectedProducts.length > 0 && (
                <button
                  onClick={() => setShowSelected(true)}
                  className="flex items-center gap-1.5 bg-amber-100 hover:bg-amber-200 text-amber-800 text-xs font-bold px-3 py-2 rounded-full transition-colors"
                >
                  <ShoppingBag size={13} />
                  Ver seleccionados ({selectedProducts.length})
                </button>
              )}
              <button
                onClick={onOpenImport}
                className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold px-3 py-2 rounded-full transition-colors"
                title="Cargar productos desde un archivo (JSON/CSV/XLSX) validando su PLU"
              >
                <Upload size={13} />
                Cargar por PLU
              </button>
            </div>
          </div>

          <div className="relative mb-5 shrink-0">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar producto por nombre o categoría..."
              className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white"
            />
          </div>

          {categories.length > 0 && (
            <div className="mb-5 shrink-0">
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                <button
                  onClick={() => setActiveCats([])}
                  className={`shrink-0 px-3 py-1.5 text-xs font-semibold rounded-full border transition-all ${activeCats.length === 0 ? "bg-amber-400 text-amber-900 border-transparent" : "bg-white border-gray-200 text-gray-600 hover:border-amber-300"}`}
                >
                  Todas
                </button>
                {categories.map((c) => {
                  const on = activeCats.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      onClick={() => toggleCat(c.id)}
                      className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full border transition-all ${on ? "bg-amber-400 text-amber-900 border-transparent" : "bg-white border-gray-200 text-gray-600 hover:border-amber-300"}`}
                    >
                      {c.name}
                      {c.count > 0 && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${on ? "bg-amber-900/15 text-amber-900" : "bg-gray-100 text-gray-400"}`}>
                          {c.count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Scrolleable: contenedor de productos */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-2xl border-2 border-gray-100 p-4 animate-pulse">
                  <div className="w-14 h-14 rounded-xl bg-gray-100 mb-3" />
                  <div className="h-3 bg-gray-100 rounded mb-2" />
                  <div className="h-3 bg-gray-100 rounded w-1/2" />
                </div>
              ))
            ) : loadError ? (
              <div className="col-span-full bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
                <p className="text-sm font-semibold text-red-700 mb-1">No se pudieron cargar los productos</p>
                <p className="text-xs text-red-500">{loadError}</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="col-span-full bg-gray-50 border border-gray-100 rounded-2xl p-8 text-center">
                <p className="text-sm text-gray-500">
                  No hay productos que coincidan con los filtros aplicados.
                </p>
              </div>
            ) : (
              filtered.map((p) => {
                const active = selectedProducts.some((s) => s.id === p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => onToggle(p)}
                    className={`relative text-left rounded-2xl border-2 p-4 transition-all hover:shadow-md ${active ? "border-amber-400 bg-amber-50 shadow-md" : "border-gray-100 bg-white hover:border-gray-200"}`}
                  >
                    {active && (
                      <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-amber-400 flex items-center justify-center">
                        <CheckCircle size={12} className="text-white" />
                      </div>
                    )}
                    <div className="w-14 h-14 rounded-xl overflow-hidden bg-gray-100 mb-3 flex items-center justify-center">
                      {p.image ? (
                        <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-xl">🛒</span>
                      )}
                    </div>
                    <p className={`text-sm font-semibold leading-tight mb-1 ${active ? "text-amber-900" : "text-gray-800"}`}>{p.name}</p>
                    <p className="text-xs text-gray-400 mb-2">{fmt(p.price)}</p>
                    <div className="flex items-center gap-1.5 text-[10px] font-semibold text-amber-700 bg-amber-100 px-2 py-1 rounded-lg w-fit max-w-full">
                      <Target size={9} className="shrink-0" />
                      <span className="truncate">
                        {p.category || "General"}
                        {p.brandName ? ` · ${p.brandName}` : ""}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
          </div>
        </div>
      </div>

      <div className="shrink-0 px-6 py-2.5 border-t border-gray-200 bg-white flex justify-end">
        <button
          onClick={onNext}
          disabled={selectedProducts.length === 0 || !Object.values(channels).some(Boolean)}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold bg-amber-400 text-amber-900 hover:bg-amber-500 rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Siguiente <ArrowRight size={15} />
        </button>
      </div>

      {/* Modal: productos seleccionados */}
      {showSelected && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/40 cursor-pointer"
          onClick={() => setShowSelected(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col max-h-[80vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
              <p className="font-bold text-gray-900 text-sm">
                Productos seleccionados ({selectedProducts.length})
              </p>
              <button
                onClick={() => setShowSelected(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {selectedProducts.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-10">
                  Aún no has seleccionado productos.
                </p>
              ) : (
                selectedProducts.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 bg-gray-50 border border-gray-100 rounded-xl p-2.5">
                    <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-200 flex items-center justify-center shrink-0">
                      {p.image ? (
                        <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-base">🛒</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{p.name}</p>
                      <p className="text-xs text-gray-400 truncate">
                        {[p.category, p.brandName].filter(Boolean).join(" · ") || "Catálogo Mercaldas"} · {fmt(p.price)}
                      </p>
                    </div>
                    <button
                      onClick={() => onToggle(p)}
                      className="w-7 h-7 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 flex items-center justify-center shrink-0 transition-colors"
                      title="Quitar"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
            <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 shrink-0">
              <button
                onClick={() => {
                  onClear();
                  setShowSelected(false);
                }}
                className="text-xs font-semibold text-red-600 hover:text-red-700 transition-colors"
              >
                Limpiar todo
              </button>
              <button
                onClick={() => setShowSelected(false)}
                className="px-4 py-2 text-xs font-bold bg-amber-400 text-amber-900 hover:bg-amber-500 rounded-xl transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* Switch de canal: permite deshabilitar un módulo sin perder su contenido. */
function ChannelSwitch({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      onClick={onToggle}
      title={active ? "Desactivar este canal" : "Activar este canal"}
      className="flex items-center gap-1.5 shrink-0 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
    >
      <span
        className={`relative rounded-full transition-colors ${active ? "bg-green-500" : "bg-gray-300"}`}
        style={{ width: 36, height: 20 }}
      >
        <span
          className="absolute top-0.5 bg-white rounded-full shadow transition-transform"
          style={{ width: 16, height: 16, left: 2, transform: active ? "translateX(16px)" : "none" }}
        />
      </span>
      <span className={`text-[10px] font-bold tracking-wide ${active ? "text-green-600" : "text-gray-400"}`}>
        {active ? "Activo" : "Inactivo"}
      </span>
    </button>
  );
}

function Step2({
  products,
  channels,
  priorityChannel,
  onPriorityChange,
  prompt,
  setPrompt,
  campaignName,
  setCampaignName,
  generating,
  generated,
  content,
  editableWa,
  editableEmail,
  editableSms,
  onGenerate,
  onEditWa,
  onEditEmailSubject,
  onEditEmailBody,
  onEditSms,
  onToggleEdit,
  onOpenDesigner,
  emailHtml,
  genError,
  onNext,
  onBack,
  onToggleChannel,
  reviewUpToDate,
}: {
  products: Product[];
  channels: Record<string, boolean>;
  priorityChannel: keyof typeof CHANNEL_CFG;
  onPriorityChange: (k: keyof typeof CHANNEL_CFG) => void;
  prompt: string;
  setPrompt: (s: string) => void;
  campaignName: string;
  setCampaignName: (s: string) => void;
  generating: boolean;
  generated: boolean;
  content: GeneratedContent | null;
  editableWa: boolean;
  editableEmail: boolean;
  editableSms: boolean;
  onGenerate: () => void;
  onEditWa: (t: string) => void;
  onEditEmailSubject: (s: string) => void;
  onEditEmailBody: (b: string) => void;
  onEditSms: (t: string) => void;
  onToggleEdit: (ch: "wa" | "email" | "sms") => void;
  onOpenDesigner: () => void;
  emailHtml: string | null;
  genError: string | null;
  onNext: () => void;
  onBack: () => void;
  onToggleChannel: (c: string) => void;
  /** true si ya revisaste con estos productos: avanzar no vuelve a segmentar. */
  reviewUpToDate?: boolean;
}) {
  const [fullEmailOpen, setFullEmailOpen] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [suggestingName, setSuggestingName] = useState(false);

  // Sugiere un nombre de campaña con IA según los productos seleccionados.
  const suggestName = async () => {
    const items = products.map((p) => ({ name: p.name, price: p.price }));
    if (!items.length) return;
    setSuggestingName(true);
    try {
      const res = await campaignsService.suggestName({ products: items, prompt });
      if (res?.name) setCampaignName(res.name);
    } catch {
      /* silencioso: el usuario siempre puede escribir el nombre */
    } finally {
      setSuggestingName(false);
    }
  };

  // Al entrar al paso, si aún no hay nombre, se sugiere uno automáticamente.
  useEffect(() => {
    if (!campaignName.trim()) void suggestName();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mientras la IA genera, se oculta el resto y solo se muestra este aviso.
  if (generating) {
    return (
      <div className="flex flex-col h-full items-center justify-center p-10 text-center">
        <div className="relative w-20 h-20">
          <div className="absolute inset-0 rounded-full border-4 border-amber-200 animate-ping" />
          <div className="w-20 h-20 rounded-full bg-amber-400 flex items-center justify-center">
            <Sparkles size={28} className="text-white" />
          </div>
        </div>
        <p className="mt-6 text-lg font-bold text-gray-900">Espera un momento mientras se generan las recomendaciones para tu campaña</p>
        <p className="mt-2 text-sm text-gray-500">Analizando tono, público y canal</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        {!generated ? (
          <div className="p-6 max-w-2xl mx-auto">
            <h2 className="text-xl font-bold text-gray-900 mb-1">Describe tu campaña</h2>
            <p className="text-sm text-gray-500 mb-6">La IA generará un mensaje para <strong>WhatsApp, Email y SMS</strong>; abajo eliges cuáles quedarán activos.</p>

            {/* Products reminder */}
            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 mb-5">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-12 h-12 rounded-xl overflow-hidden bg-white shrink-0 flex items-center justify-center">
                  {products[0]?.image ? (
                    <img src={products[0].image} alt={products[0].name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-lg">🛒</span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-amber-900 truncate">
                    {products.length === 1 ? products[0].name : `${products.length} productos seleccionados`}
                  </p>
                  <p className="text-xs text-amber-700 truncate">
                    {products.map((p) => p.name).join(", ")}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {products.map((p) => (
                  <span key={p.id} className="text-[10px] font-semibold bg-white/70 border border-amber-200 text-amber-800 px-2 py-0.5 rounded-full truncate max-w-50">
                    {fmt(p.price)} · {p.name}
                  </span>
                ))}
              </div>
            </div>

            {/* Nombre de la campaña (sugerido con IA) */}
            <div className="mb-5">
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Nombre de la campaña</label>
              <div className="flex gap-2">
                <input
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  disabled={suggestingName}
                  placeholder="Ej: Semana del café Colcafé"
                  className="flex-1 min-w-0 px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-300 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
                />
                <button
                  type="button"
                  onClick={() => void suggestName()}
                  disabled={suggestingName}
                  title="Sugerir un nombre con IA según los productos"
                  className="flex items-center gap-1.5 px-3 py-2.5 text-xs font-bold text-amber-900 bg-amber-400 hover:bg-amber-500 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                >
                  {suggestingName ? <RefreshCw size={13} className="animate-spin" /> : <Sparkles size={13} />}
                  {suggestingName ? "Generando…" : "Sugerir nombre de campaña"}
                </button>
              </div>
              <p className="text-[11px] text-gray-400 mt-1">
                Sugerido por IA según los productos. Puedes editarlo.
              </p>
            </div>

            {/* Canales objetivo */}
            <div className="mb-5">
              <label className="block text-xs font-semibold text-gray-600 mb-2">Canales objetivo</label>
              <div className="flex gap-2">
                {(Object.entries(CHANNEL_CFG) as [string, typeof CHANNEL_CFG[keyof typeof CHANNEL_CFG]][]).map(([key, cfg]) => {
                  const on = !!channels[key];
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => onToggleChannel(key)}
                      aria-pressed={on}
                      className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl border-2 text-xs font-semibold transition-all ${
                        on
                          ? `${cfg.bg} text-white border-transparent shadow-sm`
                          : "border-gray-200 text-gray-400 bg-white hover:border-gray-300"
                      }`}
                    >
                      <cfg.icon size={14} />
                      {cfg.label}
                      <CheckCircle size={12} className={on ? "" : "invisible"} />
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-gray-400 mt-2">
                Se genera contenido para los 3 canales; los que desactives quedarán deshabilitados en la vista previa y no se enviarán.
              </p>
            </div>

            {/* Prompt */}
            <div className="mb-6">
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">¿De qué trata la promoción?</label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={4}
                placeholder="Ej: lanza un descuento por lanzamiento con un tono joven y urgente, enfocado en familias jóvenes de Medellín..."
                className="w-full px-4 py-3 text-sm border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-amber-300 resize-none placeholder-gray-300"
              />
            </div>

            {genError && (
              <div className="mb-4 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                ⚠ {genError}
              </div>
            )}
          </div>
        ) : (
          /* Generated previews */
          <div className="p-6">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-7 h-7 rounded-full bg-green-500 flex items-center justify-center shrink-0">
                <CheckCircle size={14} className="text-white" />
              </div>
              <div>
                <p className="text-sm font-bold text-gray-900">Contenido generado para tus canales</p>
                <p className="text-xs text-gray-400">La IA redactó un mensaje por canal. Revísalos y usa <strong>Editar texto</strong> o <strong>Editar imagen</strong> para ajustarlos antes de continuar.</p>
              </div>
              <button
                onClick={onGenerate}
                className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-600 transition-colors shrink-0"
              >
                <RefreshCw size={12} /> Regenerar
              </button>
            </div>

            {/* Canal prioritario de envío: si el destinatario tiene varios
                canales disponibles recibe UN solo mensaje, por este canal. */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-5 rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3">
              <div className="flex items-center gap-2">
                <Zap size={14} className="text-amber-500" />
                <p className="text-xs font-bold text-gray-800">Envío prioritario</p>
                <p className="text-[11px] text-gray-500">Si el cliente tiene varios canales autorizados, se priorizará sólo el que selecciones.</p>
              </div>
              <div className="flex gap-1.5">
                {CHANNEL_ORDER.filter((k) => channels[k]).map((k) => {
                  const cfg = CHANNEL_CFG[k];
                  const active = priorityChannel === k;
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => onPriorityChange(k)}
                      title={`Enviar por ${cfg.label} como canal prioritario`}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border-2 text-[11px] font-semibold transition-all ${
                        active
                          ? "border-amber-400 bg-white shadow-sm text-gray-900"
                          : "border-transparent text-gray-500 hover:bg-white/70"
                      }`}
                    >
                      <span className={`w-4 h-4 rounded flex items-center justify-center shrink-0 ${cfg.bg}`}>
                        <cfg.icon size={9} className="text-white" />
                      </span>
                      {cfg.label}
                      {active && <CheckCircle size={11} className="text-amber-500" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4 items-start sm:grid-cols-2 lg:grid-cols-3">
              <div className={`flex flex-col ${!channels.wa ? "opacity-45" : ""}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-green-500 flex items-center justify-center">
                        <MessageCircle size={12} className="text-white" />
                      </div>
                      <span className="text-xs font-bold text-gray-700">WhatsApp</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                      <button
                        onClick={() => onToggleEdit("wa")}
                        disabled={!channels.wa}
                        className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${editableWa ? "bg-violet-500 text-white hover:bg-violet-600" : "bg-violet-100 text-violet-700 hover:bg-violet-200"}`}
                      >
                        <Edit3 size={9} /> {editableWa ? "Listo" : "Editar"}
                      </button>
                      <ChannelSwitch active={!!channels.wa} onToggle={() => onToggleChannel("wa")} />
                    </div>
                  </div>
                  <div className="h-80">
                    {content?.whatsapp ? (
                      <WhatsAppPreview text={content.whatsapp} editable={editableWa} onEdit={onEditWa} />
                    ) : (
                      <div className="h-full flex items-center justify-center bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl text-xs text-gray-400 px-4 text-center">
                        No generado para este canal
                      </div>
                    )}
                  </div>
                </div>

              <div className={`flex flex-col ${!channels.email ? "opacity-45" : ""}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-blue-500 flex items-center justify-center">
                        <Mail size={12} className="text-white" />
                      </div>
                      <span className="text-xs font-bold text-gray-700">Email</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                      <button
                        onClick={onOpenDesigner}
                        disabled={!channels.email}
                        className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Palette size={9} /> Editar imagen
                      </button>
                      <button
                        onClick={() => onToggleEdit("email")}
                        disabled={!channels.email}
                        className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${editableEmail ? "bg-violet-500 text-white hover:bg-violet-600" : "bg-violet-100 text-violet-700 hover:bg-violet-200"}`}
                      >
                        <Edit3 size={9} /> {editableEmail ? "Listo" : "Editar texto"}
                      </button>
                      {emailHtml && (
                        <button
                          onClick={() => setFullEmailOpen(true)}
                          disabled={!channels.email}
                          title="Ver correo completo"
                          className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Maximize2 size={9} /> Ver
                        </button>
                      )}
                      <ChannelSwitch active={!!channels.email} onToggle={() => onToggleChannel("email")} />
                    </div>
                  </div>
                  <div className={emailHtml ? "" : "h-80"}>
                    {content?.email.subject || content?.email.body ? (
                      <EmailPreview
                        subject={content.email.subject}
                        body={content.email.body}
                        editableBody={editableEmail}
                        onEditSubject={onEditEmailSubject}
                        onEditBody={onEditEmailBody}
                        html={emailHtml}
                      />
                    ) : (
                      <div className="h-full flex items-center justify-center bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl text-xs text-gray-400 px-4 text-center">
                        No generado para este canal
                      </div>
                    )}
                  </div>
                </div>

              <div className={`flex flex-col ${!channels.sms ? "opacity-45" : ""}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-purple-500 flex items-center justify-center">
                        <Smartphone size={12} className="text-white" />
                      </div>
                      <span className="text-xs font-bold text-gray-700">SMS</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                      <button
                        onClick={() => onToggleEdit("sms")}
                        disabled={!channels.sms}
                        className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${editableSms ? "bg-violet-500 text-white hover:bg-violet-600" : "bg-violet-100 text-violet-700 hover:bg-violet-200"}`}
                      >
                        <Edit3 size={9} /> {editableSms ? "Listo" : "Editar"}
                      </button>
                      <ChannelSwitch active={!!channels.sms} onToggle={() => onToggleChannel("sms")} />
                    </div>
                  </div>
                  <div className="h-80">
                    {content?.sms ? (
                      <SmsPreview text={content.sms} editable={editableSms} onEdit={onEditSms} />
                    ) : (
                      <div className="h-full flex items-center justify-center bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl text-xs text-gray-400 px-4 text-center">
                        No generado para este canal
                      </div>
                    )}
                  </div>
                </div>
            </div>
          </div>
        )}
      </div>

      <div className="shrink-0 px-6 py-2.5 border-t border-gray-200 bg-white flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-2 px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">
          <ChevronLeft size={15} /> Atrás
        </button>
        <div className="flex items-center gap-2">
          {generated ? (
            <>
              <button
                onClick={() => setTestOpen(true)}
                title="Enviar una campaña de prueba a un celular o correo"
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-colors"
              >
                <Send size={15} /> Enviar prueba
              </button>
              <button
                onClick={onNext}
                title={
                  reviewUpToDate
                    ? "La revisión ya está lista con estos productos (no se vuelve a segmentar)"
                    : "Se ejecutará la segmentación del público al revisar"
                }
                className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold bg-amber-400 text-amber-900 hover:bg-amber-500 rounded-xl transition-all"
              >
                {reviewUpToDate ? (
                  <>Siguiente <ArrowRight size={15} /></>
                ) : (
                  <>Público objetivo <ArrowRight size={15} /></>
                )}
              </button>
            </>
          ) : (
            <button
              onClick={onGenerate}
              disabled={!prompt.trim()}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold bg-amber-400 text-amber-900 hover:bg-amber-500 rounded-xl transition-all shadow-md hover:shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Sparkles size={15} /> Generar Campaña
            </button>
          )}
        </div>
      </div>

      {/* Modal: correo completo */}
      {fullEmailOpen && emailHtml && (
        <EmailFullPreviewModal
          html={emailHtml}
          onClose={() => setFullEmailOpen(false)}
          actions={
            <button
              onClick={() => {
                setFullEmailOpen(false);
                onOpenDesigner();
              }}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors"
            >
              <Palette size={12} /> Editar imagen
            </button>
          }
        />
      )}
      {/* Modal: enviar campaña de prueba */}
      {testOpen && (
        <TestSendModal
          content={content}
          defaultChannel={priorityChannel}
          onClose={() => setTestOpen(false)}
        />
      )}
    </div>
  );
}

/* ─── Modal: enviar campaña de prueba ─────────────── */
function TestSendModal({
  content,
  defaultChannel,
  onClose,
}: {
  content: GeneratedContent | null;
  defaultChannel: keyof typeof CHANNEL_CFG;
  onClose: () => void;
}) {
  const [channel, setChannel] = useState<keyof typeof CHANNEL_CFG>(defaultChannel);
  const [prefix, setPrefix] = useState(DEFAULT_PHONE_PREFIX);
  const [dest, setDest] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const generatedFor = (k: keyof typeof CHANNEL_CFG): string => {
    if (k === "wa") return content?.whatsapp ?? "";
    if (k === "email") {
      const subject = content?.email?.subject ?? "";
      const body = content?.email?.body ?? "";
      return subject ? `${subject}\n\n${body}` : body;
    }
    return content?.sms ?? "";
  };

  // Al cambiar de canal se recarga el mensaje con el contenido generado de ese canal.
  useEffect(() => {
    setMessage(generatedFor(channel));
    setResult(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel]);

  // La alerta de resultado se cierra sola a los pocos segundos.
  useEffect(() => {
    if (!result) return;
    const t = setTimeout(() => setResult(null), 4500);
    return () => clearTimeout(t);
  }, [result]);

  const isEmail = channel === "email";

  const handleSend = async () => {
    setResult(null);
    const phone = buildInternationalPhone(prefix.dial, dest);
    if (isEmail ? !dest.trim() : phone.length < 7 || phone.length > 15) {
      setResult({
        ok: false,
        text: isEmail
          ? "Escribe el correo destinatario."
          : "Número inválido: digita el celular sin el prefijo (se agrega automáticamente).",
      });
      return;
    }
    if (!message.trim()) {
      setResult({ ok: false, text: "El mensaje no puede estar vacío." });
      return;
    }
    setSending(true);
    try {
      // Por ahora solo está conectado el servicio de SMS (localhost:8015).
      if (channel !== "sms") {
        throw new Error(
          `El envío de prueba por ${CHANNEL_CFG[channel].label} aún no está conectado. Por ahora solo funciona SMS.`,
        );
      }
      const res = await fetch(`${SMS_TEST_API_URL}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.replace(/\D/g, ""), message }),
      });
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const d = data as { detail?: unknown; message?: unknown } | null;
        const detail = d?.detail ?? d?.message;
        throw new Error(
          typeof detail === "string"
            ? detail
            : detail
              ? JSON.stringify(detail)
              : `El servicio de SMS respondió HTTP ${res.status}.`,
        );
      }
      // El proveedor echoa el número y su confirmación; la mostramos tal cual
      // (así queda claro cómo viajó el número y con qué id lo aceptó).
      const prov = (data as {
        results?: { phone?: string }[];
        provider_response?: { message?: string; data?: { id_sms?: number }[] };
      } | null)?.provider_response;
      const sentPhone =
        (data as { results?: { phone?: string }[] } | null)?.results?.[0]?.phone ?? phone;
      const smsId = prov?.data?.[0]?.id_sms;
      setResult({
        ok: true,
        text: prov?.message
          ? `SMS enviado a ${sentPhone} · ${prov.message}${smsId ? ` (id ${smsId})` : ""}`
          : `SMS enviado a ${sentPhone}.`,
      });
    } catch (e) {
      setResult({ ok: false, text: e instanceof Error ? e.message : "No se pudo enviar la prueba." });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm cursor-pointer" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <Send size={17} className="text-amber-600" />
            <h3 className="text-lg font-bold text-gray-900">Enviar campaña de prueba</h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Canal */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-2">Canal</label>
            <div className="flex gap-2">
              {CHANNEL_ORDER.map((k) => {
                const cfg = CHANNEL_CFG[k];
                const on = channel === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setChannel(k)}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border-2 text-xs font-semibold transition-all ${
                      on
                        ? `${cfg.bg} text-white border-transparent shadow-sm`
                        : "border-gray-200 text-gray-500 hover:border-gray-300"
                    }`}
                  >
                    <cfg.icon size={14} />
                    {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Destinatario */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              {isEmail ? "Correo destinatario" : "Número de celular"}
            </label>
            {isEmail ? (
              <input
                value={dest}
                onChange={(e) => setDest(e.target.value)}
                type="email"
                placeholder="correo@ejemplo.com"
                className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-300"
              />
            ) : (
              <>
                <div className="flex gap-2">
                  <div className="relative shrink-0">
                    <select
                      value={prefix.code}
                      onChange={(e) =>
                        setPrefix(
                          getPhonePrefixes().find((p) => p.code === e.target.value) ?? DEFAULT_PHONE_PREFIX,
                        )
                      }
                      title="Prefijo del país"
                      aria-label="Prefijo del país"
                      className="appearance-none h-full pl-3 pr-8 py-2.5 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-amber-300 cursor-pointer"
                    >
                      {getPhonePrefixes().map((p) => (
                        <option key={p.code} value={p.code} title={p.name}>
                          +{p.dial}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      size={14}
                      className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400"
                    />
                  </div>
                  <input
                    value={dest}
                    onChange={(e) => setDest(e.target.value)}
                    type="tel"
                    inputMode="numeric"
                    placeholder="3001234567"
                    className="flex-1 min-w-0 px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-300"
                  />
                </div>
                <p className="text-[11px] text-gray-400 mt-1">
                  Se enviará como +{buildInternationalPhone(prefix.dial, dest)} (solo dígitos).
                </p>
              </>
            )}
          </div>

          {/* Mensaje */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Mensaje</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              placeholder="Texto que se enviará en la prueba…"
              className="w-full px-4 py-3 text-sm border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-amber-300 resize-none"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              Precargado con el contenido generado para el canal. Puedes editarlo.
            </p>
            {channel === "sms" && /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|co|net|org|shop|io|app)\b)/i.test(message) && (
              <p className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
                ⚠ El proveedor de SMS bloquea los mensajes con enlaces. Quita la URL para que llegue.
              </p>
            )}
          </div>
        </div>

        <div className="shrink-0 px-6 py-3 border-t border-gray-100 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={sending}
            className="px-4 py-2 text-xs font-bold text-gray-500 hover:bg-gray-100 rounded-xl transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={() => void handleSend()}
            disabled={sending}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-amber-900 bg-amber-400 hover:bg-amber-500 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send size={13} /> {sending ? "Enviando…" : "Enviar prueba"}
          </button>
        </div>
      </div>

      {/* Alerta flotante del resultado (se cierra sola a los pocos segundos) */}
      {result && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[90] w-full max-w-md px-4 pointer-events-none">
          <div
            className={`animate-alert-pop pointer-events-auto flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold shadow-2xl ${
              result.ok
                ? "bg-green-50 border-green-200 text-green-800"
                : "bg-red-50 border-red-200 text-red-800"
            }`}
          >
            <span className="text-base leading-none pt-0.5">{result.ok ? "✓" : "⚠"}</span>
            <span className="min-w-0 flex-1 leading-snug">{result.text}</span>
            <button
              onClick={() => setResult(null)}
              aria-label="Cerrar alerta"
              className="shrink-0 w-5 h-5 flex items-center justify-center rounded-full hover:bg-black/5 transition-colors"
            >
              <X size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
const EXPLAIN_SEEN_KEY = "mercaldas-analytics-explain-seen";
// Modal "Lanza una campaña en 3 pasos": se abre solo la primera vez que se
// entra a la pantalla de Campañas (queda marcado en localStorage).
const HOW_IT_WORKS_SEEN_KEY = "mercaldas-analytics-howitworks-seen";
// Preferencia de vista del listado de campañas: tarjetas (grid) o tabla.
const CAMPAIGNS_VIEW_KEY = "mercaldas-analytics-campaigns-view";
type CampaignsView = "grid" | "table";

function AudienceStep({
  products,
  channels,
  onBack,
  onContinue,
  mode,
  segKey,
  active,
  onSegmented,
  audSource,
  onAudSourceChange,
  audMix,
  onAudMixChange,
  manualF,
}: {
  products: Product[];
  channels: Record<string, boolean>;
  onBack: () => void;
  onContinue: (chosen: { count: number | null; label: string }) => void;
  mode: "multi" | "bundle";
  /** Clave de la segmentación (productos+modo): si no cambia, no se re-segmenta. */
  segKey: string;
  /** El paso "Público objetivo" está visible. Oculta no lanza segmentaciones. */
  active: boolean;
  /** Avisa al wizard que la segmentación quedó lista para esta segKey. */
  onSegmented: () => void;
  audSource: "auto" | "manual";
  onAudSourceChange: (v: "auto" | "manual") => void;
  audMix: boolean;
  onAudMixChange: (v: boolean) => void;
  manualF: ReturnType<typeof useManualFilters>;
}) {
  // Previsualización de la segmentación (analytics / clustering-api) vía SSE.
  // Se ejecuta una sola vez por combinación de productos+modo: si vuelves al
  // paso sin cambiar nada, se conserva el resultado y NO se vuelve a segmentar.
  const [seg, setSeg] = useState<SegmentPreviewResult | null>(null);
  const [segLoading, setSegLoading] = useState(true);
  const [segStage, setSegStage] = useState<{ message: string; progress: number }>({
    message: "Analizando el comportamiento de compra de los clientes…",
    progress: 3,
  });
  const [segError, setSegError] = useState<string | null>(null);
  const segRunKeyRef = useRef<string>("");
  // Pestaña del panel de público objetivo (recomendados / segmentación manual).
  const [audTab, setAudTab] = useState<"seg" | "all">("seg");
  // Modal de filtros (lo abre el botón "Definir con filtros" del bloque manual).
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Aviso al intentar continuar en manual sin filtros aplicados.
  const [noFiltersPrompt, setNoFiltersPrompt] = useState(false);
  // Botón "¿Cómo se escogieron los clientes?": el borde animado se apaga la
  // primera vez que se abre el modal (queda marcado en localStorage).
  const [explainOpen, setExplainOpen] = useState(false);
  // Botón "¿Cómo se escogieron los clientes?": parpadea al entrar al paso con
  // la animación de brillo y se apaga la primera vez que se abre el modal
  // (queda marcado en localStorage).
  const [explainSeen, setExplainSeen] = useState(() => {
    try {
      return localStorage.getItem(EXPLAIN_SEEN_KEY) === "1";
    } catch {
      return false;
    }
  });
  const openExplain = () => {
    if (!explainSeen) {
      setExplainSeen(true);
      try {
        localStorage.setItem(EXPLAIN_SEEN_KEY, "1");
      } catch {
        /* localStorage no disponible */
      }
    }
    setExplainOpen(true);
  };
  // Total de clientes que cumplen los filtros manuales: lo reporta el
  // panel cada vez que puntúa y alimenta el contador.
  const [manualTotal, setManualTotal] = useState<number | null>(null);
  // Manuales que NO están en la recomendación por producto: el panel los
  // reporta aparte (score restando `excludeCedulas`) para que al elegir
  // "Sumarlos a la recomendación" no se cuenten dos veces los repetidos.
  const [mixTotal, setMixTotal] = useState<number | null>(null);

  // Cédulas de la recomendación actual: se restan del conteo manual en el
  // modo mezcla (dedupe de clientes repetidos entre recomendación y filtros).
  const recCedulas = useMemo(() => {
    const list: string[] = [];
    const seen = new Set<string>();
    for (const r of seg?.recipients ?? []) {
      if (r.cedula && !seen.has(r.cedula)) {
        seen.add(r.cedula);
        list.push(r.cedula);
      }
    }
    return list;
  }, [seg]);

  useEffect(() => {
    const ids = products.map((p) => p.id).filter((x): x is number => x != null);
    if (!ids.length) {
      setSegError("La campaña no tiene productos seleccionados");
      setSegLoading(false);
      return;
    }
    // Paso oculto (volviste a Generar Campaña): no lanzar ni relanzar.
    if (!active) return;
    // Ya segmentamos exactamente esta combinación de productos/modo.
    if (segRunKeyRef.current === segKey && seg) {
      setSegLoading(false);
      return;
    }
    setSegLoading(true);
    setSegError(null);
    setSegStage({ message: "Conectando con el servicio de segmentación…", progress: 2 });
    const es = campaignsService.segmentPreviewStream(
      ids,
      {
        onStage: (s) => setSegStage(s),
        onResult: (r) => {
          segRunKeyRef.current = segKey;
          setSeg(r);
          setSegLoading(false);
          onSegmented();
        },
        onError: (msg) => {
          setSegError(msg);
          setSegLoading(false);
        },
      },
      mode,
    );
    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segKey, active]);

  // En segmentación manual no corre el SSE: la audiencia queda lista en cuanto
  // se abre (los filtros viven en el wizard y se aplican al enviar).
  useEffect(() => {
    if (audSource === "manual") onSegmented();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audSource]);

  // El panel refleja la decisión: en Manual muestra la lista de los filtrados
  // (o la mezcla si se elige "Sumar"); en Recomendada muestra el segmento.
  useEffect(() => {
    setAudTab(audSource === "auto" ? "seg" : "all");
  }, [audSource]);

  const totalReach = seg?.total ?? ESTIMATED_AUDIENCE;
  // Universo total de clientes analizado (suma de todos los segmentos).
  const totalPool = (seg?.ranking ?? []).reduce((a, r) => a + r.total, 0);

  const scored = (seg?.recipients ?? []).filter((r) => r.propensity != null);
  const uplifted = (seg?.recipients ?? []).filter((r) => r.uplift != null);
  const explainCtx: ExplainContext | null = seg
    ? {
        mode: seg.mode ?? "multi",
        productNames: products.map((p) => p.name),
        categories: seg.categories ?? [],
        ranking: seg.ranking ?? [],
        bestSegment: seg.segment,
        segmentTotal: seg.segmentTotal,
        total: seg.total,
        buyers: seg.buyers,
        note: seg.note,
        bundleFallback: seg.bundleFallback,
        avgPropensity: scored.length
          ? scored.reduce((a, r) => a + (r.propensity ?? 0), 0) / scored.length
          : null,
        avgUplift: uplifted.length
          ? uplifted.reduce((a, r) => a + (r.uplift ?? 0), 0) / uplifted.length
          : null,
      }
    : null;

  // Público objetivo si se elige "Sumarlos a la recomendación": la
  // recomendación (seg.total) + los manuales que NO ya están recomendados
  // (mixTotal). Cada cliente se cuenta una sola vez (sin repetidos). Si la
  // recomendación no tiene clientes que restar (recCedulas vacío), el total
  // es simplemente el de los manuales.
  const sumarTotal =
    seg && !segError
      ? mixTotal != null
        ? seg.total + mixTotal
        : recCedulas.length === 0 && manualTotal != null
          ? manualTotal
          : null
      : manualTotal;

  const handleContinue = () => {
    const autoCount = seg?.total ?? null;
    let count: number | null;
    let label: string;
    if (audSource === "auto") {
      count = autoCount;
      label = "Recomendada por producto";
    } else if (audMix) {
      count = sumarTotal;
      label = "Recomendada + manual";
    } else {
      count = manualTotal;
      label = "Manual (filtros)";
    }
    onContinue({ count, label });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-xl font-bold text-gray-900 mb-1">Público objetivo</h2>
          <p className="text-sm text-gray-500 mb-4">
            Elige quién recibirá la campaña: la recomendación por producto o una segmentación manual con filtros.
          </p>

          {explainCtx && (
            <button
              onClick={openExplain}
              title="¿Cómo se escogieron los clientes?"
              className={`mb-5 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-400 to-orange-400 px-3.5 py-2 text-[11px] font-bold text-amber-950 shadow-sm transition-all hover:shadow-md hover:scale-105 active:scale-95 ${explainSeen ? "" : "animate-btn-shine"}`}
            >
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/85 text-[10px] font-black">?</span>
              ¿Cómo se escogieron los clientes?
            </button>
          )}

          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm mb-4">
            <div className="space-y-3">
              {/* Selector de origen del público */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-sm text-gray-600">Público objetivo</span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => onAudSourceChange("auto")}
                    title="El sistema elige el mejor segmento según los productos seleccionados"
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-bold rounded-xl border-2 transition-all cursor-pointer ${
                      audSource === "auto"
                        ? "border-blue-300 bg-blue-50 text-blue-800 shadow-sm"
                        : "border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-600"
                    }`}
                  >
                    <Sparkles size={12} /> Recomendada
                  </button>
                  <button
                    onClick={() => onAudSourceChange("manual")}
                    title="Elige tú los clientes por filtros (ubicación, género, edad, perfil de compra…)"
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-bold rounded-xl border-2 transition-all cursor-pointer ${
                      audSource === "manual"
                        ? "border-amber-400 bg-amber-50 text-amber-900 shadow-sm"
                        : "border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-600"
                    }`}
                  >
                    <SlidersHorizontal size={12} /> Manual
                  </button>
                </div>
              </div>

              {audSource === "auto" ? (
                <>
                  <div className="flex items-center justify-between gap-2 rounded-xl border border-gray-100 bg-gray-50/70 px-3 py-2">
                    {segLoading ? (
                      <span className="text-xs text-gray-400">segmentando…</span>
                    ) : segError ? (
                      <span className="text-xs font-bold text-red-600">—</span>
                    ) : (
                      <span className="text-xs font-bold text-gray-800">
                        {seg
                          ? `Seleccionados ${seg.total.toLocaleString()} clientes${totalPool > 0 ? ` de ${totalPool.toLocaleString()} en total` : ""}`
                          : `${totalReach.toLocaleString()} clientes`}
                      </span>
                    )}
                  </div>
                  {segError && (
                    <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                      ⚠ No se pudo ejecutar la segmentación: {segError}
                    </p>
                  )}
                  {seg && !segError && (
                    <div className="space-y-1">
                      <p className="text-[11px] text-gray-400">
                        {seg.mode === "bundle" ? "🧩 Combo (van juntos)" : "🏷️ Descuento (independientes)"} · Segmento {seg.segment} · {seg.buyers.toLocaleString()} clientes con afinidad a los productos
                      </p>
                      {seg.note && <p className="text-[11px] text-gray-500">{seg.note}</p>}
                      {seg.bundleFallback && (
                        <p className="text-[11px] text-amber-600">⚠ La co-compra de estos productos es casi nula; se usaron sus categorías como respaldo.</p>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2.5 space-y-2.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-xs font-semibold text-amber-900">
                      {manualF.hasFilters
                        ? `${countActiveFilters(manualF.snapshot)} filtro${countActiveFilters(manualF.snapshot) !== 1 ? "s" : ""} activo${countActiveFilters(manualF.snapshot) !== 1 ? "s" : ""}`
                        : "Sin filtros definidos todavía"}
                    </p>
                    <button
                      onClick={() => {
                        setAudTab("all");
                        setFiltersOpen(true);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-amber-900 bg-amber-400 hover:bg-amber-500 rounded-lg transition-colors shadow-sm shrink-0"
                      title="Abre los filtros para definir la segmentación manual"
                    >
                      <SlidersHorizontal size={12} />
                      {manualF.hasFilters ? "Editar segmentación" : "Seleccione los clientes para la segmentación"}
                    </button>
                  </div>

                  {manualF.hasFilters && (
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div
                        className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 shadow-sm"
                        style={{ background: "#FFF200" }}
                      >
                        {manualTotal != null ? (
                          <span className="text-sm font-black text-[#1A1A2E] leading-tight">
                            {manualTotal.toLocaleString()}{" "}
                            <span className="font-semibold text-[#1A1A2E]/70">
                              cliente{manualTotal !== 1 ? "s" : ""} con esas características
                            </span>
                          </span>
                        ) : (
                          <span className="text-xs font-bold text-[#1A1A2E]">Aún sin calcular</span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Combinar con la recomendación o reemplazarla: cada opción
                      muestra cuántos clientes quedarán como público objetivo. */}
                  <div className="space-y-1.5 text-[11px]">
                    <label
                      className={`flex items-center gap-2 rounded-xl border px-3 py-2 cursor-pointer select-none transition-all ${
                        audMix
                          ? "border-amber-400 bg-amber-50 shadow-sm"
                          : "border-gray-200 bg-white hover:border-gray-300"
                      }`}
                    >
                      <input
                        type="radio"
                        name="wizard-aud-mix"
                        checked={audMix}
                        onChange={() => onAudMixChange(true)}
                        className="accent-amber-500 w-3.5 h-3.5 shrink-0"
                      />
                      <span className="flex-1 min-w-0 text-gray-700">
                        Sumarlos a la recomendación
                        {seg && !segError && mixTotal != null && manualTotal != null && (
                          <span className="block text-[10px] text-gray-400">
                            {seg.total.toLocaleString()} recomendados + {mixTotal.toLocaleString()} manuales{" "}
                            que no estaban recomendados
                          </span>
                        )}
                      </span>
                      {sumarTotal != null ? (
                        <span className="shrink-0 px-2 py-0.5 rounded-full bg-amber-400 text-amber-900 text-[10px] font-black whitespace-nowrap">
                          {sumarTotal.toLocaleString()} clientes
                        </span>
                      ) : (
                        <span className="shrink-0 text-[10px] text-gray-400">Sin calcular</span>
                      )}
                    </label>
                    <label
                      className={`flex items-center gap-2 rounded-xl border px-3 py-2 cursor-pointer select-none transition-all ${
                        !audMix
                          ? "border-amber-400 bg-amber-50 shadow-sm"
                          : "border-gray-200 bg-white hover:border-gray-300"
                      }`}
                    >
                      <input
                        type="radio"
                        name="wizard-aud-mix"
                        checked={!audMix}
                        onChange={() => onAudMixChange(false)}
                        className="accent-amber-500 w-3.5 h-3.5 shrink-0"
                      />
                      <span className="flex-1 min-w-0 text-gray-700">
                        Reemplazar la recomendación por estos clientes
                      </span>
                      {manualTotal != null ? (
                        <span className="shrink-0 px-2 py-0.5 rounded-full bg-amber-400 text-amber-900 text-[10px] font-black whitespace-nowrap">
                          {manualTotal.toLocaleString()} clientes
                        </span>
                      ) : (
                        <span className="shrink-0 text-[10px] text-gray-400">Sin calcular</span>
                      )}
                    </label>
                  </div>
                  {!manualF.hasFilters && (
                    <p className="text-[11px] text-amber-700">
                      Define los filtros para elegir los clientes de la campaña, o vuelve a la recomendación por producto.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Panel embebido (antes era un modal): pestañas Recomendados / Manual. */}
          <div className="h-[62vh] min-h-[420px]">
            <RecipientsModal
              inline
              title="Público objetivo"
              subtitle={
                audTab === "seg"
                  ? `Recomendación por producto${seg ? ` · ${seg.total.toLocaleString()} clientes` : ""}`
                  : `${products.map((p) => p.name).join(", ") || "Campaña nueva"} · define tu audiencia con filtros`
              }
              recipients={seg?.recipients}
              controlledTab={audTab}
              onTabChange={setAudTab}
              filtersHook={manualF}
              onTotalLive={(t) => setManualTotal(t)}
              onMixTotalLive={setMixTotal}
              excludeCedulas={recCedulas}
              externalFiltersOpen={filtersOpen}
              onCloseExternalFilters={() => setFiltersOpen(false)}
              mixRecommended={audSource === "manual" && audMix}
            />
          </div>
        </div>
      </div>

      <div className="shrink-0 px-6 py-2.5 border-t border-gray-200 bg-white flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-2 px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">
          <ChevronLeft size={15} /> Atrás
        </button>
        <button
          onClick={() => {
            if (audSource === "manual" && !manualF.hasFilters) setNoFiltersPrompt(true);
            else handleContinue();
          }}
          disabled={audSource === "auto" && segLoading}
          className="flex items-center gap-2 px-6 py-3 text-sm font-bold bg-amber-400 text-amber-900 hover:bg-amber-500 rounded-xl transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Siguiente <ArrowRight size={15} />
        </button>
      </div>

      {/* Aviso: en manual sin filtros, antes de continuar a revisión */}
      {noFiltersPrompt && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm cursor-pointer"
            onClick={() => setNoFiltersPrompt(false)}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-start gap-3">
              <span className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <SlidersHorizontal size={18} />
              </span>
              <div>
                <h3 className="text-base font-bold text-gray-900">Aún no has aplicado filtros</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Elegiste segmentación manual pero no definiste filtros. Aplica filtros para elegir los clientes,
                  o continúa sólo con los clientes recomendados por producto.
                </p>
              </div>
            </div>
            <div className="mt-5 flex flex-col gap-2">
              <button
                onClick={() => {
                  setNoFiltersPrompt(false);
                  setFiltersOpen(true);
                }}
                className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-bold bg-amber-400 text-amber-900 hover:bg-amber-500 rounded-xl transition-colors"
              >
                <SlidersHorizontal size={14} /> Aplicar filtros
              </button>
              <button
                onClick={() => {
                  setNoFiltersPrompt(false);
                  onAudSourceChange("auto");
                  onContinue({ count: seg?.total ?? null, label: "Recomendada por producto" });
                }}
                className="px-4 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 rounded-xl transition-colors"
              >
                Continuar sólo con los recomendados
              </button>
              <button
                onClick={() => setNoFiltersPrompt(false)}
                className="px-4 py-2 text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {explainOpen && explainCtx && (
        <ExplainModal ctx={explainCtx} onClose={() => setExplainOpen(false)} />
      )}

      {/* ── Pantalla de carga de la segmentación (solo si el público elegido es la recomendada) ── */}
      {segLoading && audSource === "auto" && (
        <div className="fixed inset-0 z-60 bg-white/95 backdrop-blur-sm flex flex-col items-center justify-center px-6">
          <div className="w-16 h-16 rounded-2xl bg-amber-400 flex items-center justify-center shadow-lg animate-pulse">
            <RefreshCw size={28} className="text-amber-900 animate-spin" />
          </div>
          <h3 className="mt-6 text-lg font-bold text-gray-900 text-center">Trabajando en la segmentación…</h3>
          <p className="mt-2 text-sm text-gray-500 text-center max-w-sm">{segStage.message}</p>
          <div className="mt-6 w-64 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-400 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(segStage.progress, 99)}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-gray-400 font-semibold">{Math.round(segStage.progress)}%</p>
        </div>
      )}
    </div>
  );
}

/* ─── Step 4: Revisar y Enviar ─────────────────── */
function ReviewStep({
  products,
  channels,
  priorityChannel,
  onSend,
  onSaveDraft,
  savingDraft,
  onBack,
  sent,
  sending,
  sendError,
  sentAudience,
  chosen,
}: {
  products: Product[];
  channels: Record<string, boolean>;
  priorityChannel: keyof typeof CHANNEL_CFG;
  onSend: () => void;
  onSaveDraft: () => void;
  savingDraft: boolean;
  onBack: () => void;
  sent: boolean;
  sending: boolean;
  sendError: string | null;
  /** Nº real de mensajes en cola devuelto por el backend al lanzar. */
  sentAudience: number | null;
  chosen: { count: number | null; label: string };
}) {
  const [scheduled, setScheduled] = useState(false);
  const activeChannels = Object.entries(channels).filter(([, v]) => v).map(([k]) => k);
  const displayAudience = sentAudience ?? chosen.count ?? 0;

  if (sent) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-10 text-center">
        <div className="w-24 h-24 rounded-full bg-green-100 flex items-center justify-center mb-6 animate-bounce">
          <CheckCircle size={44} className="text-green-500" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">¡Campaña lanzada! 🎉</h2>
        <p className="text-gray-500 mb-1">
          <strong className="text-gray-800">{displayAudience.toLocaleString()} mensajes</strong> están en cola de envío.
        </p>
        <p className="text-sm text-gray-400 mb-2">
          Canales: {activeChannels.map((c) => CHANNEL_CFG[c as keyof typeof CHANNEL_CFG].label).join(", ")} · Envío prioritario: {CHANNEL_CFG[priorityChannel].label}
        </p>
        <p className="text-xs text-gray-300">
          La campaña quedó en el listado; desde allí puedes ver su público y su historial.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-xl mx-auto">
          <h2 className="text-xl font-bold text-gray-900 mb-1">Revisa tu campaña</h2>
          <p className="text-sm text-gray-500 mb-6">Todo listo. Confirma los detalles y decide cuándo enviar.</p>

          {/* Summary card */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm mb-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Resumen</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl overflow-hidden bg-gray-100 shrink-0 flex items-center justify-center">
                  {products[0]?.image ? (
                    <img src={products[0].image} alt={products[0].name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-base">🛒</span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">
                    {products.length === 1 ? products[0].name : `${products.length} productos`}
                  </p>
                  <p className="text-xs text-gray-400 truncate">
                    {products.map((p) => p.name).join(", ")}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between py-2 border-t border-gray-100">
                <span className="text-sm text-gray-600">Público objetivo</span>
                <div className="text-right">
                  <span className="inline-block text-[11px] font-bold text-gray-500 mb-0.5">{chosen.label}</span>
                  <p className="text-sm font-bold text-gray-900">
                    {chosen.count != null ? `${chosen.count.toLocaleString()} clientes` : "—"}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between py-2 border-t border-gray-100">
                <span className="text-sm text-gray-600">Canales</span>
                <div className="flex gap-1.5">
                  {activeChannels.map((c) => {
                    const cfg = CHANNEL_CFG[c as keyof typeof CHANNEL_CFG];
                    return (
                      <span key={c} className={`text-[10px] font-bold text-white px-2 py-0.5 rounded-full ${cfg.bg}`}>
                        {cfg.label}
                      </span>
                    );
                  })}
                </div>
              </div>
              <div className="flex items-center justify-between py-2 border-t border-gray-100">
                <span className="text-sm text-gray-600">Envío prioritario</span>
                <div className="flex items-center gap-1.5">
                  {(() => {
                    const cfg = CHANNEL_CFG[priorityChannel];
                    return (
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold text-white px-2 py-0.5 rounded-full ${cfg.bg}`}>
                        <Zap size={9} /> {cfg.label}
                      </span>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>

          {/* Schedule option */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm mb-6">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-gray-800">¿Cuándo enviar?</p>
              <div className="flex items-center bg-gray-100 rounded-xl p-1">
                <button onClick={() => setScheduled(false)} className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${!scheduled ? "bg-white shadow-sm text-gray-800" : "text-gray-500"}`}>Ahora</button>
                <button onClick={() => setScheduled(true)} className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${scheduled ? "bg-white shadow-sm text-gray-800" : "text-gray-500"}`}>Programar</button>
              </div>
            </div>
            {scheduled ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Fecha</label>
                  <input type="date" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-300" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Hora</label>
                  <input type="time" defaultValue="09:00" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-300" />
                </div>
              </div>
            ) : (
              <p className="text-xs text-gray-400">La campaña se enviará inmediatamente al confirmar.</p>
            )}
          </div>
        </div>
      </div>

      <div className="shrink-0 px-6 py-2.5 border-t border-gray-200 bg-white flex items-center justify-between gap-3">
        <button onClick={onBack} className="flex items-center gap-2 px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors shrink-0">
          <ChevronLeft size={15} /> Atrás
        </button>
        {sendError && (
          <p className="flex-1 min-w-0 mx-4 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-2">
            ⚠ {sendError}
          </p>
        )}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onSaveDraft}
            disabled={sending || savingDraft}
            className="flex items-center gap-2 px-4 py-3 text-sm font-bold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 hover:border-gray-300 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {savingDraft ? (
              <RefreshCw size={15} className="animate-spin" />
            ) : (
              <Save size={15} />
            )}
            {savingDraft ? "Guardando…" : "Guardar borrador"}
          </button>
          <button
            onClick={onSend}
            disabled={sending || savingDraft}
            className="flex items-center gap-2.5 px-6 py-3 text-sm font-bold bg-amber-400 text-amber-900 hover:bg-amber-500 rounded-xl transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send size={15} /> {sending ? "Creando campaña…" : scheduled ? "Programar Campaña" : "Enviar Ahora"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Step progress bar (clicable) ──────────────── */
function StepBar({
  step,
  canGo,
  onGo,
}: {
  step: Step;
  /** Qué pasos pueden recibir clic (según lo que falte por completar). */
  canGo: Record<Step, boolean>;
  onGo: (s: Step) => void;
}) {
  const steps: { n: Step; label: string }[] = [
    { n: 1, label: "Seleccionar Producto" },
    { n: 2, label: "Generar Campaña" },
    { n: 3, label: "Público Objetivo" },
    { n: 4, label: "Revisar y Enviar" },
  ];
  return (
    <div className="flex items-center gap-0 px-6 py-3 border-b border-gray-100 bg-white shrink-0">
      {steps.map((s, i) => {
        const current = step === s.n;
        const done = step > s.n;
        const allowed = canGo[s.n];
        const clickable = allowed && !current;
        return (
          <div key={s.n} className="flex items-center flex-1 last:flex-none">
            <button
              type="button"
              onClick={() => clickable && onGo(s.n)}
              disabled={!clickable}
              title={
                current
                  ? undefined
                  : allowed
                    ? `Ir a "${s.label}"`
                    : s.n === 2
                      ? "Selecciona al menos un producto para continuar"
                      : s.n === 3
                        ? "Genera el contenido de la campaña para continuar"
                        : "Define el público objetivo para continuar"
              }
              className={`group flex items-center gap-2.5 text-left rounded-lg ${
                clickable ? "cursor-pointer" : "cursor-default"
              }`}
            >
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all shrink-0 ${
                  done
                    ? "bg-green-500 text-white"
                    : current
                      ? "bg-amber-400 text-amber-900"
                      : allowed
                        ? "bg-gray-200 text-gray-500 group-hover:bg-amber-200 group-hover:text-amber-800"
                        : "bg-gray-100 text-gray-300"
                }`}
              >
                {done ? <CheckCircle size={14} /> : s.n}
              </div>
              <span
                className={`text-xs font-semibold ${
                  current
                    ? "text-gray-900"
                    : allowed
                      ? "text-gray-500 group-hover:text-gray-800"
                      : "text-gray-300"
                }`}
              >
                {s.label}
              </span>
            </button>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-px mx-4 ${step > s.n ? "bg-green-400" : "bg-gray-200"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Modal: cargar productos por PLU desde archivo ──────── */
function ImportPluModal({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (products: Product[]) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PluFileImportResult | null>(null);

  const pick = (f: File | undefined | null) => {
    if (!f) return;
    setFile(f);
    setError(null);
    setResult(null);
    setLoading(true);
    catalogService
      .importProductsFromFile(f)
      .then(setResult)
      .catch((e) =>
        setError(e instanceof Error ? e.message : "No se pudo leer el archivo"),
      )
      .finally(() => setLoading(false));
  };

  const matchedCount = result?.matched.length ?? 0;

  return (
    <div
      className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/40 cursor-pointer"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-2xl flex flex-col max-h-[85vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div>
            <p className="font-bold text-gray-900 text-sm">Cargar productos por PLU</p>
            <p className="text-[11px] text-gray-400 mt-0.5">
              JSON, CSV, XLSX o XLS · el archivo debe traer el PLU en una columna llamada PLU / código
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {!result && !loading && (
            <label className="block cursor-pointer border-2 border-dashed border-gray-200 hover:border-amber-300 rounded-2xl p-8 text-center transition-colors">
              <input
                type="file"
                accept=".json,.csv,.xls,.xlsx,application/json,text/csv"
                className="hidden"
                onChange={(e) => pick(e.target.files?.[0])}
              />
              <Upload className="mx-auto mb-2 text-gray-300" size={28} />
              <p className="text-sm font-semibold text-gray-700 mb-1">
                {file ? file.name : "Haz clic para elegir un archivo"}
              </p>
              <p className="text-xs text-gray-400">
                Cada fila indica un PLU. Se validan contra el catálogo y solo se agregan los que existen.
              </p>
            </label>
          )}

          {loading && (
            <div className="py-10 text-center">
              <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-gray-500">Leyendo archivo y validando PLUs…</p>
            </div>
          )}

          {error && !loading && (
            <div className="text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-3">
              ⚠ {error}
            </div>
          )}

          {result && !loading && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <span className="text-[11px] font-bold text-gray-600 bg-gray-100 px-2.5 py-1 rounded-full">
                  {result.total} fila{result.total !== 1 ? "s" : ""} leída{result.total !== 1 ? "s" : ""}
                </span>
                <span className="text-[11px] font-bold text-green-700 bg-green-50 border border-green-200 px-2.5 py-1 rounded-full">
                  ✓ {matchedCount} encontrado{matchedCount !== 1 ? "s" : ""}
                </span>
                {result.duplicates > 0 && (
                  <span className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
                    {result.duplicates} duplicado{result.duplicates !== 1 ? "s" : ""} omitido{result.duplicates !== 1 ? "s" : ""}
                  </span>
                )}
                {result.missing.length > 0 && (
                  <span className="text-[11px] font-bold text-red-700 bg-red-50 border border-red-200 px-2.5 py-1 rounded-full">
                    ✗ {result.missing.length} no existe
                    {result.missing.length !== 1 ? "n" : ""} en el catálogo
                  </span>
                )}
              </div>

              {matchedCount > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-600 mb-2">
                    Productos que se agregarán a la campaña
                  </p>
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {result.matched.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center gap-3 bg-gray-50 border border-gray-100 rounded-xl p-2.5"
                      >
                        <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-200 flex items-center justify-center shrink-0">
                          {p.image ? (
                            <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-base">🛒</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-800 truncate">{p.name}</p>
                          <p className="text-xs text-gray-400 truncate">
                            {p.category || "Catálogo Mercaldas"}
                            {p.brandName ? ` · ${p.brandName}` : ""}
                          </p>
                        </div>
                        <span className="shrink-0 text-[10px] font-bold bg-white border border-gray-200 text-gray-500 px-2 py-0.5 rounded-md">
                          PLU {p.plu}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {result.missing.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-600 mb-2">
                    No encontrados en el catálogo ({result.missing.length})
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {result.missing.map((plu) => (
                      <span
                        key={plu}
                        className="text-[10px] font-semibold text-red-600 bg-red-50 border border-red-100 px-2 py-0.5 rounded-md"
                      >
                        {plu}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="shrink-0 px-5 py-3 border-t border-gray-100 bg-white flex items-center justify-between gap-3">
          {result && !loading ? (
            <button
              onClick={() => {
                setResult(null);
                setFile(null);
              }}
              className="text-xs font-semibold text-gray-500 hover:text-gray-700 transition-colors"
            >
              Elegir otro archivo
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2 ml-auto">
            {!result && (
              <button
                onClick={onClose}
                className="px-4 py-2 text-xs font-bold text-gray-600 hover:text-gray-800 transition-colors"
              >
                Cancelar
              </button>
            )}
            <button
              onClick={() => onAdd(result?.matched ?? [])}
              disabled={loading || !result || matchedCount === 0}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-amber-400 text-amber-900 hover:bg-amber-500 rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ShoppingBag size={12} />
              {matchedCount > 0
                ? `Agregar ${matchedCount} producto${matchedCount !== 1 ? "s" : ""} a la campaña`
                : "Agregar productos"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Wizard overlay ────────────────────────────── */
function CampaignWizard({ onClose, onCreated }: { onClose: () => void; onCreated: (c: CampaignCardData) => void }) {
  const [step, setStep] = useState<Step>(1);
  const [selectedProducts, setSelectedProducts] = useState<Product[]>([]);
  const [channels, setChannels] = useState<Record<string, boolean>>({ wa: true, email: true, sms: true });
  // Canal prioritario de envío: el destinatario recibe un solo mensaje por él.
  // Por defecto whatsapp → email → sms (según el orden de activación).
  const [priorityChannel, setPriorityChannel] = useState<keyof typeof CHANNEL_CFG>("wa");
  // Modal de carga de productos por PLU (archivo JSON/CSV/XLSX).
  const [importOpen, setImportOpen] = useState(false);
  const [mode, setMode] = useState<"multi" | "bundle">("multi");
  const [prompt, setPrompt] = useState("");
  // Nombre de la campaña (sugerido por IA en el paso 2, editable).
  const [campaignName, setCampaignName] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [content, setContent] = useState<GeneratedContent | null>(null);
  const [editableWa, setEditableWa] = useState(false);
  const [editableEmail, setEditableEmail] = useState(false);
  const [editableSms, setEditableSms] = useState(false);
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [emailDesignOpen, setEmailDesignOpen] = useState(false);
  const [emailBlocks, setEmailBlocks] = useState<EmailBlock[] | null>(null);
  const [emailHtml, setEmailHtml] = useState<string | null>(null);

  // ── Audiencia / segmentación ──
  // El paso "Público objetivo" corre la segmentación una sola vez por
  // combinación de productos+modo: si vas atrás y vuelves sin cambios, se
  // conserva el resultado (botón "Siguiente"). Si cambias productos/modo, se
  // re-segmenta al volver (botón "Público objetivo").
  const segKey = `${mode}|${selectedProducts.map((p) => p.id).sort((a, b) => a - b).join(",")}`;
  const [visitedAudience, setVisitedAudience] = useState(false);
  const [reviewedSegKey, setReviewedSegKey] = useState<string | null>(null);
  const audienceUpToDate = visitedAudience && reviewedSegKey === segKey;
  const goToAudience = () => {
    setVisitedAudience(true);
    setStep(3);
  };

  // ── Origen del público objetivo al lanzar la campaña ──
  // 'auto' → recomendación por producto · 'manual' → filtros manuales
  // (con audMix = sumar los manuales a la recomendación en lugar de reemplazar).
  const [audSource, setAudSource] = useState<"auto" | "manual">("auto");
  const [audMix, setAudMix] = useState(true);
  const manualF = useManualFilters();
  // Nº real de destinatarios que quedaron en cola (lo devuelve el backend al
  // lanzar; alimenta la vista de éxito de la revisión).
  const [sentAudience, setSentAudience] = useState<number | null>(null);
  // Público elegido en el paso "Público objetivo" para mostrarlo en la revisión.
  const [audienceChosen, setAudienceChosen] = useState<{ count: number | null; label: string }>({
    count: null,
    label: "Recomendada por producto",
  });

  const toggleChannel = (c: string) =>
    setChannels((prev) => {
      // Nunca desactivar el último canal activo (mínimo uno siempre).
      if (prev[c] && Object.values(prev).filter(Boolean).length === 1) return prev;
      return { ...prev, [c]: !prev[c] };
    });

  // Si el canal prioritario se desactiva, cae al siguiente activo en el orden
  // por defecto (whatsapp → email → sms); si se reactiva otro, no cambia solo.
  useEffect(() => {
    setPriorityChannel((prev) => {
      if (channels[prev]) return prev;
      return CHANNEL_ORDER.find((k) => channels[k]) ?? "wa";
    });
  }, [channels]);

  const toggleProduct = (p: Product) =>
    setSelectedProducts((prev) =>
      prev.some((s) => s.id === p.id)
        ? prev.filter((s) => s.id !== p.id)
        : [...prev, p],
    );

  const activeChannelKeys = () =>
    (Object.keys(channels) as (keyof typeof CHANNEL_CFG)[]).filter((k) => channels[k]);

  const handleGenerate = async () => {
    if (!selectedProducts.length) return;
    const primary = selectedProducts[0];
    setGenerating(true);
    setGenerated(false);
    setGenError(null);
    try {
      const res = await campaignsService.generateContent({
        productId: primary.id,
        productName: primary.name,
        price: primary.price,
        products: selectedProducts.map((p) => ({
          id: p.id,
          name: p.name,
          price: p.price,
        })),
        prompt,
        // Siempre se generan los 3 canales: los desactivados quedan visibles y
        // deshabilitados en la vista previa (y no se envían).
        channels: CHANNEL_ORDER.map((k) => CHANNEL_TO_API[k]),
      });
      if (res.error) throw new Error(res.error);

      const email = res.email;
      // Conserva el contenido de canales desactivados al regenerar: solo se
      // sobreescribe lo que la IA devolvió para los canales activos.
      setContent((c) => ({
        whatsapp: res.whatsapp ?? c?.whatsapp ?? "",
        email: {
          subject: email?.asunto ?? c?.email?.subject ?? "",
          body: email?.bloques?.length ? blocksToText(email.bloques) : c?.email?.body ?? "",
        },
        sms: res.sms ?? c?.sms ?? "",
      }));
      if (email?.bloques?.length) {
        const blocks = withRealProductImage(email.bloques as unknown as EmailBlock[], primary.image);
        setEmailBlocks(blocks);
        // Reconstruye el HTML desde los bloques corregidos (así la preview y el
        // correo guardado usan la imagen real, no la que inventó la IA).
        setEmailHtml(blocksToHtml(blocks));
      }
      setGenerated(true);
    } catch (e) {
      setGenError(e instanceof Error ? e.message : "Error generando el contenido");
    } finally {
      setGenerating(false);
    }
  };

  // Construye y persiste el registro de la campaña (mensajes, productos y
  // canales). La usan tanto el envío como "Guardar borrador".
  const createCampaignRecord = async () => {
    const primary = selectedProducts[0];
    const messages: {
      channel: CampaignChannel;
      subject?: string;
      content?: string;
      html?: string;
      emailBlocks?: unknown;
    }[] = [];
    if (channels.wa && content?.whatsapp) {
      messages.push({ channel: "whatsapp", content: content.whatsapp });
    }
    if (channels.email && content) {
      messages.push({
        channel: "email",
        subject: content.email.subject,
        content: content.email.body,
        html: emailHtml ?? undefined,
        emailBlocks: emailBlocks ?? undefined,
      });
    }
    if (channels.sms && content?.sms) {
      messages.push({ channel: "sms", content: content.sms });
    }

    return campaignsService.create({
      name:
        campaignName.trim() ||
        prompt.slice(0, 60) ||
        `Campaña ${primary.name}${selectedProducts.length > 1 ? ` +${selectedProducts.length - 1}` : ""}`,
      productId: primary.id,
      productIds: selectedProducts.map((p) => p.id),
      prompt,
      mode,
      channels: activeChannelKeys().map((k) => CHANNEL_TO_API[k]),
      priorityChannel: CHANNEL_TO_API[priorityChannel],
      messages,
    });
  };

  // Guarda la campaña como borrador (queda persistida en la base de datos).
  const handleSaveDraft = async () => {
    if (!selectedProducts.length || !content) return;
    setSavingDraft(true);
    setSendError(null);
    try {
      const created = await createCampaignRecord();
      onCreated(apiToCard(created));
      onClose();
    } catch (e) {
      setSendError(e instanceof Error ? e.message : "Error guardando el borrador");
    } finally {
      setSavingDraft(false);
    }
  };

  const handleSend = async () => {
    if (!selectedProducts.length || !content) return;
    setSending(true);
    setSendError(null);
    try {
      const created = await createCampaignRecord();

      let card: CampaignCardData;
      if (audSource === "auto") {
        // Recomendación de clientes (segmentación vía clustering-api según el modo).
        const gen = await campaignsService
          .generateRecipients(created.id, 100000, undefined, undefined, mode)
          .catch(() => null);
        card = apiToCard(created);
        if (gen) card.audience = gen.total;
      } else {
        // Segmentación manual: los clientes que cumplen los filtros definidos.
        if (!manualF.hasFilters) {
          throw new Error(
            "Para enviar con segmentación manual define al menos un filtro (o vuelve a la recomendación por producto).",
          );
        }
        const updated = await campaignsService.applyAudience(
          created.id,
          audMix ? "mixed" : "manual",
          { filters: manualF.buildFilters() },
        );
        card = apiToCard(updated);
      }

      setSentAudience(card.audience);
      setSent(true);
      onCreated(card);
      setTimeout(onClose, 1800);
    } catch (e) {
      setSendError(e instanceof Error ? e.message : "Error creando la campaña");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-(--app-bg)">
      {/* Topbar */}
      <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-amber-400 flex items-center justify-center">
            <Zap size={15} className="text-amber-900" />
          </div>
          <p className="font-bold text-gray-900 text-sm">Nueva campaña</p>
        </div>
        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
          <X size={16} />
        </button>
      </div>

      <StepBar
        step={step}
        canGo={{
          1: true,
          2: selectedProducts.length > 0,
          3: selectedProducts.length > 0 && generated,
          4: false,
        }}
        onGo={(s) => {
          if (s === step) return;
          if (s === 1) setStep(1);
          else if (s === 2 && selectedProducts.length > 0) setStep(2);
          else if (s === 3 && selectedProducts.length > 0 && generated) goToAudience();
        }}
      />

      <div className="flex-1 overflow-hidden flex flex-col">
        {step === 1 && (
          <Step1
            selectedProducts={selectedProducts}
            onToggle={toggleProduct}
            onClear={() => setSelectedProducts([])}
            channels={channels}
            onNext={() => setStep(2)}
            onOpenImport={() => setImportOpen(true)}
          />
        )}
        {step === 2 && selectedProducts.length > 0 && (
          <Step2
            products={selectedProducts}
            channels={channels}
            priorityChannel={priorityChannel}
            onPriorityChange={(k) => setPriorityChannel(k)}
            prompt={prompt}
            setPrompt={setPrompt}
            campaignName={campaignName}
            setCampaignName={setCampaignName}
            generating={generating}
            generated={generated}
            content={content}
            editableWa={editableWa}
            editableEmail={editableEmail}
            editableSms={editableSms}
            onGenerate={handleGenerate}
            onEditWa={(t) => setContent((c) => c ? { ...c, whatsapp: t } : c)}
            onEditEmailSubject={(s) => setContent((c) => c ? { ...c, email: { ...c.email, subject: s } } : c)}
            onEditEmailBody={(b) => setContent((c) => c ? { ...c, email: { ...c.email, body: b } } : c)}
            onEditSms={(t) => setContent((c) => c ? { ...c, sms: t } : c)}
            onToggleEdit={(ch) => {
              if (ch === "wa") setEditableWa((e) => !e);
              if (ch === "email") setEditableEmail((e) => !e);
              if (ch === "sms") setEditableSms((e) => !e);
            }}
            onOpenDesigner={() => setEmailDesignOpen(true)}
            emailHtml={emailHtml}
            genError={genError}
            onNext={goToAudience}
            onBack={() => setStep(1)}
            onToggleChannel={toggleChannel}
            reviewUpToDate={audienceUpToDate}
          />
        )}
        {/* El paso "Público objetivo" queda montado (oculto) una vez visitado
            para no re-segmentar si vuelves sin cambiar los productos. */}
        {(step === 3 || visitedAudience) && selectedProducts.length > 0 && (
          <div
            className={
              step === 3
                ? "flex-1 overflow-hidden flex flex-col"
                : "hidden"
            }
          >
            <AudienceStep
              products={selectedProducts}
              channels={channels}
              onBack={() => setStep(2)}
              onContinue={(chosen) => {
                setAudienceChosen(chosen);
                setStep(4);
              }}
              mode={mode}
              segKey={segKey}
              active={step === 3}
              onSegmented={() => setReviewedSegKey(segKey)}
              audSource={audSource}
              onAudSourceChange={setAudSource}
              audMix={audMix}
              onAudMixChange={setAudMix}
              manualF={manualF}
            />
          </div>
        )}
        {step === 4 && selectedProducts.length > 0 && (
          <ReviewStep
            products={selectedProducts}
            channels={channels}
            priorityChannel={priorityChannel}
            onSend={handleSend}
            onSaveDraft={handleSaveDraft}
            savingDraft={savingDraft}
            onBack={() => setStep(3)}
            sent={sent}
            sending={sending}
            sendError={sendError}
            sentAudience={sentAudience}
            chosen={audienceChosen}
          />
        )}
      </div>

      {/* Footer institucional (mismo del panel, fondo blanco y letra negra) */}
      <footer className="shrink-0 bg-white border-t border-gray-100">
        <div className="flex flex-col md:flex-row items-center justify-center gap-x-3 gap-y-0.75 px-3 py-1.5 text-center">
          <a
            href="https://dsi.com.co"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center hover:opacity-80 transition-opacity"
          >
            <img src={footerLogo} alt="Mercaldas" className="h-3 w-auto object-contain" />
          </a>
          <p className="text-[9px]" style={{ color: "rgba(0,0,0,0.65)" }}>
            © 2026 Desarrollado por <span className="font-bold text-black/80">DSI SA</span> · Todos los derechos reservados
          </p>
          <p className="text-[9px]" style={{ color: "rgba(0,0,0,0.45)" }}>
            Manizales, Caldas, Colombia
          </p>
        </div>
      </footer>

      {/* Diseñador de correo (drag & drop) */}
      {emailDesignOpen && (
        <EmailEditor
          initialBlocks={
            emailBlocks ??
            (selectedProducts.length > 0 && content
              ? buildEmailBlocks(selectedProducts[0], content)
              : defaultTemplate())
          }
          onSave={(blocks, html) => {
            setEmailBlocks(blocks);
            setEmailHtml(html);
            setContent((c) =>
              c ? { ...c, email: { ...c.email, body: blocksToText(blocks) } } : c,
            );
            setEmailDesignOpen(false);
          }}
          onClose={() => setEmailDesignOpen(false)}
        />
      )}

      {/* Modal: cargar productos por PLU desde un archivo */}
      {importOpen && (
        <ImportPluModal
          onClose={() => setImportOpen(false)}
          onAdd={(list) => {
            if (!list.length) return;
            setSelectedProducts((prev) => {
              const byId = new Map(prev.map((p) => [p.id, p] as const));
              for (const p of list) byId.set(p.id, p);
              return [...byId.values()];
            });
            setImportOpen(false);
          }}
        />
      )}
    </div>
  );
}

/* ─── Modal de clientes segmentados ──────────────── */
type SegClientRow = {
  id: number | string;
  cedula?: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  status?: string;
  segment?: number | null;
  frecuencia?: number | null;
  monetario?: number | null;
  ticketPromedio?: number | null;
  categoriasDistintas?: number | null;
  propensity?: number | null;
  uplift?: number | null;
  percentile?: number | null;
};

function scoreColor(p: number): string {
  if (p >= 0.8) return "bg-green-100 text-green-700";
  if (p >= 0.6) return "bg-amber-100 text-amber-700";
  return "bg-gray-100 text-gray-600";
}

/** Formatea un promedio: enteros con separador de miles; decimales si es < 100. */
const fmt1 = (v: number) => (v >= 100 ? Math.round(v).toLocaleString() : v.toFixed(1));
/** Formatea un monto promedio en unidades (sin decimales). */
const fmtMoney = (v: number) => Math.round(v).toLocaleString();

/* ─── Tabla unificada de clientes ────────────────── */
// Misma presentación para cualquier listado de clientes (recomendados por
// producto, segmentación manual o destinatarios): cabeceras descriptivas con
// un tooltip que explica cada columna al pasar el cursor.

type ClientTableRow = {
  key: string;
  name: string | null;
  /** Línea secundaria bajo el nombre (cédula · email · teléfono). */
  sub?: string | null;
  frecuencia?: number | null;
  monetario?: number | null;
  ticketPromedio?: number | null;
  categorias?: number | null;
  propensity?: number | null;
  status?: string | null;
};

const CLIENT_COLUMNS: { label: string; help: string; numeric?: boolean; wide?: boolean }[] = [
  { label: "Cliente", help: "Nombre del cliente con su documento o datos de contacto.", wide: true },
  { label: "Frecuencia de compra", help: "Número de compras que el cliente ha realizado en la historia registrada.", numeric: true },
  { label: "Monetario (gasto total)", help: "Total acumulado (en COP) de todo lo que el cliente ha gastado en la tienda.", numeric: true },
  { label: "Ticket promedio", help: "Valor promedio (en COP) que el cliente gasta en cada compra.", numeric: true },
  { label: "Categorías distintas", help: "Cuántas categorías de productos diferentes ha comprado el cliente.", numeric: true },
  { label: "Probabilidad de compra", help: "Probabilidad estimada (modelo XGBoost) de que el cliente compre si recibe la campaña.", numeric: true },
];

/** Convierte una fila puntuada (clustering + score) a la fila de la tabla. */
function scoredToTableRow(c: ScoredClient): ClientTableRow {
  return {
    key: c.cedula,
    name: c.name,
    sub: c.cedula,
    frecuencia: c.features.frecuencia,
    monetario: c.features.monetario,
    ticketPromedio: c.features.ticket_promedio,
    categorias: c.features.categorias_distintas,
    propensity: c.propensity,
  };
}

/** Tabla de clientes con cabeceras descriptivas y tooltip por columna.
 *  `selectable` agrega un checkbox por fila (para segmentación manual fina).
 *  `showStatus` muestra la columna "Estado del envío" cuando las filas la traen. */
function ClientDataTable({
  rows,
  selectable,
  showStatus = false,
}: {
  rows: ClientTableRow[];
  selectable?: {
    allSelected: boolean;
    onToggleAll: () => void;
    isSelected: (key: string) => boolean;
    onToggle: (key: string) => void;
  };
  showStatus?: boolean;
}) {
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);

  const hasStatus = showStatus && rows.some((r) => Boolean(r.status));

  const showTip = (e: React.MouseEvent<HTMLTableCellElement>, text: string) => {
    const r = e.currentTarget.getBoundingClientRect();
    const W = 250;
    const x = Math.min(Math.max(r.left + r.width / 2 - W / 2, 10), window.innerWidth - W - 10);
    const H = 74;
    const y = r.bottom + 8 + H > window.innerHeight ? Math.max(8, r.top - H - 8) : r.bottom + 8;
    setTip({ x, y, text });
  };

  if (rows.length === 0) {
    return (
      <div className="py-14 text-center">
        <Users size={24} className="text-gray-300 mb-3 mx-auto" />
        <p className="text-sm font-semibold text-gray-700">Sin clientes</p>
      </div>
    );
  }

  const Th = ({
    children,
    help,
    right,
    className = "",
  }: {
    children: React.ReactNode;
    help?: string;
    right?: boolean;
    className?: string;
  }) => (
    <th
      scope="col"
      onMouseEnter={help ? (e) => showTip(e, help) : undefined}
      onMouseLeave={() => help && setTip(null)}
      className={`py-2 pr-3 select-none leading-tight ${right ? "text-right " : ""}${help ? "cursor-help " : ""}${className}`}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {help && (
          <span className="w-3.5 h-3.5 rounded-full bg-gray-200 text-gray-500 text-[9px] font-black flex items-center justify-center">
            ?
          </span>
        )}
      </span>
    </th>
  );

  return (
    <>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[10px] font-bold text-gray-400 uppercase tracking-wide border-b border-gray-100">
            {selectable && (
              <th className="py-2 pr-3 w-8">
                <input
                  type="checkbox"
                  checked={selectable.allSelected}
                  onChange={selectable.onToggleAll}
                  className="accent-amber-500 w-3.5 h-3.5"
                />
              </th>
            )}
            {CLIENT_COLUMNS.map((c) => (
              <Th key={c.label} help={c.help} right={c.numeric} className={c.wide ? "w-52" : ""}>
                {c.label}
              </Th>
            ))}
            {hasStatus && (
              <Th
                help="Estado del mensaje para este cliente dentro de la campaña (pendiente, enviado, fallido…)."
                right
              >
                Estado del envío
              </Th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rows.map((r) => {
            const sel = selectable && selectable.isSelected(r.key);
            return (
              <tr
                key={r.key}
                onClick={selectable ? () => selectable.onToggle(r.key) : undefined}
                className={`transition-colors ${sel ? "bg-amber-50" : "hover:bg-amber-50/40"} ${selectable ? "cursor-pointer" : ""}`}
              >
                {selectable && (
                  <td className="py-2.5 pr-3">
                    <input
                      type="checkbox"
                      checked={Boolean(sel)}
                      onChange={() => selectable.onToggle(r.key)}
                      onClick={(e) => e.stopPropagation()}
                      className="accent-amber-500 w-3.5 h-3.5 shrink-0"
                    />
                  </td>
                )}
                <td className="py-2.5 pr-3">
                  <p className="text-xs font-bold text-gray-900 truncate max-w-52">{r.name ?? "Sin nombre"}</p>
                  {r.sub ? <p className="text-[10px] text-gray-400 truncate max-w-52">{r.sub}</p> : null}
                </td>
                <td className="py-2.5 pr-3 text-right text-xs text-gray-600 whitespace-nowrap">
                  {r.frecuencia != null ? Math.round(r.frecuencia).toLocaleString() : <span className="text-gray-300">—</span>}
                </td>
                <td className="py-2.5 pr-3 text-right text-xs text-gray-600 whitespace-nowrap">
                  {r.monetario != null ? fmtMoney(r.monetario) : <span className="text-gray-300">—</span>}
                </td>
                <td className="py-2.5 pr-3 text-right text-xs text-gray-600 whitespace-nowrap">
                  {r.ticketPromedio != null ? fmtMoney(r.ticketPromedio) : <span className="text-gray-300">—</span>}
                </td>
                <td className="py-2.5 pr-3 text-right text-xs text-gray-600 whitespace-nowrap">
                  {r.categorias != null ? Math.round(r.categorias).toLocaleString() : <span className="text-gray-300">—</span>}
                </td>
                <td className="py-2.5 text-right">
                  {r.propensity != null ? (
                    <span className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${scoreColor(r.propensity)}`}>
                      {Math.round(r.propensity * 100)}%
                    </span>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
                {hasStatus && (
                  <td className="py-2.5 text-right">
                    {r.status ? (
                      <span className="inline-block text-[10px] font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full capitalize whitespace-nowrap">
                        {r.status}
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {tip && (
        <div
          className="fixed z-[95] pointer-events-none rounded-lg bg-gray-900 text-white text-[11px] leading-snug px-3 py-2 shadow-xl"
          style={{ left: tip.x, top: tip.y, width: 250 }}
        >
          {tip.text}
        </div>
      )}
    </>
  );
}

type ExplainContext = {
  mode?: "multi" | "bundle";
  productNames: string[];
  categories: string[];
  ranking: SegmentRankingRow[];
  bestSegment: number;
  segmentTotal: number;
  total: number;
  buyers: number;
  note?: string;
  bundleFallback?: boolean;
  avgPropensity?: number | null;
  avgUplift?: number | null;
};

const EXPLAIN_FEATURES = [
  { key: "frecuencia", label: "Frecuencia de compra" },
  { key: "monetario", label: "Monetario (gasto total)" },
  { key: "ticket_promedio", label: "Ticket promedio" },
  { key: "categorias_distintas", label: "Categorías distintas" },
];

/** Renderiza texto plano convirtiendo **negrita** en <strong> (sin HTML crudo). */
function renderBold(text: string) {
  return text.split("**").map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-bold text-gray-900">{part}</strong>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

function ExplainModal({ ctx, onClose }: { ctx: ExplainContext; onClose: () => void }) {
  const [explanation, setExplanation] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const explain = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await campaignsService.interpretSegment({
        mode: ctx.mode,
        productNames: ctx.productNames,
        categories: ctx.categories,
        bestSegment: ctx.bestSegment,
        ranking: ctx.ranking,
        segmentTotal: ctx.segmentTotal,
        total: ctx.total,
        buyers: ctx.buyers,
        features: EXPLAIN_FEATURES.map((f) => f.key),
        bundleFallback: ctx.bundleFallback,
        note: ctx.note,
        avgPropensity: ctx.avgPropensity ?? undefined,
        avgUplift: ctx.avgUplift ?? undefined,
      });
      setExplanation(res.explicacion);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo interpretar la segmentación");
    } finally {
      setLoading(false);
    }
  };

  // Genera la interpretación con IA automáticamente al abrir el modal.
  useEffect(() => {
    void explain();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sorted = [...ctx.ranking].sort((a, b) => b.share - a.share);
  const totalPool = ctx.ranking.reduce((a, r) => a + r.total, 0);
  const bestRow = ctx.ranking.find((r) => r.segment === ctx.bestSegment);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm cursor-pointer" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="min-w-0 pr-3">
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-gradient-to-br from-amber-400 to-orange-400 text-white flex items-center justify-center text-sm font-black shrink-0 shadow-sm">?</span>
              ¿Cómo se escogieron los clientes?
            </h3>
            <p className="text-sm text-gray-500 mt-0.5">El paso a paso de cómo se eligió este público</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 transition-colors shrink-0">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* Cómo se seleccionaron los clientes */}
          <section>
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Cómo se seleccionaron los clientes</h4>
            <div className="space-y-3 text-sm text-gray-700 leading-relaxed">
              <p>
                La segmentación se realiza en varias etapas. Cada etapa reduce la base de clientes hasta identificar
                aquellos con mayor potencial para la campaña.
              </p>

              <div>
                <p className="font-bold text-gray-900">1. Identificación de tipos de clientes</p>
                <p className="mt-1">
                  Primero se analiza el comportamiento histórico de compra de cada cliente: qué tan frecuentemente compra,
                  cuánto gasta, cuánto suele gastar por compra y qué tan variadas son sus compras.
                </p>
                <p className="mt-1">
                  Con esta información, el sistema <strong>agrupa automáticamente a los clientes que tienen comportamientos similares</strong>.
                  Se generan 6 grupos diferentes. Por ejemplo, un grupo puede estar compuesto principalmente por clientes
                  frecuentes y de alto gasto, mientras otro puede reunir clientes ocasionales y de menor gasto.
                </p>
                <blockquote className="mt-2 border-l-2 border-amber-300 pl-3 text-xs text-gray-500 italic">
                  En esta etapa no se definen manualmente reglas como "si compra más de 10 veces pertenece al grupo A".
                  El sistema identifica los grupos a partir de las similitudes encontradas entre los clientes.
                </blockquote>
              </div>

              <div>
                <p className="font-bold text-gray-900">2. Identificación del grupo más relacionado con la campaña</p>
                <p className="mt-1">Después se analiza cuáles de esos grupos tienen mayor afinidad con los productos que queremos promocionar:</p>
                <ul className="mt-1 list-disc list-inside">
                  {ctx.productNames.map((n) => <li key={n}>{n}</li>)}
                </ul>
                <p className="mt-2">Para cada grupo se calcula qué proporción de sus clientes ya compró productos de esas categorías:</p>
                {sorted.length ? (
                  <div className="mt-2 rounded-xl border border-gray-100 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-[10px] font-bold text-gray-400 uppercase tracking-wide bg-gray-50">
                          <th className="text-left px-3 py-2">Segmento</th>
                          <th className="text-right px-3 py-2">Clientes</th>
                          <th className="text-right px-3 py-2">% que compraron</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {sorted.map((r) => {
                          const best = r.segment === ctx.bestSegment;
                          return (
                            <tr key={r.segment} className={best ? "bg-amber-50" : ""}>
                              <td className="px-3 py-2">
                                <span className="font-bold whitespace-nowrap">
                                  {best ? "⭐ " : ""}Segmento {r.segment}
                                  {best && (
                                    <span className="ml-1.5 text-[10px] font-bold text-amber-700 bg-amber-100 rounded-full px-1.5 py-0.5">elegido</span>
                                  )}
                                </span>
                                {r.means &&
                                  (r.means.frecuencia != null || r.means.monetario != null || r.means.ticket_promedio != null || r.means.categorias_distintas != null) && (
                                    <div className="flex flex-wrap gap-x-2 mt-0.5 text-[10px] font-medium text-gray-500">
                                      {r.means.frecuencia != null && <span>frec {fmt1(r.means.frecuencia)}</span>}
                                      {r.means.monetario != null && <span>gasto {fmtMoney(r.means.monetario)}</span>}
                                      {r.means.ticket_promedio != null && <span>ticket {fmtMoney(r.means.ticket_promedio)}</span>}
                                      {r.means.categorias_distintas != null && <span>{fmt1(r.means.categorias_distintas)} cat.</span>}
                                    </div>
                                  )}
                              </td>
                              <td className="px-3 py-2 text-right">{r.total.toLocaleString()}</td>
                              <td className="px-3 py-2 text-right font-semibold">{(r.share * 100).toFixed(0)}%</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : null}
                {bestRow && (
                  <p className="mt-2">
                    En esta segmentación, el <strong>segmento {ctx.bestSegment}</strong> presenta la mayor concentración de
                    compradores ({(bestRow.share * 100).toFixed(1)}% de sus {ctx.segmentTotal.toLocaleString()} clientes) y, por
                    tanto, es el grupo con mayor afinidad histórica con la campaña.
                  </p>
                )}
              </div>

              <div>
                <p className="font-bold text-gray-900">3. Priorización según probabilidad de compra</p>
                <p className="mt-1">Una vez identificado el grupo de mayor interés, se analiza individualmente a sus clientes.</p>
                <p className="mt-1">
                  El modelo estima, para cada cliente, <strong>qué tan probable es que compre los productos de la campaña</strong>.
                </p>
                <p className="mt-1">
                  Así, en lugar de tratar a todos los clientes del segmento por igual, podemos priorizar aquellos con mayor
                  probabilidad de compra.
                </p>
                <p className="mt-1">
                  Para esta campaña, el criterio es seleccionar <strong>solo clientes con 70% o más de probabilidad de compra</strong>,
                  ordenados de mayor a menor score.
                </p>
              </div>

              <div>
                <p className="font-bold text-gray-900">4. Identificación de quién puede ser influenciado por la campaña</p>
                <p className="mt-1">
                  Finalmente, se estima algo diferente: <strong>si enviar la campaña realmente puede cambiar la decisión del cliente</strong>.
                </p>
                <p className="mt-1">El modelo compara dos escenarios:</p>
                <ul className="list-disc list-inside">
                  <li>qué probabilidad tendría de comprar <strong>si recibe la campaña</strong>;</li>
                  <li>qué probabilidad tendría de comprar <strong>si no la recibe</strong>.</li>
                </ul>
                <p className="mt-1">La diferencia entre ambos escenarios indica el potencial de la campaña para influir en ese cliente.</p>
                <div className="mt-2 space-y-1.5 text-xs">
                  <p className="bg-gray-50 rounded-lg px-3 py-2">
                    Cliente A: 70% de probabilidad con campaña vs. 30% sin campaña →{" "}
                    <strong className="text-green-700">alta oportunidad de persuasión</strong>.
                  </p>
                  <p className="bg-gray-50 rounded-lg px-3 py-2">
                    Cliente B: 95% con campaña vs. 93% sin campaña →{" "}
                    <strong className="text-gray-500">baja oportunidad de persuasión</strong>, porque probablemente compraría de todas formas.
                  </p>
                </div>
                <p className="mt-2">
                  De esta manera, la segmentación no se limita a buscar clientes que compran mucho. Busca identificar{" "}
                  <strong>
                    qué tipo de clientes son más afines al producto, cuáles tienen mayor probabilidad de comprar y,
                    especialmente, en cuáles la campaña puede generar un cambio real en su comportamiento
                  </strong>.
                </p>
              </div>

              {/* Resumen numérico de esta segmentación */}
              <div className="mt-1 space-y-1 rounded-xl bg-gray-50 p-3 text-[11px] text-gray-500">
                <p>
                  👥 Se analizaron <strong className="text-gray-700">{totalPool.toLocaleString()}</strong> clientes en total.
                </p>
                <p>
                  🎯 <strong className="text-gray-700">{ctx.buyers.toLocaleString()} clientes</strong> en toda la base compraron productos de las categorías relacionadas.
                </p>
                {ctx.avgPropensity != null && (
                  <p>
                    📈 <strong className="text-gray-700">Propensión promedio {(ctx.avgPropensity * 100).toFixed(1)}%</strong>: probabilidad estimada de que compren si ven la campaña.
                  </p>
                )}
                {ctx.avgUplift != null && (
                  <p>
                    ⚡ <strong className="text-gray-700">Uplift promedio {ctx.avgUplift >= 0 ? "+" : ""}{ctx.avgUplift.toFixed(3)}</strong>: cuánto aumenta la probabilidad de compra si reciben la campaña.{" "}
                    {ctx.avgUplift < 0
                      ? "Negativo: no son muy persuasibles, comprarían igual aunque no reciban la campaña."
                      : "Positivo: la campaña puede inclinar su decisión de compra."}
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* Interpretación IA */}
          <section>
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Interpretación con IA</h4>
            {loading || (!explanation && !error) ? (
              <div className="flex items-center justify-center gap-2 py-4 text-xs text-gray-400">
                <RefreshCw size={14} className="animate-spin" /> Generando interpretación…
              </div>
            ) : error ? (
              <div className="flex flex-col items-start gap-2">
                <div className="text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">⚠ {error}</div>
                <button
                  onClick={() => void explain()}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-amber-900 bg-amber-400 hover:bg-amber-500 rounded-xl transition-colors"
                >
                  <RefreshCw size={12} /> Reintentar
                </button>
              </div>
            ) : explanation ? (
              <div>
                <div className="text-sm text-gray-700 bg-gray-50 rounded-xl p-4 leading-relaxed">
                  {explanation.split("\n\n").map((p, i) => (
                    <p key={i} className={i > 0 ? "mt-2" : ""}>{renderBold(p)}</p>
                  ))}
                </div>
                <button
                  onClick={() => {
                    setExplanation(null);
                    void explain();
                  }}
                  className="mt-2 text-[11px] text-gray-400 hover:text-gray-600 transition-colors"
                >
                  ↻ Regenerar explicación
                </button>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}

function RecipientsModal({
  title,
  subtitle,
  recipients: preset,
  campaignId,
  onClose,
  audienceMode,
  onAudienceChange,
  initialTab = "seg",
  filtersHook,
  onTotalLive,
  controlledTab,
  onTabChange,
  inline = false,
  externalFiltersOpen = false,
  onCloseExternalFilters,
  mixRecommended = false,
  excludeCedulas,
  onMixTotalLive,
}: {
  title: string;
  subtitle?: string;
  recipients?: {
    name: string | null;
    email: string | null;
    phone: string | null;
    segment?: number;
    propensity?: number | null;
    uplift?: number | null;
    percentile?: number | null;
  }[];
  campaignId?: number;
  onClose?: () => void;
  audienceMode?: "auto" | "manual" | "mixed" | null;
  onAudienceChange?: (
    mode: "auto" | "manual" | "mixed" | null,
    count: number,
  ) => void;
  /** Pestaña inicial (el wizard manual abre directo en "Segmentación manual"). */
  initialTab?: "seg" | "all";
  /** Hook de filtros externo (compartido con el wizard); si no viene, uno propio. */
  filtersHook?: ReturnType<typeof useManualFilters>;
  /** Reporta al padre el total de clientes que cumplen los filtros (en vivo). */
  onTotalLive?: (total: number | null) => void;
  /** Pestaña controlada desde el padre (persistencia del modal en el wizard). */
  controlledTab?: "seg" | "all";
  onTabChange?: (tab: "seg" | "all") => void;
  /** Renderiza como panel embebido (paso "Público objetivo"), sin overlay. */
  inline?: boolean;
  /** Señal externa para abrir el modal de filtros (p. ej. botón "Definir con filtros"). */
  externalFiltersOpen?: boolean;
  onCloseExternalFilters?: () => void;
  /** En la pestaña manual, incluye los recomendados junto a los filtrados
   *  (público "Recomendada + manual"). */
  mixRecommended?: boolean;
  /** Cédulas de la recomendación por producto: se restan del conteo manual
   *  para que "Sumar a la recomendación" no cuente clientes repetidos. */
  excludeCedulas?: string[];
  /** Reporta al padre el total de manuales NUEVOS (filtrados que no están en
   *  `excludeCedulas`), usado por el total de la opción "Sumar". */
  onMixTotalLive?: (total: number | null) => void;
}) {
  // Origen del público actual de la campaña (para campañas ya creadas).
  const [mode, setMode] = useState<"auto" | "manual" | "mixed" | null>(
    audienceMode ?? null,
  );
  // Fuerza recarga de destinatarios tras una acción (reemplazar / añadir / usar recomendada).
  const [tick, setTick] = useState(0);
  const [busyAud, setBusyAud] = useState(false);
  const [audMsg, setAudMsg] = useState<string | null>(null);
  // Pestaña: controlada por el padre si vino `controlledTab`; si no, interna.
  const [internalTab, setInternalTab] = useState<"seg" | "all">(initialTab);
  const tab = controlledTab ?? internalTab;
  const setTab = (t: "seg" | "all") => {
    if (controlledTab !== undefined) onTabChange?.(t);
    else setInternalTab(t);
  };

  const AUD_LABEL: Record<string, string> = {
    auto: "Recomendada por producto",
    manual: "Manual (filtros)",
    mixed: "Recomendada + manual",
  };

  const notifyAudience = (m: "auto" | "manual" | "mixed" | null, count: number) => {
    setMode(m);
    onAudienceChange?.(m, count);
  };

  // Filtros manuales del tab "Todos los clientes" (perfil + RFM).
  const ownF = useManualFilters();
  const f = filtersHook ?? ownF;
  const filtersRef = useRef<NonNullable<ScoreClientsPayload["filters"]>>({});
  filtersRef.current = f.buildFilters();
  const loadedFiltersRef = useRef<string>("");
  const [filterModalOpen, setFilterModalOpen] = useState(false);

  // El padre puede abrir el modal de filtros (botón "Definir con filtros"):
  // se sincroniza con el estado interno para no abrir dos instancias.
  useEffect(() => {
    if (externalFiltersOpen) setFilterModalOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalFiltersOpen]);
  const closeFilters = () => {
    setFilterModalOpen(false);
    onCloseExternalFilters?.();
  };

  // ── Pestaña "Segmentados" (recomendados / destinatarios) ──
  const [recipients, setRecipients] = useState<SegClientRow[]>([]);
  const [loading, setLoading] = useState(campaignId != null && preset == null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  // Lazy-load: se renderizan bloques de PAGE filas; al llegar al final (scroll)
  // se cargan las siguientes. `visible` se reinicia al buscar.
  const PAGE = 50;
  const [visible, setVisible] = useState(PAGE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // ── Pestaña "Todos los clientes" (score sobre la base completa) ──
  // La puntuación corre en el backend (con caché de 5 min) y se pagina por
  // offset de 500: cada página pide su propia tanda al hacer scroll.
  const [allRows, setAllRows] = useState<ScoredClient[]>([]);
  const [allTotal, setAllTotal] = useState<number | null>(null);
  const [allLoading, setAllLoading] = useState(false);
  const [allLoadingMore, setAllLoadingMore] = useState(false);
  const [allError, setAllError] = useState<string | null>(null);
  const allFetchingRef = useRef(false);
  const allSentinelRef = useRef<HTMLDivElement | null>(null);
  // Manuales NUEVOS al "Sumar a la recomendación": puntuación con las cédulas
  // recomendadas excluidas. El backend la resuelve sin volver a puntuar
  // (comparte la caché del score por filtros); aquí solo se pide el total.
  const [mixTotal, setMixTotal] = useState<number | null>(null);
  const excludeKey = useMemo(
    () => JSON.stringify(excludeCedulas ?? null),
    [excludeCedulas],
  );

  const loadAllPage = async (offset: number, append: boolean) => {
    if (allFetchingRef.current) return;
    allFetchingRef.current = true;
    if (append) setAllLoadingMore(true);
    else setAllLoading(true);
    setAllError(null);
    try {
      const res = await campaignsService.scoreClients({
        filters: filtersRef.current,
        sort: "propensity",
        dir: "desc",
        // Páginas de 20: el resto se carga con el scroll (lazy).
        limit: 20,
        offset,
      });
      setAllRows((prev) => (append ? [...prev, ...res.clients] : res.clients));
      setAllTotal(res.total);
      if (!append) loadedFiltersRef.current = JSON.stringify(filtersRef.current);
    } catch (e) {
      if (!append) setAllError(e instanceof Error ? e.message : "No se pudieron puntuar los clientes");
    } finally {
      allFetchingRef.current = false;
      if (append) setAllLoadingMore(false);
      else setAllLoading(false);
    }
  };

  // Al abrir la pestaña "todos" se puntúa desde cero (solo la primera vez).
  // Sin filtros activos no se puntúa toda la base (sería lento e inútil);
  // la vista invita a abrir los filtros de segmentación.
  useEffect(() => {
    if (tab !== "all") return;
    if (!f.hasFilters) return;
    if (allRows.length > 0 || allLoading || allTotal != null) return;
    void loadAllPage(0, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // Al cambiar un filtro (con la pestaña "todos" abierta) se recarga la lista.
  useEffect(() => {
    if (tab !== "all") return;
    const key = JSON.stringify(filtersRef.current);
    if (!f.hasFilters) {
      // Limpió los filtros: sin puntuación de la base completa.
      if (allRows.length || allTotal != null) {
        setAllRows([]);
        setAllTotal(null);
        loadedFiltersRef.current = key;
      }
      return;
    }
    if (key === loadedFiltersRef.current) return;
    const t = setTimeout(() => {
      setAllRows([]);
      setAllTotal(null);
      void loadAllPage(0, false);
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, ...f.deps]);

  // Conteo "sin repetidos" para la opción "Sumar a la recomendación": puntúa
  // los filtros RESTANDO las cédulas ya recomendadas (excludeCedulas).
  useEffect(() => {
    const excl = excludeCedulas ?? [];
    if (!f.hasFilters || !excl.length) {
      setMixTotal(null);
      return;
    }
    setMixTotal(null);
    const t = setTimeout(() => {
      void (async () => {
        try {
          const res = await campaignsService.scoreClients({
            filters: filtersRef.current,
            excludeCedulas: excl,
            limit: 1,
            sort: "propensity",
            dir: "desc",
            offset: 0,
          });
          setMixTotal(res.total);
        } catch {
          setMixTotal(null);
        }
      })();
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.hasFilters, excludeKey, ...f.deps]);

  useEffect(() => {
    setVisible(PAGE);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (preset) {
        setRecipients(preset.map((r, i) => ({ id: i, ...r })));
        setLoading(false);
        return;
      }
      if (campaignId == null) return;
      setLoading(true);
      setError(null);
      try {
        const list = await campaignsService.getRecipients(campaignId);
        if (!cancelled) setRecipients(list);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "No se pudieron cargar los clientes");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [campaignId, preset, tick]);

  // ── Acciones sobre la audiencia de la campaña ──
  const useRecommendedNow = async () => {
    if (!campaignId || busyAud) return;
    setBusyAud(true);
    setAudMsg(null);
    try {
      const c = await campaignsService.useRecommendedAudience(campaignId);
      notifyAudience(c.audienceMode ?? "auto", c.audienceCount);
      setAudMsg(`Público reemplazado por la recomendación por producto (${c.audienceCount.toLocaleString()} clientes).`);
      setTick((t) => t + 1);
    } catch (e) {
      setAudMsg(`⚠ ${e instanceof Error ? e.message : "No se pudo usar la recomendación"}`);
    } finally {
      setBusyAud(false);
    }
  };

  // Añade / reemplaza la audiencia con TODOS los clientes que cumplen los
  // filtros manuales activos (el backend resuelve el conjunto completo:
  // los "clientes con esas características" que muestra el contador).
  const applyManualAudience = async (replace: boolean) => {
    if (!campaignId || busyAud || !f.hasFilters) return;
    setBusyAud(true);
    setAudMsg(null);
    try {
      const payload = { filters: f.buildFilters() };
      if (replace) {
        const c = await campaignsService.replaceManualAudience(campaignId, payload);
        notifyAudience(c.audienceMode ?? "manual", c.audienceCount);
        setAudMsg(
          `Público reemplazado por la segmentación manual: ${c.audienceCount.toLocaleString()} clientes.`,
        );
      } else {
        const c = await campaignsService.addManualRecipients(campaignId, payload);
        notifyAudience(c.audienceMode ?? "mixed", c.audienceCount);
        setAudMsg(
          `Audiencia actualizada: ${c.audienceCount.toLocaleString()} clientes (se añadieron los que cumplen los filtros).`,
        );
      }
      setTick((t) => t + 1);
    } catch (e) {
      setAudMsg(`⚠ ${e instanceof Error ? e.message : "No se pudo actualizar la audiencia"}`);
    } finally {
      setBusyAud(false);
    }
  };

  const q = query.trim().toLowerCase();
  const filtered = recipients.filter((r) =>
    !q ||
    (r.name ?? "").toLowerCase().includes(q) ||
    (r.email ?? "").toLowerCase().includes(q) ||
    (r.phone ?? "").toLowerCase().includes(q),
  );
  const shown = filtered.slice(0, visible);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisible((v) => v + PAGE);
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [filtered.length]);

  const allFiltered = allRows.filter((c) =>
    !q ||
    (c.name ?? "").toLowerCase().includes(q) ||
    c.cedula.includes(q) ||
    (c.email ?? "").toLowerCase().includes(q) ||
    (c.phone ?? "").toLowerCase().includes(q),
  );

  // Reporta al padre el total de clientes que cumplen los filtros (en vivo),
  // para que la revisión del wizard muestre el mismo número del contador.
  useEffect(() => {
    onTotalLive?.(allTotal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTotal]);

  // Ídem para el total de manuales nuevos (dedupe contra los recomendados).
  useEffect(() => {
    onMixTotalLive?.(mixTotal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mixTotal]);

  // Scroll infinito en "todos": pide la siguiente página al llegar al final.
  useEffect(() => {
    const el = allSentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (
          entries[0]?.isIntersecting &&
          !allFetchingRef.current &&
          allTotal != null &&
          allRows.length < allTotal
        ) {
          void loadAllPage(allRows.length, true);
        }
      },
      { rootMargin: "400px" },
    );
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTotal, allRows.length, q]);

  // Convierte una fila de la pestaña "Recomendados / destinatarios" al
  // formato unificado de la tabla (los datos de RFM se muestran si existen).
  const segRowToTable = (r: SegClientRow): ClientTableRow => ({
    key: String(r.id),
    name: r.name,
    sub: r.cedula ?? ([r.email, r.phone].filter(Boolean).join(" · ") || null),
    frecuencia: r.frecuencia ?? null,
    monetario: r.monetario ?? null,
    ticketPromedio: r.ticketPromedio ?? null,
    categorias: r.categoriasDistintas ?? null,
    propensity: r.propensity ?? null,
    status: r.status,
  });

  return (
    <div
      className={
        inline
          ? "h-full flex flex-col overflow-hidden bg-white rounded-2xl border border-gray-200 shadow-sm"
          : "fixed inset-0 z-50 flex items-center justify-center p-4"
      }
    >
      {!inline && <div className="absolute inset-0 bg-black/40 backdrop-blur-sm cursor-pointer" onClick={onClose} />}
      <div
        className={`relative bg-white rounded-2xl flex flex-col overflow-hidden ${
          inline ? "w-full h-full border-0 shadow-none" : "w-full max-w-4xl max-h-[85vh] shadow-2xl"
        }`}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 pr-3">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Users size={18} className="text-amber-600" /> {title}
              </h3>
              {subtitle && <p className="text-sm text-gray-500 mt-0.5 truncate">{subtitle}</p>}
              {campaignId && mode && (
                <p className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] text-gray-400">
                  <span className="font-semibold">Segmentación actual:</span>
                  <span
                    className={`px-2 py-0.5 rounded-full font-bold ${
                      mode === "auto"
                        ? "bg-blue-50 text-blue-700 border border-blue-200"
                        : mode === "manual"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-purple-50 text-purple-700 border border-purple-200"
                    }`}
                  >
                    {AUD_LABEL[mode] ?? mode}
                  </span>
                </p>
              )}
            </div>
            {!inline && (
              <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 transition-colors shrink-0">
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Toolbar: pestañas + búsqueda */}
        <div className="px-6 py-3 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            {!inline && (
              <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 shrink-0">
                <button
                  onClick={() => setTab("seg")}
                  title="Clientes recomendados según el producto seleccionado"
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${tab === "seg" ? "bg-white shadow-sm text-gray-800" : "text-gray-500 hover:text-gray-700"}`}
                >
                  Recomendados por producto
                </button>
                <button
                  onClick={() => setTab("all")}
                  title="Explora toda la base y segmenta manualmente por filtros"
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${tab === "all" ? "bg-white shadow-sm text-gray-800" : "text-gray-500 hover:text-gray-700"}`}
                >
                  Segmentación manual
                </button>
              </div>
            )}
            {inline && (
              <button
                onClick={() => setFilterModalOpen(true)}
                title="Abrir los filtros de segmentación"
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl bg-amber-400 text-amber-900 hover:bg-amber-500 shadow-sm transition-colors shrink-0"
              >
                <SlidersHorizontal size={13} />
                Filtrar clientes
                {f.hasFilters && (
                  <span className="px-1.5 py-0.5 rounded-full bg-white/70 text-amber-900 text-[10px] font-bold">
                    {countActiveFilters(f.snapshot)}
                  </span>
                )}
              </button>
            )}
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={tab === "all" ? "Buscar por nombre, cédula, email o teléfono…" : "Buscar por nombre, email o teléfono…"}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white"
              />
            </div>
          </div>
          {inline && tab === "all" && <ManualFilterChips f={f} />}
          {tab === "all" && !inline && (
            <p className="text-[11px] text-gray-400 mt-2">
              {!f.hasFilters
                ? "Aplica filtros (ubicación, género, edad, perfil de compra…) para segmentar manualmente."
                : allTotal == null || allLoading
                  ? "Calculando cuántos clientes cumplen los filtros…"
                  : `${allTotal.toLocaleString()} clientes cumplen los filtros actuales · ordenados por probabilidad de compra`}
            </p>
          )}
        </div>

        {/* Barra de filtros del tab "Todos los clientes" (solo en el modal) */}
        {tab === "all" && !inline && (
          <div className="px-6 py-2.5 border-b border-gray-100 shrink-0 flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setFilterModalOpen(true)}
              className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl border-2 transition-all cursor-pointer ${
                f.hasFilters
                  ? "border-amber-400 bg-amber-50 text-amber-900 shadow-sm"
                  : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:text-gray-800"
              }`}
            >
              <SlidersHorizontal size={13} />
              Filtros de segmentación
              {f.hasFilters && (
                <span className="px-1.5 py-0.5 rounded-full bg-amber-400 text-amber-900 text-[10px] font-bold">
                  {countActiveFilters(f.snapshot)}
                </span>
              )}
            </button>
            {f.hasFilters ? (
              <>
                <span className="text-[11px] text-gray-400">
                  {countActiveFilters(f.snapshot)} filtro{countActiveFilters(f.snapshot) !== 1 ? "s" : ""} activo{countActiveFilters(f.snapshot) !== 1 ? "s" : ""}
                </span>
                <button
                  onClick={() => {
                    f.reset();
                    setFilterModalOpen(false);
                  }}
                  className="text-[11px] font-semibold text-gray-400 hover:text-red-600 underline underline-offset-2"
                >
                  Limpiar filtros
                </button>
              </>
            ) : (
              <span className="text-[11px] text-gray-400">Define filtros manuales (ubicación, género, edad, perfil de compra…) para afinar la base.</span>
            )}
          </div>
        )}

        {/* List / tabla */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Mensajes y acciones de audiencia (campañas existentes) */}
          {campaignId && (
            <div className="mb-3 space-y-2">
              {audMsg && (
                <p
                  className={`text-xs font-semibold rounded-xl px-3 py-2 ${
                    audMsg.startsWith("⚠")
                      ? "text-red-700 bg-red-50 border border-red-200"
                      : "text-green-700 bg-green-50 border border-green-200"
                  }`}
                >
                  {audMsg}
                </p>
              )}
              {tab === "seg" && mode && mode !== "auto" && (
                <div className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                  <p className="text-[11px] text-amber-800">
                    El público actual es {AUD_LABEL[mode] ?? mode}. ¿Quieres volver a la recomendación por producto?
                  </p>
                  <button
                    onClick={() => void useRecommendedNow()}
                    disabled={busyAud}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-amber-900 bg-amber-400 hover:bg-amber-500 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <RefreshCw size={12} className={busyAud ? "animate-spin" : ""} /> Usar recomendación
                  </button>
                </div>
              )}
            </div>
          )}
          {tab === "seg" ? (
            loading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <RefreshCw size={22} className="text-gray-300 animate-spin" />
                <p className="text-xs text-gray-400">Cargando clientes…</p>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <p className="text-sm font-semibold text-red-600">{error}</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Users size={24} className="text-gray-300 mb-3" />
                <p className="text-sm font-semibold text-gray-700">
                  {recipients.length === 0 ? "Sin clientes" : "Sin resultados"}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {recipients.length === 0
                    ? "No hay clientes que cumplan el estándar de esta segmentación."
                    : "Ningún cliente coincide con la búsqueda."}
                </p>
              </div>
            ) : (
              <div>
                <div className="overflow-x-auto">
                  <ClientDataTable rows={shown.map(segRowToTable)} showStatus />
                </div>
                {visible < filtered.length && (
                  <div ref={sentinelRef} className="flex items-center justify-center gap-2 py-4 text-xs text-gray-400">
                    <RefreshCw size={13} className="animate-spin" /> Cargando más clientes…
                  </div>
                )}
              </div>
            )
          ) : mixRecommended ? (
            <div className="space-y-6">
              {/* 1) Recomendados por producto (forman parte del público sumado) */}
              <section>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">
                    Recomendados por producto
                  </h4>
                  <span className="text-[11px] text-gray-500">
                    {recipients.length > 0 ? `${recipients.length.toLocaleString()} clientes` : "segmentando…"}
                  </span>
                </div>
                {loading ? (
                  <div className="flex items-center justify-center gap-2 py-8 text-xs text-gray-400">
                    <RefreshCw size={14} className="animate-spin" /> Cargando recomendados…
                  </div>
                ) : error ? (
                  <p className="text-xs font-semibold text-red-600">{error}</p>
                ) : filtered.length === 0 ? (
                  <p className="text-xs text-gray-400 py-4 text-center">
                    {recipients.length === 0
                      ? "Aún no hay recomendados (la segmentación está en curso)."
                      : "Ningún recomendado coincide con la búsqueda."}
                  </p>
                ) : (
                  <div>
                    <div className="overflow-x-auto">
                      <ClientDataTable rows={shown.map(segRowToTable)} />
                    </div>
                    {visible < filtered.length && (
                      <div ref={sentinelRef} className="flex items-center justify-center gap-2 py-4 text-xs text-gray-400">
                        <RefreshCw size={13} className="animate-spin" /> Cargando más clientes…
                      </div>
                    )}
                  </div>
                )}
              </section>

              {/* 2) Manuales con tus filtros */}
              <section>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">
                    Con tus filtros manuales
                  </h4>
                  <span className="text-[11px] text-gray-500">
                    {f.hasFilters
                      ? allTotal != null
                        ? `${allTotal.toLocaleString()} clientes`
                        : "calculando…"
                      : "sin filtros"}
                  </span>
                </div>
                {allLoading ? (
                  <div className="flex items-center justify-center gap-2 py-8 text-xs text-gray-400">
                    <RefreshCw size={14} className="text-amber-400 animate-spin" /> Puntuando los clientes que cumplen los filtros…
                  </div>
                ) : allError ? (
                  <div className="flex flex-col items-center py-6 text-center">
                    <p className="text-xs font-semibold text-red-600">{allError}</p>
                    <button
                      onClick={() => void loadAllPage(0, false)}
                      className="mt-3 px-3 py-1.5 text-xs font-bold text-amber-900 bg-amber-400 rounded-lg hover:bg-amber-500 transition-colors"
                    >
                      Reintentar
                    </button>
                  </div>
                ) : !f.hasFilters ? (
                  <div className="flex flex-col items-center py-6 text-center">
                    <p className="text-xs text-gray-500 max-w-xs">
                      Aplica filtros para elegir los clientes manuales que se sumarán a la recomendación.
                    </p>
                    <button
                      onClick={() => setFilterModalOpen(true)}
                      className="mt-3 flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-amber-900 bg-amber-400 hover:bg-amber-500 rounded-lg transition-colors shadow-sm"
                    >
                      <SlidersHorizontal size={13} /> Abrir filtros de segmentación
                    </button>
                  </div>
                ) : allFiltered.length === 0 ? (
                  <p className="text-xs text-gray-400 py-6 text-center">Ningún cliente cumple los filtros.</p>
                ) : (
                  <div>
                    <div className="overflow-x-auto">
                      <ClientDataTable rows={allFiltered.map(scoredToTableRow)} />
                    </div>
                    {allTotal != null && allRows.length < allTotal && (
                      <div ref={allSentinelRef} className="flex items-center justify-center gap-2 py-4 text-xs text-gray-400">
                        <RefreshCw size={13} className="animate-spin" /> {allLoadingMore ? "Cargando más clientes…" : "…"}
                      </div>
                    )}
                  </div>
                )}
              </section>
            </div>
          ) : allLoading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <RefreshCw size={22} className="text-amber-400 animate-spin" />
              <p className="text-sm font-semibold text-gray-700">
                Puntuando {f.hasFilters ? "los clientes que cumplen los filtros" : "toda la base de clientes"}…
              </p>
              <p className="text-xs text-gray-400 max-w-xs">
                La primera vez puede tardar un par de minutos (XGBoost + Uplift sobre la base); después queda en caché.
              </p>
            </div>
          ) : allError ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-sm font-semibold text-red-600">{allError}</p>
              <button
                onClick={() => void loadAllPage(0, false)}
                className="mt-4 px-4 py-2 text-xs font-bold text-amber-900 bg-amber-400 rounded-xl hover:bg-amber-500 transition-colors"
              >
                Reintentar
              </button>
            </div>
          ) : !f.hasFilters ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center mb-3">
                <Filter size={22} className="text-amber-500" />
              </div>
              <p className="text-sm font-semibold text-gray-700">Define la segmentación manual con filtros</p>
              <button
                onClick={() => setFilterModalOpen(true)}
                className="mt-4 flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-amber-900 bg-amber-400 rounded-xl hover:bg-amber-500 transition-colors shadow-sm"
              >
                <SlidersHorizontal size={13} /> Abrir filtros de segmentación
              </button>
            </div>
          ) : allFiltered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Users size={24} className="text-gray-300 mb-3" />
              <p className="text-sm font-semibold text-gray-700">Sin resultados</p>
              <p className="text-xs text-gray-400 mt-1">Ningún cliente coincide con la búsqueda.</p>
            </div>
          ) : (
            <div>
              <div className="overflow-x-auto">
                <ClientDataTable rows={allFiltered.map(scoredToTableRow)} />
              </div>
              {allTotal != null && allRows.length < allTotal && (
                <div ref={allSentinelRef} className="flex items-center justify-center gap-2 py-4 text-xs text-gray-400">
                  <RefreshCw size={13} className="animate-spin" /> {allLoadingMore ? "Cargando más clientes…" : "…"}
                </div>
              )}
              {campaignId && (
                <div className="sticky bottom-0 mt-2 -mx-1 flex items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-amber-900">
                      {!f.hasFilters ? (
                        "Activa filtros (ubicación, género, edad, perfil de compra…) para definir la audiencia manual."
                      ) : allTotal == null || allLoading ? (
                        "Calculando cuántos clientes cumplen los filtros…"
                      ) : (
                        `Los ${allTotal.toLocaleString()} clientes que cumplen los filtros serán tu segmentación manual.`
                      )}
                    </p>
                    {f.hasFilters && mode && (
                      <p className="text-[11px] text-amber-700 mt-0.5">
                        Audiencia actual: {AUD_LABEL[mode] ?? mode}. Elige si reemplazarla o sumar los filtrados.
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => void applyManualAudience(false)}
                      disabled={!f.hasFilters || busyAud}
                      title={
                        f.hasFilters
                          ? "Suma los clientes que cumplen los filtros a la audiencia actual"
                          : "Define filtros primero"
                      }
                      className="px-3 py-1.5 text-xs font-bold text-gray-700 bg-white border border-gray-300 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Plus size={12} className="inline -mt-0.5 mr-1" />Añadir a la audiencia
                    </button>
                    <button
                      onClick={() => void applyManualAudience(true)}
                      disabled={!f.hasFilters || busyAud}
                      title={
                        f.hasFilters
                          ? "Reemplaza TODO el público actual por los clientes que cumplen los filtros"
                          : "Define filtros primero"
                      }
                      className="px-3 py-1.5 text-xs font-bold text-amber-900 bg-amber-400 hover:bg-amber-500 rounded-lg shadow-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <RefreshCw size={12} className={`inline -mt-0.5 mr-1 ${busyAud ? "animate-spin" : ""}`} />
                      {busyAud ? "Aplicando…" : "Reemplazar audiencia"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modal de filtros de segmentación (tab "Todos los clientes") */}
      {filterModalOpen && (
        <SegmentFiltersModal
          f={f}
          total={allTotal}
          loading={allLoading || (allRows.length === 0 && allTotal == null)}
          onClose={closeFilters}
        />
      )}
    </div>
  );
}

/* ─── Segmentación manual por filtros (RFM + analítica) ── */

/** Par de inputs min/max para un filtro numérico. */
function RangeInputs({
  label,
  min,
  max,
  onMin,
  onMax,
  step = 1,
  disabled = false,
  hint,
}: {
  label: string;
  min: string;
  max: string;
  onMin: (v: string) => void;
  onMax: (v: string) => void;
  step?: number;
  disabled?: boolean;
  hint?: string;
}) {
  const inputCls =
    "w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white disabled:bg-gray-50 disabled:text-gray-300 disabled:cursor-not-allowed";
  return (
    <div title={disabled ? hint : undefined}>
      <label className={`block text-[11px] font-semibold mb-1 ${disabled ? "text-gray-300" : "text-gray-500"}`}>{label}</label>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          step={step}
          min={0}
          value={min}
          onChange={(e) => onMin(e.target.value)}
          placeholder="Mín"
          disabled={disabled}
          className={inputCls}
        />
        <span className="text-gray-300 text-xs">—</span>
        <input
          type="number"
          step={step}
          min={0}
          value={max}
          onChange={(e) => onMax(e.target.value)}
          placeholder="Máx"
          disabled={disabled}
          className={inputCls}
        />
      </div>
    </div>
  );
}

/** Tarjeta de sección de filtros (ícono + título + grid de controles). */
function FilterSection({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-3">
      <header className="flex items-center gap-2 mb-3">
        <span className="w-6 h-6 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
          <Icon size={13} />
        </span>
        <h4 className="text-[11px] font-bold text-gray-700 uppercase tracking-wider">{title}</h4>
      </header>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">{children}</div>
    </section>
  );
}

/** Multi-select compacto con búsqueda (dropdown anclado, sin recortes). */
function MultiSelect({
  label,
  options,
  values,
  onChange,
  placeholder = "Todos",
  disabled = false,
  hint,
}: {
  label: string;
  options: string[];
  values: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  hint?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [pos, setPos] = useState<{ top: number; left: number; width: number; openUp: boolean } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const PANEL_MAX_H = 232;

  const close = () => {
    setOpen(false);
    setQ("");
    setPos(null);
  };

  const toggleOpen = () => {
    if (disabled) return;
    if (open) return close();
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const margin = 8;
    const spaceBelow = window.innerHeight - r.bottom - margin;
    const openUp = spaceBelow < PANEL_MAX_H && r.top - margin > PANEL_MAX_H;
    setPos({
      top: openUp ? Math.max(margin, r.top - PANEL_MAX_H - margin) : r.bottom + 4,
      left: r.left,
      width: r.width,
      openUp,
    });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current && btnRef.current.contains(t)) return;
      const panel = document.getElementById("multiselect-panel");
      if (panel && panel.contains(t)) return;
      close();
    };
    const onScroll = () => close();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const toggle = (o: string) => {
    onChange(values.includes(o) ? values.filter((x) => x !== o) : [...values, o]);
  };

  const filtered = options.filter((o) => o.toLowerCase().includes(q.toLowerCase()));
  const shown = q ? filtered : options.slice(0, 80);

  return (
    <div title={disabled ? hint : undefined}>
      <label className={`block text-[11px] font-semibold mb-1 ${disabled ? "text-gray-300" : "text-gray-500"}`}>{label}</label>
      <button
        ref={btnRef}
        type="button"
        onClick={toggleOpen}
        disabled={disabled}
        className={`w-full flex items-center justify-between gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border bg-white focus:outline-none transition-colors ${
          disabled
            ? "border-gray-100 text-gray-300 cursor-not-allowed"
            : values.length
              ? "border-amber-400 bg-amber-50 text-amber-900 font-semibold shadow-sm"
              : "border-gray-200 text-gray-600 hover:border-gray-300"
        }`}
      >
        <span className="truncate text-left">
          {disabled
            ? "Sin datos suficientes"
            : values.length
              ? `${values.length} seleccionado${values.length !== 1 ? "s" : ""}`
              : placeholder}
        </span>
        <ChevronDown size={12} className={`text-gray-300 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {!disabled && open && pos && (
        <div
          id="multiselect-panel"
          style={{
            position: "fixed",
            top: pos.top,
            left: pos.left,
            width: Math.max(pos.width, 200),
            maxHeight: PANEL_MAX_H,
            zIndex: 9999,
          }}
          className="overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-xl p-1.5"
        >
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar…"
            className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg mb-1 focus:outline-none focus:ring-2 focus:ring-amber-300 sticky top-0 bg-white"
          />
          {shown.length === 0 ? (
            <p className="px-2 py-2 text-xs text-gray-400">Sin opciones</p>
          ) : (
            shown.map((o) => (
              <label
                key={o}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-gray-700 hover:bg-amber-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={values.includes(o)}
                  onChange={() => toggle(o)}
                  className="accent-amber-500 w-3.5 h-3.5 shrink-0"
                />
                <span className="truncate">{o}</span>
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/** Checkbox booleano de filtro (marcado = filtrar por true). */
function BoolCheck({
  label,
  checked,
  onChange,
  disabled = false,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <label
      title={disabled ? hint : undefined}
      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border bg-white text-xs cursor-pointer select-none ${
        disabled
          ? "border-gray-100 text-gray-300 cursor-not-allowed opacity-70"
          : "border-gray-200 text-gray-600 hover:border-gray-300"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="accent-amber-500 w-3.5 h-3.5 disabled:opacity-40"
      />
      {label}
    </label>
  );
}

/* ─── Estado compartido de filtros manuales (perfil + RFM) ── */

interface ManualFilterValues {
  segment: string;
  minF: string; maxF: string; minM: string; maxM: string;
  minT: string; maxT: string; minC: string; maxC: string;
  ciudades: string[]; barrios: string[]; direccion: string;
  sexos: string[]; minEdad: string; maxEdad: string;
  estadosCiviles: string[]; minHijos: string; maxHijos: string;
  profesiones: string[];
  minValor: string; maxValor: string; minPuntos: string; maxPuntos: string;
  tieneMascota: boolean; tieneCarro: boolean; esEmpleado: boolean;
  clubs: string[]; consentimientos: string[];
}

const DEFAULT_FILTER_VALUES: ManualFilterValues = {
  segment: "",
  minF: "", maxF: "", minM: "", maxM: "", minT: "", maxT: "", minC: "", maxC: "",
  ciudades: [], barrios: [], direccion: "",
  sexos: [], minEdad: "", maxEdad: "",
  estadosCiviles: [], minHijos: "", maxHijos: "", profesiones: [],
  minValor: "", maxValor: "", minPuntos: "", maxPuntos: "",
  tieneMascota: false, tieneCarro: false, esEmpleado: false,
  clubs: [], consentimientos: [],
};

function useManualFilters() {
  const [values, setValues] = useState<ManualFilterValues>(DEFAULT_FILTER_VALUES);
  const [options, setOptions] = useState<ClientFilterOptions | null>(null);

  useEffect(() => {
    campaignsService
      .getFilterOptions()
      .then(setOptions)
      .catch(() => {});
  }, []);

  const set = useCallback(
    <K extends keyof ManualFilterValues>(k: K, v: ManualFilterValues[K]) =>
      setValues((prev) => ({ ...prev, [k]: v })),
    [],
  );
  const reset = useCallback(() => setValues(DEFAULT_FILTER_VALUES), []);

  const buildFilters = useCallback((): NonNullable<ScoreClientsPayload["filters"]> => {
    const f: NonNullable<ScoreClientsPayload["filters"]> = {};
    if (values.segment) f.segment = Number(values.segment);
    if (values.minF) f.minFrecuencia = Number(values.minF);
    if (values.maxF) f.maxFrecuencia = Number(values.maxF);
    if (values.minM) f.minMonetario = Number(values.minM);
    if (values.maxM) f.maxMonetario = Number(values.maxM);
    if (values.minT) f.minTicketPromedio = Number(values.minT);
    if (values.maxT) f.maxTicketPromedio = Number(values.maxT);
    if (values.minC) f.minCategoriasDistintas = Number(values.minC);
    if (values.maxC) f.maxCategoriasDistintas = Number(values.maxC);
    if (values.ciudades.length) f.ciudades = values.ciudades;
    if (values.barrios.length) f.barrios = values.barrios;
    if (values.direccion.trim()) f.direccionContiene = values.direccion.trim();
    if (values.sexos.length) f.sexos = values.sexos;
    if (values.minEdad) f.minEdad = Number(values.minEdad);
    if (values.maxEdad) f.maxEdad = Number(values.maxEdad);
    if (values.estadosCiviles.length) f.estadosCiviles = values.estadosCiviles;
    if (values.minHijos) f.minHijos = Number(values.minHijos);
    if (values.maxHijos) f.maxHijos = Number(values.maxHijos);
    if (values.profesiones.length) f.profesiones = values.profesiones;
    if (values.minValor) f.minValorTotal = Number(values.minValor);
    if (values.maxValor) f.maxValorTotal = Number(values.maxValor);
    if (values.minPuntos) f.minPuntos = Number(values.minPuntos);
    if (values.maxPuntos) f.maxPuntos = Number(values.maxPuntos);
    if (values.tieneMascota) f.tieneMascota = true;
    if (values.tieneCarro) f.tieneCarro = true;
    if (values.esEmpleado) f.esEmpleado = true;
    if (values.clubs.length) f.clubs = values.clubs;
    if (values.consentimientos.length) f.consentimientos = values.consentimientos;
    return f;
  }, [values]);

  const deps = [
    values.segment, values.minF, values.maxF, values.minM, values.maxM,
    values.minT, values.maxT, values.minC, values.maxC,
    values.ciudades, values.barrios, values.direccion, values.sexos,
    values.minEdad, values.maxEdad, values.estadosCiviles,
    values.minHijos, values.maxHijos, values.profesiones,
    values.minValor, values.maxValor, values.minPuntos, values.maxPuntos,
    values.tieneMascota, values.tieneCarro, values.esEmpleado,
    values.clubs, values.consentimientos,
  ];

  return {
    values,
    set,
    reset,
    options,
    buildFilters,
    apply: setValues,
    snapshot: values,
    hasFilters: Object.keys(buildFilters()).length > 0,
    deps,
  };
}

/** Panel de filtros manuales (perfil + RFM), compartido por los modales. */
// Listas de respaldo con valores reales de la réplica: si el endpoint de
// opciones no responde, los selects igual muestran opciones útiles.
const FALLBACK_CIUDADES = ["MANIZALES", "VILLAMARIA", "PEREIRA", "BOGOTA, D.C.", "MEDELLIN", "CALI", "NEIRA", "CHINCHINA", "DOSQUEBRADAS", "ARMENIA", "BOGOTA", "IBAGUE", "CARTAGO", "LA DORADA", "ENVIGADO"];
const FALLBACK_BARRIOS = ["PALERMO", "ENEA", "CENTRO", "CHIPRE", "SULTANA", "FATIMA", "SAN JORGE", "LA SULTANA", "VILLA PILAR", "LA ENEA", "NEIRA", "COMUNA UNIVERSITARIA"];
const FALLBACK_PROFESIONES = ["Ama de casa", "Independiente", "Empleado", "Estudiante", "Jubilado(a)", "Comerciante", "Docente", "Ingeniero(a)", "Abogado(a)", "Enfermero(a)", "Auxiliar", "Administrador(a)", "Otra"];
const FALLBACK_ESTADOS_CIVILES = ["Soltero(a)", "Casado(a)", "Union Libre", "Separado(a)", "Viudo(a)"];

function ManualFiltersPanel({ f }: { f: ReturnType<typeof useManualFilters> }) {
  const v = f.values;
  const set = f.set;
  const optCiudades = f.options?.ciudades?.length ? f.options.ciudades : FALLBACK_CIUDADES;
  const optBarrios = f.options?.barrios?.length ? f.options.barrios : FALLBACK_BARRIOS;
  const optProfesiones = f.options?.profesiones?.length ? f.options.profesiones : FALLBACK_PROFESIONES;
  const optEstados = f.options?.estadosCiviles?.length ? f.options.estadosCiviles : FALLBACK_ESTADOS_CIVILES;
  const optSexos = f.options?.sexos?.length ? f.options.sexos : ["F", "M"];
  const inputCls =
    "w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-300 transition-shadow";
  return (
    <div className="space-y-3">
      <FilterSection icon={MapPin} title="Ubicación">
        <MultiSelect label="Ciudad" options={optCiudades} values={v.ciudades} onChange={(x) => set("ciudades", x)} />
        <MultiSelect label="Barrio" options={optBarrios} values={v.barrios} onChange={(x) => set("barrios", x)} />
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 mb-1">Dirección contiene</label>
          <input
            type="text"
            value={v.direccion}
            onChange={(e) => set("direccion", e.target.value)}
            placeholder="Ej: Cra 23"
            className={inputCls}
          />
        </div>
      </FilterSection>

      <FilterSection icon={Users} title="Demografía">
        <MultiSelect label="Sexo" options={optSexos} values={v.sexos} onChange={(x) => set("sexos", x)} />
        <RangeInputs label="Edad (años)" min={v.minEdad} max={v.maxEdad} onMin={(x) => set("minEdad", x)} onMax={(x) => set("maxEdad", x)} />
        <MultiSelect
          label="Estado civil"
          options={optEstados}
          values={v.estadosCiviles}
          onChange={(x) => set("estadosCiviles", x)}
        />
        <RangeInputs label="Hijos" min={v.minHijos} max={v.maxHijos} onMin={(x) => set("minHijos", x)} onMax={(x) => set("maxHijos", x)} />
        <MultiSelect label="Profesión" options={optProfesiones} values={v.profesiones} onChange={(x) => set("profesiones", x)} />
      </FilterSection>

      <FilterSection icon={Wallet} title="Económico (proxy de ingresos)">
        <RangeInputs label="Valor total histórico (compras)" min={v.minValor} max={v.maxValor} onMin={(x) => set("minValor", x)} onMax={(x) => set("maxValor", x)} step={50000} />
        <RangeInputs label="Puntos de fidelidad" min={v.minPuntos} max={v.maxPuntos} onMin={(x) => set("minPuntos", x)} onMax={(x) => set("maxPuntos", x)} step={1000} />
      </FilterSection>

      <FilterSection icon={PawPrint} title="Estilo de vida">
        <MultiSelect
          label="Clubs (alguno)"
          options={["vino", "parrilla", "salud", "mascotas", "amas_de_casa"]}
          values={v.clubs}
          onChange={(x) => set("clubs", x)}
        />
        <div className="flex flex-wrap items-end gap-2 pb-0.5">
          <BoolCheck
            label="Tiene mascota"
            checked={v.tieneMascota}
            onChange={(x) => set("tieneMascota", x)}
            disabled
            hint="Sin datos suficientes: solo ~9 % de la base puntuada registra este atributo."
          />
          <BoolCheck
            label="Tiene carro"
            checked={v.tieneCarro}
            onChange={(x) => set("tieneCarro", x)}
            disabled
            hint="Sin datos suficientes: solo ~8 % de la base puntuada registra este atributo."
          />
          <BoolCheck
            label="Es empleado"
            checked={v.esEmpleado}
            onChange={(x) => set("esEmpleado", x)}
            disabled
            hint="Sin datos suficientes: menos del 1 % de la base puntuada es empleado de la empresa."
          />
        </div>
      </FilterSection>

      <FilterSection icon={ShieldCheck} title="Consentimiento">
        <MultiSelect
          label="Con consentimiento para (alguno)"
          options={["email", "whatsapp", "sms"]}
          values={v.consentimientos}
          onChange={(x) => set("consentimientos", x)}
        />
      </FilterSection>

      <FilterSection icon={BarChart2} title="RFM">
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 mb-1">Segmento</label>
          <select value={v.segment} onChange={(e) => set("segment", e.target.value)} className={inputCls}>
            <option value="">Todos</option>
            {[0, 1, 2, 3, 4, 5].map((s) => (
              <option key={s} value={s}>Segmento {s}</option>
            ))}
          </select>
        </div>
        <RangeInputs label="Frecuencia (compras)" min={v.minF} max={v.maxF} onMin={(x) => set("minF", x)} onMax={(x) => set("maxF", x)} />
        <RangeInputs label="Monetario (gasto)" min={v.minM} max={v.maxM} onMin={(x) => set("minM", x)} onMax={(x) => set("maxM", x)} step={10000} />
        <RangeInputs label="Ticket promedio" min={v.minT} max={v.maxT} onMin={(x) => set("minT", x)} onMax={(x) => set("maxT", x)} step={1000} />
        <RangeInputs label="Categorías distintas" min={v.minC} max={v.maxC} onMin={(x) => set("minC", x)} onMax={(x) => set("maxC", x)} />
      </FilterSection>
    </div>
  );
}

/** Burbujas con los filtros manuales aplicados; cada una se puede quitar. */
function ManualFilterChips({ f }: { f: ReturnType<typeof useManualFilters> }) {
  const v = f.snapshot;
  const set = f.set;
  const chips: { key: string; label: string; onClear: () => void }[] = [];
  const push = (key: string, label: string, onClear: () => void) => {
    if (label) chips.push({ key, label, onClear });
  };
  const range = (min: string, max: string) => {
    const a = min.trim();
    const b = max.trim();
    if (a && b) return `${a}–${b}`;
    if (a) return `≥ ${a}`;
    if (b) return `≤ ${b}`;
    return "";
  };

  push("segment", v.segment ? `Segmento RFM: ${v.segment}` : "", () => set("segment", ""));
  push("ciudades", v.ciudades.length ? `Ciudad: ${v.ciudades.join(", ")}` : "", () => set("ciudades", []));
  push("barrios", v.barrios.length ? `Barrio: ${v.barrios.join(", ")}` : "", () => set("barrios", []));
  push("direccion", v.direccion.trim() ? `Dirección: ${v.direccion.trim()}` : "", () => set("direccion", ""));
  push("sexos", v.sexos.length ? `Sexo: ${v.sexos.join(", ")}` : "", () => set("sexos", []));
  push("edad", range(v.minEdad, v.maxEdad) && `Edad: ${range(v.minEdad, v.maxEdad)}`, () => {
    set("minEdad", "");
    set("maxEdad", "");
  });
  push("estados", v.estadosCiviles.length ? `Estado civil: ${v.estadosCiviles.join(", ")}` : "", () => set("estadosCiviles", []));
  push("hijos", range(v.minHijos, v.maxHijos) && `Hijos: ${range(v.minHijos, v.maxHijos)}`, () => {
    set("minHijos", "");
    set("maxHijos", "");
  });
  push("profesiones", v.profesiones.length ? `Profesión: ${v.profesiones.join(", ")}` : "", () => set("profesiones", []));
  push("valor", range(v.minValor, v.maxValor) && `Valor histórico: ${range(v.minValor, v.maxValor)}`, () => {
    set("minValor", "");
    set("maxValor", "");
  });
  push("puntos", range(v.minPuntos, v.maxPuntos) && `Puntos: ${range(v.minPuntos, v.maxPuntos)}`, () => {
    set("minPuntos", "");
    set("maxPuntos", "");
  });
  push("frecuencia", range(v.minF, v.maxF) && `Frecuencia: ${range(v.minF, v.maxF)}`, () => {
    set("minF", "");
    set("maxF", "");
  });
  push("monetario", range(v.minM, v.maxM) && `Monetario: ${range(v.minM, v.maxM)}`, () => {
    set("minM", "");
    set("maxM", "");
  });
  push("ticket", range(v.minT, v.maxT) && `Ticket: ${range(v.minT, v.maxT)}`, () => {
    set("minT", "");
    set("maxT", "");
  });
  push("categorias", range(v.minC, v.maxC) && `Categorías: ${range(v.minC, v.maxC)}`, () => {
    set("minC", "");
    set("maxC", "");
  });
  push("clubs", v.clubs.length ? `Clubs: ${v.clubs.join(", ")}` : "", () => set("clubs", []));
  push(
    "consentimientos",
    v.consentimientos.length ? `Consentimiento: ${v.consentimientos.join(", ")}` : "",
    () => set("consentimientos", []),
  );
  push("mascota", v.tieneMascota ? "Con mascota" : "", () => set("tieneMascota", false));
  push("carro", v.tieneCarro ? "Con carro" : "", () => set("tieneCarro", false));
  push("empleado", v.esEmpleado ? "Es empleado" : "", () => set("esEmpleado", false));

  if (!chips.length) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
      {chips.map((c) => (
        <span
          key={c.key}
          className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full bg-amber-50 border border-amber-200 text-[11px] font-semibold text-amber-900"
        >
          {c.label}
          <button
            onClick={c.onClear}
            title="Quitar filtro"
            className="w-4 h-4 flex items-center justify-center rounded-full hover:bg-amber-200 text-amber-700 transition-colors cursor-pointer"
          >
            <X size={10} />
          </button>
        </span>
      ))}
      {chips.length > 1 && (
        <button
          onClick={() => f.reset()}
          className="ml-1 text-[11px] font-semibold text-gray-400 hover:text-red-600 underline underline-offset-2 cursor-pointer"
        >
          Limpiar todo
        </button>
      )}
    </div>
  );
}

/** Nº de criterios activos (para el badge de la barra de filtros). */
function countActiveFilters(v: ManualFilterValues): number {
  const ranged = (a: string, b: string) => (a ? 1 : 0) + (b ? 1 : 0);
  return (
    (v.segment ? 1 : 0) +
    ranged(v.minF, v.maxF) +
    ranged(v.minM, v.maxM) +
    ranged(v.minT, v.maxT) +
    ranged(v.minC, v.maxC) +
    (v.ciudades.length ? 1 : 0) +
    (v.barrios.length ? 1 : 0) +
    (v.direccion.trim() ? 1 : 0) +
    (v.sexos.length ? 1 : 0) +
    ranged(v.minEdad, v.maxEdad) +
    (v.estadosCiviles.length ? 1 : 0) +
    ranged(v.minHijos, v.maxHijos) +
    (v.profesiones.length ? 1 : 0) +
    ranged(v.minValor, v.maxValor) +
    ranged(v.minPuntos, v.maxPuntos) +
    (v.tieneMascota ? 1 : 0) +
    (v.tieneCarro ? 1 : 0) +
    (v.esEmpleado ? 1 : 0) +
    (v.clubs.length ? 1 : 0) +
    (v.consentimientos.length ? 1 : 0)
  );
}

/** Modal de filtros de segmentación (aplicación en vivo + contador).
 *  Edita directamente el hook de filtros del tab "Todos los clientes": cada
 *  cambio se aplica de inmediato (la lista se recarga sola) y el header
 *  muestra cuántos clientes cumplen las características elegidas. */
function SegmentFiltersModal({
  f,
  total,
  loading,
  onClose,
}: {
  f: ReturnType<typeof useManualFilters>;
  total: number | null;
  loading: boolean;
  onClose: () => void;
}) {
  const n = countActiveFilters(f.snapshot);

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm cursor-pointer" onClick={onClose} />
      <div className="relative bg-gray-50 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 bg-white border-b border-gray-200 shrink-0">
          <div className="min-w-0 pr-3">
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <SlidersHorizontal size={18} className="text-amber-600" /> Filtros de segmentación
              {n > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-amber-400 text-amber-900 text-[10px] font-bold">
                  {n}
                </span>
              )}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Cada cambio se aplica al instante sobre la lista de segmentación manual.
            </p>
            {/* Contador destacado de clientes con esas características */}
            <div
              className="mt-3 inline-flex items-center gap-2.5 rounded-xl px-3.5 py-2 shadow-sm"
              style={{ background: "#FFF200" }}
            >
              {loading ? (
                <RefreshCw size={15} className="text-[#1A1A2E] animate-spin shrink-0" />
              ) : (
                <Users size={15} className="text-[#1A1A2E] shrink-0" />
              )}
              {loading ? (
                <span className="text-xs font-bold text-[#1A1A2E] whitespace-nowrap">Calculando clientes…</span>
              ) : total != null ? (
                <span className="text-sm font-black text-[#1A1A2E] leading-tight">
                  {total.toLocaleString()}{" "}
                  <span className="font-semibold text-[#1A1A2E]/70">
                    cliente{total !== 1 ? "s" : ""} con esas características
                  </span>
                </span>
              ) : (
                <span className="text-xs font-bold text-[#1A1A2E] whitespace-nowrap">Sin resultados aún</span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 transition-colors shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        {/* Cuerpo */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <ManualFiltersPanel f={f} />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-6 py-3 bg-white border-t border-gray-200 shrink-0">
          <button
            onClick={() => f.reset()}
            disabled={n === 0}
            className="text-xs font-semibold text-gray-500 hover:text-red-600 underline underline-offset-2 disabled:opacity-40 disabled:no-underline disabled:cursor-default"
          >
            Limpiar todo
          </button>
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-6 py-2 text-xs font-bold text-amber-900 bg-amber-400 hover:bg-amber-500 rounded-xl shadow-sm transition-colors"
          >
            <CheckSquare size={13} />
            Listo
          </button>
        </div>
      </div>
    </div>
  );
}

function ManualSegModal({
  campaignId,
  campaignName,
  onAdded,
  onClose,
}: {
  campaignId: number;
  campaignName: string;
  onAdded: (n: number) => void;
  onClose: () => void;
}) {
  // Solo clientes con ≥70% de probabilidad de compra (estándar de la campaña).
  const [onlyHigh, setOnlyHigh] = useState(true);

  // Filtros manuales compartidos (perfil + RFM) con opciones de la réplica.
  const f = useManualFilters();
  const { buildFilters, hasFilters } = f;

  const [rows, setRows] = useState<ScoredClient[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [addedMsg, setAddedMsg] = useState<string | null>(null);
  const fetchRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const runAnalysis = async (offset = 0, append = false) => {
    if (fetchRef.current) return;
    fetchRef.current = true;
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    setAddedMsg(null);
    try {
      const res = await campaignsService.scoreClients({
        filters: buildFilters(),
        minPropensity: onlyHigh ? 0.7 : undefined,
        sort: "propensity",
        dir: "desc",
        limit: 500,
        offset,
      });
      setRows((prev) => (append ? [...prev, ...res.clients] : res.clients));
      setTotal(res.total);
    } catch (e) {
      if (!append) setError(e instanceof Error ? e.message : "No se pudo ejecutar la analítica");
    } finally {
      fetchRef.current = false;
      if (append) setLoadingMore(false);
      else setLoading(false);
    }
  };

  const toggleRow = (cedula: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(cedula)) next.delete(cedula);
      else next.add(cedula);
      return next;
    });
  };

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.cedula));
  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      rows.forEach((r) => {
        if (allSelected) next.delete(r.cedula);
        else next.add(r.cedula);
      });
      return next;
    });
  };

  const handleAdd = async (replace = false) => {
    if (!selected.size) return;
    setAdding(true);
    setAddedMsg(null);
    try {
      const cedulas = [...selected];
      if (replace) {
        const c = await campaignsService.replaceManualAudience(campaignId, { cedulas });
        setAddedMsg(`Audiencia reemplazada: ${c.audienceCount.toLocaleString()} clientes manuales.`);
      } else {
        const c = await campaignsService.addManualRecipients(campaignId, { cedulas });
        setAddedMsg(
          `Audiencia actualizada: ${c.audienceCount.toLocaleString()} clientes en la campaña.`,
        );
      }
      setSelected(new Set());
      onAdded(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron actualizar los clientes");
    } finally {
      setAdding(false);
    }
  };

  // Scroll infinito: pide la siguiente página al llegar al final.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !fetchRef.current && total != null && rows.length < total) {
          void runAnalysis(rows.length, true);
        }
      },
      { rootMargin: "400px" },
    );
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total, rows.length, onlyHigh, ...f.deps]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm cursor-pointer" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="min-w-0 pr-3">
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <SlidersHorizontal size={18} className="text-amber-600" /> Segmentar manualmente
            </h3>
            <p className="text-sm text-gray-500 mt-0.5 truncate">
              {campaignName} · filtra la base de clientes, ejecuta analítica y añádelos a la campaña
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 transition-colors shrink-0">
            <X size={16} />
          </button>
        </div>

        {/* Filtros */}
        <div className="px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="max-h-[46vh] overflow-y-auto pr-1">
            <ManualFiltersPanel f={f} />
          </div>
          <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
            <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={onlyHigh}
                onChange={(e) => setOnlyHigh(e.target.checked)}
                className="accent-amber-500 w-3.5 h-3.5"
              />
              Solo clientes con <strong>≥70% de probabilidad de compra</strong>
            </label>
            <button
              onClick={() => void runAnalysis(0, false)}
              disabled={loading}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-amber-900 bg-amber-400 hover:bg-amber-500 rounded-xl transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Zap size={13} />
              {loading ? "Analizando…" : hasFilters ? "Aplicar y analizar" : "Analizar toda la base"}
            </button>
          </div>
          {error && (
            <p className="mt-3 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-2">
              ⚠ {error}
            </p>
          )}
          {addedMsg && (
            <p className="mt-3 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-2 flex items-center gap-1.5">
              <CheckSquare size={13} /> {addedMsg}
            </p>
          )}
        </div>

        {/* Resultados */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <RefreshCw size={22} className="text-amber-400 animate-spin" />
              <p className="text-sm font-semibold text-gray-700">Ejecutando analítica sobre los clientes filtrados…</p>
              <p className="text-xs text-gray-400 max-w-xs">
                Se calcula la probabilidad de compra (XGBoost) y la persuasibilidad (Uplift) de cada cliente.
              </p>
            </div>
          ) : rows.length === 0 && total == null && !error ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Filter size={24} className="text-gray-300 mb-3" />
              <p className="text-sm font-semibold text-gray-700">Sin análisis todavía</p>
              <p className="text-xs text-gray-400 mt-1 max-w-xs">
                Define los filtros (o ninguno para toda la base) y pulsa “Aplicar y analizar” para ver los clientes con su probabilidad de compra.
              </p>
            </div>
          ) : rows.length === 0 && !error ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Users size={24} className="text-gray-300 mb-3" />
              <p className="text-sm font-semibold text-gray-700">Sin resultados</p>
              <p className="text-xs text-gray-400 mt-1">Ningún cliente cumple los filtros seleccionados.</p>
            </div>
          ) : rows.length > 0 ? (
            <div>
              <div className="flex items-center justify-between pb-2">
                <p className="text-xs text-gray-600">
                  <strong>{selected.size.toLocaleString()}</strong> seleccionados de{" "}
                  {total?.toLocaleString() ?? rows.length.toLocaleString()} resultados
                </p>
              </div>
              <div className="overflow-x-auto">
                <ClientDataTable
                  rows={rows.map(scoredToTableRow)}
                  selectable={{
                    allSelected,
                    onToggleAll: toggleAll,
                    isSelected: (k) => selected.has(k),
                    onToggle: toggleRow,
                  }}
                />
              </div>
              {total != null && rows.length < total && (
                <div ref={sentinelRef} className="flex items-center justify-center gap-2 py-4 text-xs text-gray-400">
                  <RefreshCw size={13} className="animate-spin" /> {loadingMore ? "Cargando más clientes…" : "…"}
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Footer: añadir / reemplazar audiencia de la campaña */}
        <div className="shrink-0 px-6 py-4 border-t border-gray-100 bg-gray-50/60 flex items-center justify-between gap-3">
          <p className="text-xs text-gray-500">
            {selected.size > 0
              ? `${selected.size.toLocaleString()} cliente${selected.size === 1 ? "" : "s"} seleccionado${selected.size === 1 ? "" : "s"}.`
              : "Selecciona clientes de los resultados para actualizar la audiencia de la campaña."}
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => void handleAdd(true)}
              disabled={selected.size === 0 || adding}
              title="Reemplaza TODO el público actual por los seleccionados"
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-gray-700 bg-white border border-gray-300 hover:bg-gray-100 rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <RefreshCw size={14} /> Reemplazar audiencia
            </button>
            <button
              onClick={() => void handleAdd()}
              disabled={selected.size === 0 || adding}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-amber-900 bg-amber-400 hover:bg-amber-500 rounded-xl transition-all shadow-md hover:shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus size={14} /> {adding ? "Aplicando…" : `Añadir ${selected.size.toLocaleString()} a la audiencia`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Acciones de campaña (editar / relanzar / historial / eliminar) ── */

function ConfirmModal({
  title,
  message,
  confirmLabel,
  busy,
  danger,
  requireText,
  onConfirm,
  onClose,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  busy?: boolean;
  danger?: boolean;
  /** Si se indica, el usuario debe escribir este texto (p. ej. el nombre) para habilitar la confirmación. */
  requireText?: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState("");
  const target = requireText?.trim();
  const matches = !target || typed.trim() === target;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm cursor-pointer" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <h3 className="text-lg font-bold text-gray-900">{title}</h3>
        <p className="text-sm text-gray-500 mt-2 leading-relaxed">{message}</p>
        {target && (
          <div className="mt-4">
            <label className="text-xs text-gray-500 mb-1 block">
              Escribe <strong className="text-gray-700">{target}</strong> para confirmar
            </label>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={target}
              autoFocus
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-300"
            />
          </div>
        )}
        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 text-xs font-bold text-gray-500 hover:bg-gray-100 rounded-xl transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={busy || !matches}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
              danger ? "bg-red-500 text-white hover:bg-red-600" : "bg-amber-400 text-amber-900 hover:bg-amber-500"
            }`}
          >
            {busy ? "Procesando…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Modal: relanzar campaña (re-segmentar público + canales) ── */
function RelaunchModal({
  campaign,
  onRelaunched,
  onClose,
}: {
  campaign: CampaignCardData;
  onRelaunched: (c: CampaignCardData) => void;
  onClose: () => void;
}) {
  const [channels, setChannels] = useState<Record<string, boolean>>(() => {
    const ch: Record<string, boolean> = { wa: false, email: false, sms: false };
    for (const k of campaign.channels) ch[k] = true;
    return Object.values(ch).some(Boolean) ? ch : { wa: true, email: true, sms: true };
  });
  const [audSource, setAudSource] = useState<"auto" | "manual">(
    campaign.audienceMode === "manual" ? "manual" : "auto",
  );
  const [audMix, setAudMix] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const manualF = useManualFilters();

  const [manualTotal, setManualTotal] = useState<number | null>(null);
  const [manualLoading, setManualLoading] = useState(false);
  const manualKey = JSON.stringify(manualF.buildFilters());

  // Cuántos clientes cumplen los filtros manuales (para mostrarlo y validar).
  useEffect(() => {
    if (!manualF.hasFilters) {
      setManualTotal(null);
      setManualLoading(false);
      return;
    }
    setManualLoading(true);
    const t = setTimeout(() => {
      void (async () => {
        try {
          const res = await campaignsService.scoreClients({
            filters: manualF.buildFilters(),
            limit: 1,
            offset: 0,
          });
          setManualTotal(res.total);
        } catch {
          setManualTotal(null);
        } finally {
          setManualLoading(false);
        }
      })();
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualKey]);

  const activeChannelKeys = CHANNEL_ORDER.filter((k) => channels[k]);

  const toggleChannel = (k: keyof typeof CHANNEL_CFG) =>
    setChannels((prev) => {
      if (prev[k] && activeChannelKeys.length === 1) return prev; // mínimo un canal
      return { ...prev, [k]: !prev[k] };
    });

  const handleRelaunch = async () => {
    setError(null);
    if (!activeChannelKeys.length) {
      setError("Selecciona al menos un canal de envío.");
      return;
    }
    if (audSource === "manual" && !manualF.hasFilters) {
      setError(
        "Para relanzar con segmentación manual define al menos un filtro, o elige la recomendación por producto.",
      );
      return;
    }
    setBusy(true);
    setStep("Guardando los canales de envío…");
    try {
      // 1) Canales seleccionados.
      await campaignsService.update(campaign.id, {
        channels: activeChannelKeys.map((k) => CHANNEL_TO_API[k]),
      });
      // 2) Relanzar: re-segmenta la recomendación por producto y reinicia métricas.
      setStep("Recalculando los clientes objetivos…");
      let updated = await campaignsService.relaunch(campaign.id);
      // 3) Público manual (si aplica): reemplaza o se suma a la recomendación.
      if (audSource === "manual") {
        setStep("Aplicando los filtros manuales al público…");
        updated = await campaignsService.applyAudience(
          campaign.id,
          audMix ? "mixed" : "manual",
          { filters: manualF.buildFilters() },
        );
      }
      setStep("¡Listo! Actualizando la campaña…");
      onRelaunched(apiToCard(updated));
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo relanzar la campaña");
    } finally {
      setBusy(false);
      setStep(null);
    }
  };

  const filterCount = countActiveFilters(manualF.snapshot);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm cursor-pointer" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[88vh] flex flex-col overflow-hidden">
        <div className="flex items-start justify-between gap-3 px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <RotateCw size={17} className="text-emerald-600" /> Relanzar campaña
            </h3>
            <p className="text-xs text-gray-500 mt-0.5 truncate">{campaign.name}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 transition-colors shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* Público objetivo */}
          <section>
            <p className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-2">Público objetivo</p>
            <p className="text-xs text-gray-500 mb-3">
              La recomendación se recalcula por producto al relanzar. Puedes ajustarla con filtros manuales.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAudSource("auto")}
                className={`flex flex-col items-start gap-1 rounded-xl border-2 px-3 py-2.5 text-left transition-all ${
                  audSource === "auto" ? "border-amber-400 bg-amber-50" : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <span className="flex items-center gap-1.5 text-xs font-bold text-gray-800">
                  <Sparkles size={13} className="text-amber-500" /> Recomendada
                </span>
                <span className="text-[10px] text-gray-500">
                  Por producto{campaign.audience ? ` · ${campaign.audience.toLocaleString()} clientes` : ""}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setAudSource("manual")}
                className={`flex flex-col items-start gap-1 rounded-xl border-2 px-3 py-2.5 text-left transition-all ${
                  audSource === "manual" ? "border-amber-400 bg-amber-50" : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <span className="flex items-center gap-1.5 text-xs font-bold text-gray-800">
                  <SlidersHorizontal size={13} className="text-amber-500" /> Manual con filtros
                </span>
                <span className="text-[10px] text-gray-500">
                  {manualF.hasFilters
                    ? manualTotal != null
                      ? `${manualTotal.toLocaleString()} clientes`
                      : "calculando…"
                    : "Define filtros"}
                </span>
              </button>
            </div>

            {audSource === "manual" && (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="text-xs font-semibold text-amber-900">
                    {manualF.hasFilters
                      ? `${filterCount} filtro${filterCount !== 1 ? "s" : ""} activo${filterCount !== 1 ? "s" : ""}`
                      : "Sin filtros definidos todavía"}
                  </p>
                  <button
                    onClick={() => setFiltersOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-amber-900 bg-amber-400 hover:bg-amber-500 rounded-lg transition-colors shadow-sm shrink-0"
                  >
                    <SlidersHorizontal size={12} />
                    {manualF.hasFilters ? "Editar filtros" : "Filtrar clientes"}
                  </button>
                </div>
                {manualF.hasFilters && (
                  <>
                    <div className="mt-2">
                      <ManualFilterChips f={manualF} />
                    </div>
                    <label className="mt-2 flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={audMix}
                        onChange={(e) => setAudMix(e.target.checked)}
                        className="w-3.5 h-3.5 mt-0.5 accent-amber-500 shrink-0"
                      />
                      <span className="text-[11px] text-gray-600 leading-relaxed">
                        Sumar estos clientes a la recomendación. Si lo desmarcas, reemplazan la recomendación.
                      </span>
                    </label>
                  </>
                )}
              </div>
            )}
          </section>

          {/* Canales */}
          <section>
            <p className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-2">Canales de envío</p>
            <div className="flex gap-2">
              {CHANNEL_ORDER.map((k) => {
                const cfg = CHANNEL_CFG[k];
                const on = !!channels[k];
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => toggleChannel(k)}
                    aria-pressed={on}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border-2 text-xs font-semibold transition-all ${
                      on
                        ? `${cfg.bg} text-white border-transparent shadow-sm`
                        : "border-gray-200 text-gray-400 bg-white hover:border-gray-300"
                    }`}
                  >
                    <cfg.icon size={14} />
                    {cfg.label}
                  </button>
                );
              })}
            </div>
          </section>

          {error && (
            <div className="text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              ⚠ {error}
            </div>
          )}
        </div>

        <div className="shrink-0 px-6 py-3 border-t border-gray-100 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 text-xs font-bold text-gray-500 hover:bg-gray-100 rounded-xl transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={() => void handleRelaunch()}
            disabled={busy}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold bg-emerald-500 text-white hover:bg-emerald-600 rounded-xl transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RotateCw size={15} className={busy ? "animate-spin" : ""} /> {busy ? "Relanzando…" : "Relanzar campaña"}
          </button>
        </div>

        {/* Overlay: recálculo del público objetivo al relanzar */}
        {busy && (
          <div className="absolute inset-0 z-10 bg-white/90 backdrop-blur-sm flex flex-col items-center justify-center gap-4 px-8 text-center">
            <div className="relative w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center">
              <span className="absolute inset-0 rounded-2xl bg-emerald-100 animate-pulse" />
              <RotateCw size={26} className="relative text-emerald-500 animate-spin" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900">{step ?? "Relanzando campaña…"}</p>
              <p className="text-xs text-gray-500 mt-1 max-w-xs">
                Estamos re-segmentando el público objetivo según el producto de la campaña. Puede tardar unos segundos.
              </p>
            </div>
          </div>
        )}
      </div>

      {filtersOpen && (
        <SegmentFiltersModal
          f={manualF}
          total={manualTotal}
          loading={manualLoading}
          onClose={() => setFiltersOpen(false)}
        />
      )}
    </div>
  );
}

/* ─── Modal: filtrar campañas por producto ─────────── */
interface ProductPick {
  id: number;
  name: string;
}

function ProductFilterModal({
  selected,
  onChange,
  onClose,
}: {
  selected: ProductPick[];
  onChange: (next: ProductPick[]) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(false);

  // Busca en el catálogo (top 5 coincidencias) con un pequeño debounce.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setOptions([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      catalogService
        .getProducts({ search: q, limit: 5, isActive: true })
        .then((res) => {
          if (!cancelled) setOptions(res.slice(0, 5));
        })
        .catch(() => {
          if (!cancelled) setOptions([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  const isSelected = (id: number) => selected.some((s) => s.id === id);
  const toggle = (p: ProductPick) =>
    onChange(isSelected(p.id) ? selected.filter((s) => s.id !== p.id) : [...selected, p]);

  const q = query.trim();

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm cursor-pointer" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Filter size={17} className="text-amber-600" /> Filtrar por producto
          </h3>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar producto por nombre..."
              className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-300"
            />
          </div>

          {(loading || options.length > 0 || q.length >= 2) && (
            <div className="mt-2 rounded-xl border border-gray-100 shadow-sm overflow-hidden divide-y divide-gray-50">
              {loading && options.length === 0 ? (
                <p className="px-3 py-3 text-xs text-gray-400 flex items-center gap-2">
                  <RefreshCw size={12} className="animate-spin" /> Buscando…
                </p>
              ) : options.length === 0 ? (
                <p className="px-3 py-3 text-xs text-gray-400">Sin coincidencias.</p>
              ) : (
                options.map((p) => {
                  const on = isSelected(p.id);
                  return (
                    <button
                      key={p.id}
                      onClick={() => toggle({ id: p.id, name: p.name })}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-amber-50 transition-colors"
                    >
                      <div className="w-8 h-8 rounded-lg overflow-hidden bg-gray-100 flex items-center justify-center shrink-0">
                        {p.image ? (
                          <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-sm">🛒</span>
                        )}
                      </div>
                      <span className="min-w-0 flex-1 text-xs font-medium text-gray-800 truncate">{p.name}</span>
                      {on ? (
                        <CheckCircle size={16} className="text-amber-500 shrink-0" />
                      ) : (
                        <Plus size={15} className="text-gray-300 shrink-0" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          )}

          <div className="mt-4">
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Seleccionados ({selected.length})
            </p>
            {selected.length === 0 ? (
              <p className="text-xs text-gray-400">Escribe para buscar y selecciona uno o varios productos.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {selected.map((s) => (
                  <span
                    key={s.id}
                    className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold"
                  >
                    <span className="truncate max-w-40">{s.name}</span>
                    <button
                      onClick={() => toggle(s)}
                      className="w-4 h-4 flex items-center justify-center rounded-full hover:bg-amber-200 transition-colors"
                      title="Quitar"
                      aria-label={`Quitar ${s.name}`}
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="shrink-0 px-6 py-3 border-t border-gray-100 flex items-center justify-between gap-2">
          <button
            onClick={() => onChange([])}
            disabled={!selected.length}
            className="px-3 py-2 text-xs font-bold text-gray-500 hover:bg-gray-100 rounded-xl transition-colors disabled:opacity-40"
          >
            Limpiar
          </button>
          <button
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-bold text-amber-900 bg-amber-400 hover:bg-amber-500 rounded-xl transition-colors"
          >
            Listo
          </button>
        </div>
      </div>
    </div>
  );
}

const HOW_IT_WORKS_STEPS = [
  { n: "01", label: "Seleccionar Producto", sub: "El sistema detecta automáticamente el mejor público para ese producto.", icon: Target },
  { n: "02", label: "Generar Campaña", sub: "Describe el tono y la IA crea 3 versiones: WhatsApp, Email y SMS.", icon: Sparkles },
  { n: "03", label: "Enviar Ahora", sub: "Previsualiza, edita si quieres, y lanza con un solo clic.", icon: Send },
];

function HowItWorksModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm cursor-pointer" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
        <button
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        >
          <X size={18} />
        </button>
        <div className="flex items-center gap-2 mb-1 pr-8">
          <Sparkles size={18} className="text-amber-600 shrink-0" />
          <h3 className="text-lg font-bold text-gray-900">Lanza una campaña completa en 3 pasos</h3>
        </div>
        <p className="text-sm text-gray-500 mb-5">Automatización de marketing omnicanal: del producto al envío sin salir de aquí.</p>
        <div className="space-y-4">
          {HOW_IT_WORKS_STEPS.map((s) => (
            <div key={s.n} className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-400 flex items-center justify-center shrink-0">
                <s.icon size={16} className="text-amber-900" />
              </div>
              <div>
                <p className="text-sm font-bold text-gray-900">{s.n}. {s.label}</p>
                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{s.sub}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-end mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-amber-900 bg-amber-400 hover:bg-amber-500 rounded-xl transition-colors"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}

const HISTORY_LABELS: Record<string, string> = {
  created: "Creación",
  updated: "Edición",
  deleted: "Eliminación",
  relaunched: "Relanzamiento",
  scheduled: "Programación",
};

function HistoryModal({
  entries,
  loading,
  onClose,
}: {
  entries: CampaignHistoryEntry[];
  loading?: boolean;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm cursor-pointer" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <History size={18} className="text-amber-600" /> Historial de la campaña
          </h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-xs text-gray-400">
              <RefreshCw size={14} className="animate-spin" /> Cargando historial…
            </div>
          ) : entries.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">Sin eventos registrados</p>
          ) : (
            <div className="space-y-3">
              {entries.map((e) => (
                <div key={e.id} className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-gray-800">
                        {HISTORY_LABELS[e.action] ?? e.action}
                        {e.status && (
                          <span className="ml-1.5 text-[10px] font-bold text-gray-400 uppercase">
                            {STATUS_CFG[e.status as CampaignStatus]?.label ?? e.status}
                          </span>
                        )}
                      </p>
                      <p className="text-[10px] text-gray-400">{new Date(e.createdAt).toLocaleString()}</p>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {e.action === "created" &&
                        `Campaña creada · ${e.details?.messages ?? 0} mensajes · modo ${e.details?.mode ?? "multi"}`}
                      {e.action === "updated" && "Contenido y ajustes modificados"}
                      {e.action === "deleted" && "Campaña eliminada (el historial se conserva)"}
                      {e.action === "relaunched" &&
                        `Relanzada · ${e.details?.recipientsCount ?? 0} destinatarios re-segmentados · modo ${e.details?.mode ?? "multi"}`}
                      {e.action === "scheduled" && `Programada para ${e.details?.scheduledAt ?? "—"}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EditCampaignModal({
  id,
  onClose,
  onSaved,
}: {
  id: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [campaign, setCampaign] = useState<ApiCampaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [msgs, setMsgs] = useState<Record<string, { subject: string; content: string }>>({});
  const [scheduled, setScheduled] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:00");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    campaignsService
      .get(id)
      .then((c) => {
        if (cancelled) return;
        setCampaign(c);
        setName(c.name);
        const m: Record<string, { subject: string; content: string }> = {};
        for (const msg of c.messages) {
          m[msg.channel] = { subject: msg.subject ?? "", content: msg.content ?? "" };
        }
        setMsgs(m);
        setScheduled(!!c.scheduledAt);
        if (c.scheduledAt) {
          const d = new Date(c.scheduledAt);
          setDate(d.toISOString().slice(0, 10));
          setTime(d.toISOString().slice(11, 16));
        }
        setLoading(false);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "No se pudo cargar la campaña");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const save = async () => {
    if (!campaign) return;
    setSaving(true);
    setError(null);
    try {
      const messages = campaign.channels.map((ch) => ({
        channel: ch,
        subject: ch === "email" ? msgs[ch]?.subject ?? "" : undefined,
        content: msgs[ch]?.content ?? "",
      }));
      await campaignsService.update(id, {
        name,
        messages,
        ...(scheduled
          ? { scheduledAt: `${date || new Date().toISOString().slice(0, 10)}T${time || "09:00"}:00`, status: "programada" as const }
          : {}),
      });
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error guardando la campaña");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm cursor-pointer" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Pencil size={17} className="text-amber-600" /> Editar campaña
          </h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-xs text-gray-400">
              <RefreshCw size={14} className="animate-spin" /> Cargando…
            </div>
          ) : error ? (
            <div className="text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">⚠ {error}</div>
          ) : campaign ? (
            <>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Nombre</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white"
                />
              </div>

              <div className="space-y-3">
                {campaign.channels.map((ch) => {
                  const cfg = CHANNEL_CFG[ch as keyof typeof CHANNEL_CFG];
                  return (
                    <div key={ch} className="rounded-xl border border-gray-100 p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`w-6 h-6 rounded-lg flex items-center justify-center ${cfg.bg}`}>
                          <cfg.icon size={12} className="text-white" />
                        </span>
                        <span className="text-xs font-bold text-gray-700">{cfg.label}</span>
                      </div>
                      {ch === "email" && (
                        <input
                          value={msgs[ch]?.subject ?? ""}
                          onChange={(e) => setMsgs((prev) => ({ ...prev, [ch]: { ...prev[ch], subject: e.target.value } }))}
                          placeholder="Asunto"
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl mb-2 focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white"
                        />
                      )}
                      <textarea
                        value={msgs[ch]?.content ?? ""}
                        onChange={(e) => setMsgs((prev) => ({ ...prev, [ch]: { ...prev[ch], content: e.target.value } }))}
                        placeholder="Contenido del mensaje…"
                        rows={3}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white resize-y"
                      />
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-800">¿Programar el envío?</p>
                <div className="flex items-center bg-gray-100 rounded-xl p-1">
                  <button onClick={() => setScheduled(false)} className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${!scheduled ? "bg-white shadow-sm text-gray-800" : "text-gray-500"}`}>
                    Ahora
                  </button>
                  <button onClick={() => setScheduled(true)} className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${scheduled ? "bg-white shadow-sm text-gray-800" : "text-gray-500"}`}>
                    Programar
                  </button>
                </div>
              </div>
              {scheduled && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Fecha</label>
                    <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Hora</label>
                    <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white" />
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>

        <div className="shrink-0 px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-2">
          {error && <p className="text-xs font-semibold text-red-600 flex-1">⚠ {error}</p>}
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-xs font-bold text-gray-500 hover:bg-gray-100 rounded-xl transition-colors">
              Cancelar
            </button>
            <button
              onClick={() => void save()}
              disabled={saving || loading}
              className="px-4 py-2 text-xs font-bold text-amber-900 bg-amber-400 hover:bg-amber-500 rounded-xl transition-all disabled:opacity-50"
            >
              {saving ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Campaign list ─────────────────────────────── */
function CampaignCard({
  c,
  onViewClients,
  onManualSeg,
  onEdit,
  onRelaunch,
  onHistory,
  onDelete,
}: {
  c: CampaignCardData;
  onViewClients: () => void;
  onManualSeg: () => void;
  onEdit: () => void;
  onRelaunch: () => void;
  onHistory: () => void;
  onDelete: () => void;
}) {
  const cfg = STATUS_CFG[c.status];
  const openRate = c.sent > 0 ? Math.round((c.opens / c.sent) * 100) : 0;
  const isManual = c.audienceMode === "manual";

  return (
    <div className="relative flex flex-col h-full bg-white rounded-2xl border border-gray-100 p-5 hover:shadow-md transition-shadow">
      {/* Encabezado: título completo + estado y fecha en la esquina */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-mono font-bold text-gray-400 tracking-wider">{campaignCode(c.id)}</p>
          <p className="font-bold text-gray-900 leading-snug break-words">{c.name}</p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
            {cfg.label}
          </span>
          {c.date && (
            <span className="flex items-center gap-1 text-[10px] font-medium text-gray-400 tabular-nums">
              <Calendar size={10} /> {c.date}
            </span>
          )}
        </div>
      </div>

      {/* Productos (completos) */}
      <p className="text-xs text-gray-500 mt-2 leading-relaxed break-words">{c.product}</p>

      {/* Canales */}
      <div className="flex flex-wrap items-center gap-1.5 mt-3">
        {c.channels.map((ch) => {
          const cc = CHANNEL_CFG[ch as keyof typeof CHANNEL_CFG];
          return (
            <span
              key={ch}
              className={`inline-flex items-center gap-1 pl-1.5 pr-2 py-0.5 rounded-full text-[10px] font-bold text-white ${cc.bg}`}
            >
              <cc.icon size={11} />
              {cc.label}
            </span>
          );
        })}
      </div>

      {/* Clientes (bloque aparte) */}
      <button
        onClick={onViewClients}
        title="Ver clientes segmentados"
        className="mt-3 w-full flex items-center justify-between gap-2 rounded-xl bg-amber-50 border border-amber-100 px-3 py-2 hover:bg-amber-100 hover:border-amber-200 transition-colors cursor-pointer"
      >
        <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-800">
          <Users size={13} /> Público objetivo
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-sm font-bold text-amber-900 tabular-nums">{c.audience.toLocaleString()}</span>
          {c.audienceMode && c.audienceMode !== "auto" && (
            <span
              title="Origen del público actual"
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${
                isManual
                  ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                  : "text-purple-700 bg-purple-50 border-purple-200"
              }`}
            >
              {isManual ? "Manual" : "Mixto"}
            </span>
          )}
        </span>
      </button>

      {/* Métricas */}
      <div className="flex-1 mt-3">
        {c.sent > 0 ? (
          <>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Enviados", value: c.sent.toLocaleString(), color: "text-gray-800" },
                { label: "Abiertos", value: c.opens.toLocaleString(), color: "text-blue-700" },
                { label: "Conversiones", value: c.conversions.toLocaleString(), color: "text-green-700" },
              ].map((s) => (
                <div key={s.label} className="bg-gray-50 rounded-xl p-2.5 text-center">
                  <p className={`text-sm font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-[10px] text-gray-400">{s.label}</p>
                </div>
              ))}
            </div>
            <div className="mt-3">
              <div className="flex items-center justify-between text-[10px] text-gray-400 mb-1">
                <span>Tasa de apertura</span>
                <span className="font-bold text-gray-600">{openRate}%</span>
              </div>
              <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${openRate}%` }} />
              </div>
            </div>
          </>
        ) : (
          <div className="h-11 bg-gray-50 rounded-xl flex items-center justify-center">
            <p className="text-xs text-gray-400 flex items-center gap-1">
              <Clock size={11} /> {c.status === "programada" ? `Programada para ${c.date}` : "Borrador — sin enviar"}
            </p>
          </div>
        )}
      </div>

      {/* Acciones (un solo contenedor) */}
      <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-1.5">
        <button
          onClick={onRelaunch}
          title="Relanzar"
          className="flex-1 h-9 flex items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 hover:border-emerald-300 transition-colors cursor-pointer"
        >
          <RotateCw size={15} />
        </button>
        <button
          onClick={onHistory}
          title="Historial"
          className="flex-1 h-9 flex items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100 hover:border-gray-300 transition-colors cursor-pointer"
        >
          <History size={15} />
        </button>
        <button
          onClick={onDelete}
          title="Eliminar"
          className="flex-1 h-9 flex items-center justify-center rounded-xl border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 hover:border-red-300 transition-colors cursor-pointer"
        >
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );
}

/* ─── Vista tabla (alternativa a las tarjetas) ──── */
function CampaignRow({
  c,
  onViewClients,
  onManualSeg,
  onEdit,
  onRelaunch,
  onHistory,
  onDelete,
}: {
  c: CampaignCardData;
  onViewClients: () => void;
  onManualSeg: () => void;
  onEdit: () => void;
  onRelaunch: () => void;
  onHistory: () => void;
  onDelete: () => void;
}) {
  const cfg = STATUS_CFG[c.status];
  const openRate = c.sent > 0 ? Math.round((c.opens / c.sent) * 100) : 0;
  const td = "py-3.5 px-3 align-middle border-b border-gray-100";
  const dash = <span className="text-xs text-gray-300">—</span>;
  const [y, m, d] = (c.date || "").split("-");
  const shortDate = y && m && d ? `${d}/${m}/${y.slice(2)}` : "—";
  return (
    <tr className="hover:bg-gray-50/70 transition-colors">
      <td className={td}>
        <p className="text-[10px] font-mono font-bold text-gray-400 tracking-wider">{campaignCode(c.id)}</p>
        <p className="font-semibold text-sm text-gray-900 truncate mt-0.5">{c.name}</p>
        <p className="text-xs text-gray-400 truncate mt-0.5">{c.product}</p>
      </td>
      <td className={`${td} hidden sm:table-cell`}>
        <div className="flex flex-wrap items-center gap-1.5">
          {c.channels.map((ch) => {
            const cc = CHANNEL_CFG[ch as keyof typeof CHANNEL_CFG];
            return (
              <div key={ch} className={`w-5 h-5 rounded-md flex items-center justify-center ${cc.bg}`}>
                <cc.icon size={11} className="text-white" />
              </div>
            );
          })}
        </div>
      </td>
      <td className={td}>
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
          <button
            onClick={onViewClients}
            className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 font-semibold transition-colors tabular-nums"
            title="Ver clientes segmentados"
          >
            <Users size={12} /> {c.audience.toLocaleString()}
          </button>
          {c.audienceMode && c.audienceMode !== "auto" && (
            <span
              title="Origen del público actual"
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${
                c.audienceMode === "manual"
                  ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                  : "text-purple-700 bg-purple-50 border-purple-200"
              }`}
            >
              {c.audienceMode === "manual" ? "Manual" : "Mixto"}
            </span>
          )}
        </div>
      </td>
      <td className={td}>
        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
          {cfg.label}
        </span>
      </td>
      <td className={`${td} hidden md:table-cell text-right`}>
        {c.sent > 0 ? (
          <div className="flex items-center justify-end gap-2">
            <span className="text-sm font-semibold text-blue-700 tabular-nums">{c.opens.toLocaleString()}</span>
            <span className="text-[10px] font-medium text-gray-400 tabular-nums w-8 text-right">{openRate}%</span>
          </div>
        ) : (
          dash
        )}
      </td>
      <td className={`${td} hidden lg:table-cell text-xs text-gray-400 tabular-nums`}>
        {shortDate}
      </td>
      <td className="py-3.5 pl-1 pr-3 align-middle border-b border-gray-100 text-right">
        <div className="inline-flex flex-wrap items-center justify-end gap-0.5">
          <button
            onClick={onRelaunch}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-emerald-600 transition-colors"
            title="Relanzar"
          >
            <RotateCw size={14} />
          </button>
          <button
            onClick={onHistory}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
            title="Historial"
          >
            <History size={14} />
          </button>
          <button
            onClick={onDelete}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
            title="Eliminar"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </td>
    </tr>
  );
}

function CampaignTable({
  campaigns,
  onViewClients,
  onManualSeg,
  onEdit,
  onRelaunch,
  onHistory,
  onDelete,
}: {
  campaigns: CampaignCardData[];
  onViewClients: (c: CampaignCardData) => void;
  onManualSeg: (c: CampaignCardData) => void;
  onEdit: (c: CampaignCardData) => void;
  onRelaunch: (c: CampaignCardData) => void;
  onHistory: (c: CampaignCardData) => void;
  onDelete: (c: CampaignCardData) => void;
}) {
  const thBase = "sticky top-0 z-10 text-[11px] font-bold text-gray-400 uppercase tracking-wider px-3 py-3 bg-gray-50 border-b border-gray-100";
  return (
    <div className="bg-white rounded-2xl border border-gray-100">
      <table className="w-full table-fixed border-separate border-spacing-0">
        <thead>
          <tr>
            <th className={`${thBase} text-left rounded-tl-2xl w-[25%]`}>Campaña</th>
            <th className={`${thBase} text-left hidden sm:table-cell w-[10%]`}>Canales</th>
            <th className={`${thBase} text-left w-[14%]`}>Público</th>
            <th className={`${thBase} text-left w-[11%]`}>Estado</th>
            <th className={`${thBase} text-right hidden md:table-cell w-[12%]`}>Abiertos</th>
            <th className={`${thBase} text-left hidden lg:table-cell w-[12%]`}>Fecha</th>
            <th className={`${thBase} text-right rounded-tr-2xl w-[16%]`}>Acciones</th>
          </tr>
        </thead>
        <tbody className="[&>tr:last-child>td]:border-b-0">
          {campaigns.map((c) => (
            <CampaignRow
              key={c.id}
              c={c}
              onViewClients={() => onViewClients(c)}
              onManualSeg={() => onManualSeg(c)}
              onEdit={() => onEdit(c)}
              onRelaunch={() => onRelaunch(c)}
              onHistory={() => onHistory(c)}
              onDelete={() => onDelete(c)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Main view ─────────────────────────────────── */
export default function Campaigns() {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [campaigns, setCampaigns] = useState<CampaignCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<CampaignStatus | "todos">("todos");
  const [search, setSearch] = useState("");
  const [productFilter, setProductFilter] = useState<ProductPick[]>([]);
  const [productFilterOpen, setProductFilterOpen] = useState(false);
  const [clientsModal, setClientsModal] = useState<CampaignCardData | null>(null);
  const [manualSeg, setManualSeg] = useState<CampaignCardData | null>(null);

  // Modal "cómo funciona" (3 pasos): se auto-abre la primera vez que se entra
  // a la pantalla; luego solo desde el botón junto al título.
  const [howItWorksOpen, setHowItWorksOpen] = useState(() => {
    try {
      return localStorage.getItem(HOW_IT_WORKS_SEEN_KEY) !== "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (!howItWorksOpen) return;
    try {
      localStorage.setItem(HOW_IT_WORKS_SEEN_KEY, "1");
    } catch {
      /* localStorage no disponible */
    }
  }, [howItWorksOpen]);

  // Vista del listado: tarjetas (grid, actual) o tabla. Se recuerda en localStorage.
  const [view, setView] = useState<CampaignsView>(() => {
    try {
      return localStorage.getItem(CAMPAIGNS_VIEW_KEY) === "table" ? "table" : "grid";
    } catch {
      return "grid";
    }
  });
  const changeView = (v: CampaignsView) => {
    setView(v);
    try {
      localStorage.setItem(CAMPAIGNS_VIEW_KEY, v);
    } catch {
      /* localStorage no disponible */
    }
  };

  // Acciones: editar / eliminar / relanzar / historial
  const [editing, setEditing] = useState<CampaignCardData | null>(null);
  const [deleting, setDeleting] = useState<CampaignCardData | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [relaunching, setRelaunching] = useState<CampaignCardData | null>(null);
  const [historyOf, setHistoryOf] = useState<CampaignCardData | null>(null);
  const [historyEntries, setHistoryEntries] = useState<CampaignHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const list = await campaignsService.list();
      setCampaigns(list.map(apiToCard));
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "No se pudieron cargar las campañas");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleCreated = (c: CampaignCardData) => {
    setCampaigns((prev) => [c, ...prev]);
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await campaignsService.remove(deleting.id);
      setCampaigns((prev) => prev.filter((c) => c.id !== deleting.id));
      setDeleting(null);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "No se pudo eliminar la campaña");
    } finally {
      setDeleteBusy(false);
    }
  };

  const handleOpenHistory = async (c: CampaignCardData) => {
    setHistoryOf(c);
    setHistoryLoading(true);
    try {
      setHistoryEntries(await campaignsService.history(c.id));
    } catch {
      setHistoryEntries([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const filtered = campaigns.filter((c) => {
    const matchStatus = statusFilter === "todos" || c.status === statusFilter;
    const q = search.trim().toLowerCase();
    const code = campaignCode(c.id).toLowerCase();
    const matchSearch =
      !q ||
      c.name.toLowerCase().includes(q) ||
      c.product.toLowerCase().includes(q) ||
      code.includes(q) ||
      String(c.id).includes(q);
    const matchProduct =
      !productFilter.length ||
      c.productIds.some((id) => productFilter.some((p) => p.id === id));
    return matchStatus && matchSearch && matchProduct;
  });

  const activas = campaigns.filter((c) => c.status === "enviando" || c.status === "programada").length;
  const totalSent = campaigns.reduce((a, c) => a + c.sent, 0);
  const avgOpen = campaigns.filter((c) => c.sent > 0).reduce((a, c, _, arr) => a + Math.round((c.opens / c.sent) * 100) / arr.length, 0);
  const totalConv = campaigns.reduce((a, c) => a + c.conversions, 0);

  return (
    <>
      <div className="p-6 h-full flex flex-col gap-5 min-h-0">
        {/* Header */}
        <div className="flex items-center justify-between shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900">Campañas</h1>
              <button
                onClick={() => setHowItWorksOpen(true)}
                title="Cómo funciona"
                aria-label="Cómo funciona"
                className="w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
              >
                <Info size={16} />
              </button>
            </div>
            <p className="text-sm text-gray-500 mt-0.5">Automatización de marketing omnicanal en 3 pasos</p>
          </div>
          <button
            onClick={() => setWizardOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-amber-900 bg-amber-400 hover:bg-amber-500 rounded-xl transition-colors shadow-sm hover:shadow-md"
          >
            <Plus size={15} /> Nueva Campaña
          </button>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
          {[
            { label: "Campañas activas", value: String(activas), icon: Zap, color: "bg-amber-100 text-amber-600" },
            { label: "Mensajes enviados", value: totalSent.toLocaleString(), icon: Send, color: "bg-blue-100 text-blue-600" },
            { label: "Tasa de apertura prom.", value: `${avgOpen.toFixed(0)}%`, icon: Eye, color: "bg-green-100 text-green-600" },
            { label: "Conversiones totales", value: totalConv.toLocaleString(), icon: TrendingUp, color: "bg-purple-100 text-purple-600" },
          ].map((k) => (
            <div key={k.label} className="bg-white rounded-2xl border border-gray-100 p-5 hover:shadow-sm transition-shadow">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${k.color}`}>
                <k.icon size={16} />
              </div>
              <p className="text-2xl font-bold text-gray-900">{k.value}</p>
              <p className="text-xs text-gray-500 mt-1">{k.label}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap shrink-0">
          <button
            onClick={() => setProductFilterOpen(true)}
            title="Filtrar campañas por producto"
            className={`flex items-center gap-2 px-3.5 py-2.5 text-sm font-semibold rounded-xl border transition-colors shrink-0 ${
              productFilter.length
                ? "bg-amber-400 text-amber-900 border-transparent shadow-sm"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
            }`}
          >
            <Filter size={15} />
            Producto
            {productFilter.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-white/70 text-amber-900 text-[10px] font-bold">
                {productFilter.length}
              </span>
            )}
          </button>
          <div className="relative flex-1 min-w-56">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre o código..."
              className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white"
            />
          </div>
          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl p-1">
            {(["todos", "borrador", "programada", "enviando", "enviada", "fallida"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg capitalize transition-all ${statusFilter === f ? "bg-amber-400 text-amber-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
              >
                {f === "todos" ? "Todas" : STATUS_CFG[f as CampaignStatus]?.label ?? f}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl p-1" role="group" aria-label="Vista del listado">
            <button
              onClick={() => changeView("grid")}
              title="Vista de tarjetas"
              aria-label="Vista de tarjetas"
              className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${view === "grid" ? "bg-amber-400 text-amber-900" : "text-gray-400 hover:text-gray-600"}`}
            >
              <LayoutGrid size={15} />
            </button>
            <button
              onClick={() => changeView("table")}
              title="Vista de tabla"
              aria-label="Vista de tabla"
              className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${view === "table" ? "bg-amber-400 text-amber-900" : "text-gray-400 hover:text-gray-600"}`}
            >
              <List size={15} />
            </button>
          </div>
        </div>

        {/* Listado — scroll propio para que al filtrar no se mueva la página */}
        <div className="flex-1 min-h-0 overflow-y-auto [scrollbar-gutter:stable]">
        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-48 bg-white rounded-2xl border border-gray-100 animate-pulse" />
            ))}
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-sm font-semibold text-red-600">{loadError}</p>
            <button onClick={() => void load()} className="mt-4 px-4 py-2 text-xs font-bold text-amber-900 bg-amber-400 rounded-xl hover:bg-amber-500 transition-colors">
              Reintentar
            </button>
          </div>
        ) : filtered.length > 0 ? (
          view === "grid" ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((c) => (
                <CampaignCard
                  key={c.id}
                  c={c}
                  onViewClients={() => setClientsModal(c)}
                  onManualSeg={() => setManualSeg(c)}
                  onEdit={() => setEditing(c)}
                  onRelaunch={() => setRelaunching(c)}
                  onHistory={() => void handleOpenHistory(c)}
                  onDelete={() => setDeleting(c)}
                />
              ))}
            </div>
          ) : (
            <CampaignTable
              campaigns={filtered}
              onViewClients={(c) => setClientsModal(c)}
              onManualSeg={(c) => setManualSeg(c)}
              onEdit={(c) => setEditing(c)}
              onRelaunch={(c) => setRelaunching(c)}
              onHistory={(c) => void handleOpenHistory(c)}
              onDelete={(c) => setDeleting(c)}
            />
          )
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
              <BarChart2 size={24} className="text-gray-400" />
            </div>
            <p className="text-sm font-semibold text-gray-700">Sin campañas</p>
            <p className="text-xs text-gray-400 mt-1 mb-4">Crea tu primera campaña omnicanal ahora</p>
            <button
              onClick={() => setWizardOpen(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-amber-900 bg-amber-400 hover:bg-amber-500 rounded-xl transition-colors"
            >
              <Plus size={14} /> Nueva Campaña
            </button>
          </div>
        )}
        </div>
      </div>

      {wizardOpen && (
        <CampaignWizard onClose={() => setWizardOpen(false)} onCreated={handleCreated} />
      )}

      {howItWorksOpen && <HowItWorksModal onClose={() => setHowItWorksOpen(false)} />}

      {productFilterOpen && (
        <ProductFilterModal
          selected={productFilter}
          onChange={setProductFilter}
          onClose={() => setProductFilterOpen(false)}
        />
      )}

      {clientsModal && (
        <RecipientsModal
          title="Público de la campaña"
          subtitle={clientsModal.name}
          campaignId={clientsModal.id}
          audienceMode={clientsModal.audienceMode ?? "auto"}
          onAudienceChange={(m, count) => {
            // Refleja en la tarjeta y en el modal el público elegido.
            const apply = (c: CampaignCardData) =>
              c.id === clientsModal.id
                ? { ...c, audience: count, audienceMode: (m ?? "auto") as "auto" | "manual" | "mixed" }
                : c;
            setCampaigns((prev) => prev.map(apply));
            setClientsModal((prev) => (prev ? apply(prev) : prev));
          }}
          onClose={() => setClientsModal(null)}
        />
      )}

      {manualSeg && (
        <ManualSegModal
          campaignId={manualSeg.id}
          campaignName={manualSeg.name}
          onAdded={() => void load()}
          onClose={() => setManualSeg(null)}
        />
      )}

      {editing && (
        <EditCampaignModal
          id={editing.id}
          onClose={() => setEditing(null)}
          onSaved={() => void load()}
        />
      )}

      {deleting && (
        <ConfirmModal
          title="Eliminar campaña"
          message={`¿Seguro que quieres eliminar "${deleting.name}"? Se quitará de la lista, pero su historial se conserva.`}
          confirmLabel="Eliminar"
          danger
          requireText={deleting.name}
          busy={deleteBusy}
          onConfirm={() => void handleDelete()}
          onClose={() => setDeleting(null)}
        />
      )}

      {relaunching && (
        <RelaunchModal
          campaign={relaunching}
          onRelaunched={(c) => setCampaigns((prev) => prev.map((x) => (x.id === c.id ? c : x)))}
          onClose={() => setRelaunching(null)}
        />
      )}

      {historyOf && (
        <HistoryModal
          entries={historyEntries}
          loading={historyLoading}
          onClose={() => setHistoryOf(null)}
        />
      )}
    </>
  );
}
