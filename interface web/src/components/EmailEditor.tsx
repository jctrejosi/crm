import { useRef, useState } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Check,
  ChevronDown,
  Copy,
  Columns2,
  GripVertical,
  Maximize2,
  Minus,
  MousePointerClick,
  Share2,
  Trash2,
  Type,
  Upload,
  X,
} from "lucide-react";
import { EmailFullPreviewModal } from "./EmailFullPreview";

/* ═══════════════════════════ Tipos ═══════════════════════════ */

export type EmailBlockType =
  | "text"
  | "image"
  | "button"
  | "divider"
  | "columns"
  | "social";

export interface ColumnItem {
  text: string;
  src?: string;
}

export interface EmailBlock {
  id: string;
  type: EmailBlockType;
  props: {
    // text
    text?: string;
    fontSize?: number;
    lineHeight?: number;
    color?: string;
    align?: "left" | "center" | "right";
    bold?: boolean;
    // image
    src?: string;
    alt?: string;
    width?: number;
    height?: number;
    borderRadius?: number;
    borderWidth?: number;
    shadow?: boolean;
    // button / image link
    link?: string;
    bg?: string;
    radius?: number;
    // divider
    thickness?: number;
    dividerColor?: string;
    dividerStyle?: "solid" | "dashed" | "dotted";
    // columns
    columns?: number;
    items?: ColumnItem[];
    // social
    networks?: Record<string, string>;
    iconColor?: string;
    iconSize?: number;
  };
}

export const MERGE_TAGS = [
  { tag: "{{nombre}}", label: "Nombre del cliente" },
  { tag: "{{producto}}", label: "Producto seleccionado" },
  { tag: "{{precio}}", label: "Precio del producto" },
  { tag: "{{descuento}}", label: "Valor del descuento" },
  { tag: "{{cupon}}", label: "Código del cupón" },
  { tag: "{{fecha}}", label: "Fecha del envío" },
  { tag: "{{tienda}}", label: "Nombre de la tienda" },
];

/* ═══════════════════════════ Helpers ═══════════════════════════ */

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function newBlock(type: EmailBlockType): EmailBlock {
  const id = uid();
  switch (type) {
    case "text":
      return {
        id, type,
        props: { text: "Escribe tu texto aquí…", fontSize: 15, color: "#1F2937", align: "left", bold: false },
      };
    case "image":
      return {
        id, type,
        props: { src: "", alt: "Imagen", width: 100, borderRadius: 8, borderWidth: 0, shadow: true, link: "" },
      };
    case "button":
      return {
        id, type,
        props: { text: "Haz clic aquí", link: "https://mercaldas.com", bg: "#FBBF24", color: "#78350F", radius: 10, align: "center" },
      };
    case "divider":
      return {
        id, type,
        props: { thickness: 2, dividerColor: "#E5E7EB", dividerStyle: "solid" },
      };
    case "columns":
      return {
        id, type,
        props: {
          columns: 2,
          items: [
            { text: "Columna 1", src: "" },
            { text: "Columna 2", src: "" },
          ],
        },
      };
    case "social":
      return {
        id, type,
        props: {
          // Todas las redes, vacías por defecto salvo las de Mercaldas.
          networks: {
            ...Object.fromEntries(SOCIAL_NETWORKS.map((n) => [n.key, ""])),
            facebook: "https://facebook.com/mercaldas",
            instagram: "https://instagram.com/mercaldas",
            whatsapp: "https://wa.me/573000000000",
          },
          iconColor: "#6B7280",
          iconSize: 22,
          align: "center",
        },
      };
  }
}

/* ── Redimensionado de bloques ── */
function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

type ResizeTarget = "width" | "fontSize" | "iconSize" | "thickness";

function resizeConfig(type: EmailBlockType): {
  target: ResizeTarget;
  min: number;
  max: number;
  step: number;
  label: string;
} | null {
  switch (type) {
    case "image":
      return { target: "width", min: 25, max: 100, step: 2, label: "ancho" };
    case "text":
      return { target: "fontSize", min: 11, max: 48, step: 1, label: "fuente" };
    case "button":
      return { target: "fontSize", min: 10, max: 24, step: 1, label: "fuente" };
    case "social":
      return { target: "iconSize", min: 16, max: 48, step: 1, label: "íconos" };
    case "divider":
      return { target: "thickness", min: 1, max: 8, step: 1, label: "grosor" };
    default:
      return null;
  }
}

function resizeDefault(type: EmailBlockType, target: ResizeTarget): number {
  switch (target) {
    case "width":
      return 100;
    case "fontSize":
      return type === "text" ? 15 : 14;
    case "iconSize":
      return 22;
    case "thickness":
      return 2;
  }
}

export function defaultTemplate(): EmailBlock[] {
  return [
    { ...newBlock("text"), props: { text: "🛒 Mercaldas", fontSize: 24, color: "#B45309", align: "center", bold: true } },
    newBlock("image"),
    { ...newBlock("text"), props: { text: "Hola {{nombre}},<br/><br/>Tenemos algo especial para ti. {{producto}} está a {{precio}} con un descuento de {{descuento}}.", fontSize: 15, color: "#1F2937", align: "left" } },
    newBlock("button"),
    newBlock("divider"),
    newBlock("social"),
    { ...newBlock("text"), props: { text: "El equipo de Mercaldas 💛<br/>Si no quieres recibir más correos, haz clic aquí.", fontSize: 12, color: "#9CA3AF", align: "center" } },
  ];
}

/* ═══════════════════════════ Iconos de redes (SVG inline) ═══════════════════════════ */

function FacebookIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M13.5 21v-7h2.4l.4-3h-2.8V9.1c0-.9.3-1.5 1.6-1.5h1.3V5.1c-.3 0-1.1-.1-2.1-.1-2.1 0-3.6 1.3-3.6 3.7V11H8.3v3h2.4v7h2.8z" />
    </svg>
  );
}
function InstagramIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}
function WhatsappIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.6-6.1c-.3-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4 0-.5.2-.7l.4-.5c.1-.2.1-.4 0-.6l-.8-1.9c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.9.9-1.2 2.1-.6 3.6a11 11 0 0 0 5.1 5.5c.7.3 1.6.5 2.4.3.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2-.1-.1-.2-.1-.5-.2z" />
    </svg>
  );
}
function YoutubeIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.5 2.5 0 0 0 2.4 7.2 26 26 0 0 0 2 12a26 26 0 0 0 .4 4.8 2.5 2.5 0 0 0 1.8 1.8c1.6.4 7.8.4 7.8.4s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8A26 26 0 0 0 22 12a26 26 0 0 0-.4-4.8zM10 15.2V8.8L15.5 12 10 15.2z" />
    </svg>
  );
}

function TwitterXIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function TiktokIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
    </svg>
  );
}

function LinkedinIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.124 2.062 2.062 0 0 1 0 4.124zM7.119 20.452H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z" />
    </svg>
  );
}

function TelegramIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  );
}

function PinterestIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0a12 12 0 0 0-4.373 23.178c-.098-.937-.187-2.377.039-3.4.204-.873 1.32-5.586 1.32-5.586s-.336-.673-.336-1.667c0-1.56.906-2.727 2.032-2.727.957 0 1.42.719 1.42 1.581 0 .963-.612 2.401-.928 3.735-.264 1.117.56 2.027 1.66 2.027 1.993 0 3.524-2.102 3.524-5.135 0-2.685-1.93-4.562-4.685-4.562-3.19 0-5.062 2.393-5.062 4.865 0 .963.371 1.998.834 2.56.091.111.105.208.078.32-.085.353-.274 1.117-.311 1.273-.049.206-.163.25-.376.15-1.403-.653-2.28-2.705-2.28-4.353 0-3.545 2.576-6.8 7.427-6.8 3.9 0 6.933 2.777 6.933 6.49 0 3.875-2.444 6.994-5.836 6.994-1.14 0-2.211-.592-2.577-1.292 0 0-.563 2.147-.699 2.674-.253.975-.937 2.198-1.396 2.943A12 12 0 1 0 12 0z" />
    </svg>
  );
}

/**
 * Redes soportadas por el bloque "social".
 *  - `icon`: ícono vectorial para la vista previa editable del diseñador.
 *  - `glyph`: glifo de texto usado en el HTML del correo (los clientes de correo
 *    no renderizan SVG de forma fiable, así que se usa un carácter).
 */
const SOCIAL_NETWORKS: {
  key: string;
  label: string;
  icon: (s: number) => React.ReactNode;
  glyph: string;
}[] = [
  { key: "facebook", label: "Facebook", icon: (s) => <FacebookIcon size={s} />, glyph: "f" },
  { key: "instagram", label: "Instagram", icon: (s) => <InstagramIcon size={s} />, glyph: "📷" },
  { key: "x", label: "X (Twitter)", icon: (s) => <TwitterXIcon size={s} />, glyph: "X" },
  { key: "tiktok", label: "TikTok", icon: (s) => <TiktokIcon size={s} />, glyph: "♪" },
  { key: "youtube", label: "YouTube", icon: (s) => <YoutubeIcon size={s} />, glyph: "▶" },
  { key: "linkedin", label: "LinkedIn", icon: (s) => <LinkedinIcon size={s} />, glyph: "in" },
  { key: "pinterest", label: "Pinterest", icon: (s) => <PinterestIcon size={s} />, glyph: "P" },
  { key: "whatsapp", label: "WhatsApp", icon: (s) => <WhatsappIcon size={s} />, glyph: "✆" },
  { key: "telegram", label: "Telegram", icon: (s) => <TelegramIcon size={s} />, glyph: "✈" },
];

const SOCIAL_ICONS: Record<string, (s: number) => React.ReactNode> = Object.fromEntries(
  SOCIAL_NETWORKS.map((n) => [n.key, n.icon] as const),
);

const BLOCK_PALETTE: { type: EmailBlockType; label: string; icon: React.ElementType; hint: string }[] = [
  { type: "text", label: "Texto", icon: Type, hint: "Título o párrafo editable" },
  { type: "image", label: "Imagen", icon: Upload, hint: "Sube o elige del banco" },
  { type: "button", label: "Botón", icon: MousePointerClick, hint: "CTA con enlace" },
  { type: "divider", label: "Divisor", icon: Minus, hint: "Línea separadora" },
  { type: "columns", label: "Columnas", icon: Columns2, hint: "2 o 3 columnas" },
  { type: "social", label: "Social", icon: Share2, hint: "Íconos de redes" },
];

const INTERNAL_IMAGES = [
  "https://images.unsplash.com/photo-1542838132-92c53300491e?w=600&h=300&fit=crop",
  "https://images.unsplash.com/photo-1557844352-761f2565b576?w=600&h=300&fit=crop",
  "https://images.unsplash.com/photo-1607083206968-13611e3d76db?w=600&h=300&fit=crop",
  "https://images.unsplash.com/photo-1604719312566-8912e9227c6a?w=600&h=300&fit=crop",
  "https://images.unsplash.com/photo-1583258292688-d0213dc5a3a8?w=600&h=300&fit=crop",
  "https://images.unsplash.com/photo-1604095853918-1a1823a63dd5?w=600&h=300&fit=crop",
];

/* ═══════════════════════════ Exportar HTML (compatible con correo) ═══════════════════════════ */

export function blocksToHtml(blocks: EmailBlock[]): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  /** Solo permite esquemas seguros en enlaces/imágenes (evita `javascript:`, etc.). */
  const safeUrl = (u: string | undefined, allowDataImage = false) => {
    const v = (u ?? "").trim();
    if (!v) return "";
    if (/^(https?:|mailto:|tel:)/i.test(v) || v.startsWith("#") || v.startsWith("/")) return v;
    if (allowDataImage && /^data:image\//i.test(v)) return v;
    return "";
  };

  const cell = (inner: string, extra = "") =>
    `<tr><td style="padding:12px 24px;${extra}">${inner}</td></tr>`;

  const rows = blocks
    .map((b) => {
      switch (b.type) {
        case "text": {
          const html = (b.props.text ?? "").replace(/\n/g, "<br/>");
          return cell(
            `<div style="font-size:${b.props.fontSize ?? 15}px;color:${b.props.color ?? "#1F2937"};text-align:${b.props.align ?? "left"};font-weight:${b.props.bold ? 700 : 400};line-height:${b.props.lineHeight ?? 1.6};">${html}</div>`,
          );
        }
        case "image": {
          if (!b.props.src) return cell("<div></div>");
          return cell(
            `<a href="${esc(safeUrl(b.props.link))}" style="text-decoration:none;"><img src="${esc(safeUrl(b.props.src, true))}" alt="${esc(b.props.alt ?? "")}" width="${Math.round(560 * (b.props.width ?? 100) / 100)}" style="max-width:100%;border-radius:${b.props.borderRadius ?? 8}px;border:${b.props.borderWidth ?? 0}px solid #E5E7EB;${b.props.shadow ? "box-shadow:0 4px 12px rgba(0,0,0,.08);" : ""}height:${b.props.height ? `${b.props.height}px` : "auto"};object-fit:cover;display:block;" /></a>`,
          );
        }
        case "button": {
          return cell(
            `<div style="text-align:${b.props.align ?? "center"};"><a href="${esc(safeUrl(b.props.link) || "#")}" style="display:inline-block;background:${b.props.bg ?? "#FBBF24"};color:${b.props.color ?? "#78350F"};font-size:14px;font-weight:700;padding:12px 28px;border-radius:${b.props.radius ?? 10}px;text-decoration:none;">${b.props.text ?? ""}</a></div>`,
          );
        }
        case "divider": {
          return cell(
            `<div style="border-top:${b.props.thickness ?? 2}px ${b.props.dividerStyle ?? "solid"} ${b.props.dividerColor ?? "#E5E7EB"};"></div>`,
          );
        }
        case "columns": {
          const n = b.props.columns ?? 2;
          const cols = (b.props.items ?? []).slice(0, n);
          while (cols.length < n) cols.push({ text: "" });
          const tds = cols
            .map(
              (c) =>
                `<td valign="top" style="padding:8px;text-align:center;">${
                  c.src
                    ? `<img src="${esc(safeUrl(c.src, true))}" style="max-width:100%;border-radius:8px;display:block;margin:0 auto 8px;" />`
                    : ""
                }<div style="font-size:13px;color:#374151;line-height:1.5;">${esc(c.text).replace(/\n/g, "<br/>")}</div></td>`,
            )
            .join("");
          return cell(
            `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${tds}</tr></table>`,
          );
        }
        case "social": {
          const nets = Object.entries(b.props.networks ?? {}).filter(([, url]) => url);
          if (!nets.length) return cell("<div></div>");
          const glyph: Record<string, string> = Object.fromEntries(
            SOCIAL_NETWORKS.map((n) => [n.key, n.glyph] as const),
          );
          const links = nets
            .map(
              ([k, url]) =>
                `<a href="${esc(safeUrl(url))}" style="display:inline-block;width:34px;height:34px;line-height:34px;margin:0 4px;border-radius:50%;background:#F3F4F6;color:${b.props.iconColor ?? "#6B7280"};font-weight:700;text-decoration:none;text-align:center;">${glyph[k] ?? k}</a>`,
            )
            .join("");
          return cell(`<div style="text-align:${b.props.align ?? "center"};">${links}</div>`);
        }
      }
      return cell("<div></div>");
    })
    .join("");

  return `<!DOCTYPE html><html><body style="margin:0;background:#F3F4F6;padding:24px 0;font-family:Arial,sans-serif;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;">${rows}</table></td></tr></table></body></html>`;
}

/* ═══════════════════════════ Componente principal ═══════════════════════════ */

export default function EmailEditor({
  initialBlocks,
  onSave,
  onClose,
}: {
  initialBlocks: EmailBlock[];
  onSave: (blocks: EmailBlock[], html: string) => void;
  onClose: () => void;
}) {
  const [blocks, setBlocks] = useState<EmailBlock[]>(() =>
    initialBlocks.length ? initialBlocks : defaultTemplate(),
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    blocks[0]?.id ?? null,
  );
  const [previewOpen, setPreviewOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [htmlOpen, setHtmlOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; after: boolean } | null>(null);
  const resizeSession = useRef<{
    id: string;
    target: ResizeTarget;
    startY: number;
    startVal: number;
    min: number;
    max: number;
    step: number;
  } | null>(null);

  const selected = blocks.find((b) => b.id === selectedId) ?? null;

  const updateBlock = (id: string, props: Partial<EmailBlock["props"]>) => {
    setBlocks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, props: { ...b.props, ...props } } : b)),
    );
  };

  const removeBlock = (id: string) => {
    setBlocks((prev) => prev.filter((b) => b.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const duplicateBlock = (id: string) => {
    setBlocks((prev) => {
      const i = prev.findIndex((b) => b.id === id);
      if (i === -1) return prev;
      const copy = JSON.parse(JSON.stringify(prev[i])) as EmailBlock;
      copy.id = uid();
      const arr = [...prev];
      arr.splice(i + 1, 0, copy);
      setSelectedId(copy.id);
      return arr;
    });
  };

  /* ── Indicador de posición + redimensionado ── */
  const dropAfter = (e: React.DragEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return e.clientY > rect.top + rect.height / 2;
  };

  const beginResize = (e: React.PointerEvent, b: EmailBlock) => {
    const cfg = resizeConfig(b.type);
    if (!cfg || previewOpen) return;
    e.preventDefault();
    e.stopPropagation();
    const startVal =
      b.props[cfg.target] ?? resizeDefault(b.type, cfg.target);
    resizeSession.current = {
      id: b.id,
      target: cfg.target,
      startY: e.clientY,
      startVal,
      min: cfg.min,
      max: cfg.max,
      step: cfg.step,
    };

    const onMove = (ev: PointerEvent) => {
      const s = resizeSession.current;
      if (!s) return;
      const delta = Math.round((ev.clientY - s.startY) / 12) * s.step;
      const val = clamp(s.startVal + delta, s.min, s.max);
      updateBlock(s.id, { [s.target]: val } as Partial<EmailBlock["props"]>);
    };
    const onUp = () => {
      resizeSession.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  /* ── Drag & drop ── */
  const handleDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    const raw = e.dataTransfer.getData("text/email-block");
    if (!raw) return;
    let payload: { kind: "new"; type: EmailBlockType } | { kind: "move"; id: string };
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const after = e.clientY > rect.top + rect.height / 2;
    const insertAt = index + (after ? 1 : 0);

    if (payload.kind === "new") {
      const nb = newBlock(payload.type);
      setBlocks((prev) => {
        const arr = [...prev];
        arr.splice(Math.min(insertAt, arr.length), 0, nb);
        return arr;
      });
      setSelectedId(nb.id);
    } else {
      setBlocks((prev) => {
        const from = prev.findIndex((b) => b.id === payload.id);
        if (from === -1) return prev;
        const arr = [...prev];
        const [moved] = arr.splice(from, 1);
        let to = insertAt;
        if (from < insertAt) to -= 1;
        arr.splice(Math.min(Math.max(to, 0), arr.length), 0, moved);
        return arr;
      });
    }
  };

  const appendAtEnd = (e: React.DragEvent) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData("text/email-block");
    if (!raw) return;
    let payload: { kind: "new"; type: EmailBlockType } | { kind: "move"; id: string };
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }
    if (payload.kind === "new") {
      const nb = newBlock(payload.type);
      setBlocks((prev) => [...prev, nb]);
      setSelectedId(nb.id);
    } else {
      setBlocks((prev) => {
        const b = prev.find((x) => x.id === payload.id);
        if (!b) return prev;
        return [...prev.filter((x) => x.id !== payload.id), b];
      });
    }
  };

  /* ── Merge tags ── */
  const insertMergeTag = (tag: string) => {
    const active = document.activeElement as HTMLElement | null;
    if (active && active.isContentEditable) {
      active.focus();
      document.execCommand("insertHTML", false, `<b style="background:#FEF3C7;color:#92400E;border-radius:4px;padding:0 2px;">${tag}</b>`);
    } else if (selected && selected.type === "text") {
      updateBlock(selected.id, { text: (selected.props.text ?? "") + tag });
    }
    setTagsOpen(false);
  };

  /* ── Render de bloques ── */
  const renderBlockInner = (b: EmailBlock) => {
    switch (b.type) {
      case "text":
        return (
          <EditableText
            block={b}
            onSelect={() => setSelectedId(b.id)}
            onCommit={(text) => updateBlock(b.id, { text })}
          />
        );
      case "image":
        return (
          <div
            onClick={() => setSelectedId(b.id)}
            className="cursor-pointer flex justify-center"
            style={{ width: `${b.props.width ?? 100}%` }}
          >
            {b.props.src ? (
              <img
                src={b.props.src}
                alt={b.props.alt ?? ""}
                className="max-w-full"
                style={{
                  borderRadius: b.props.borderRadius ?? 8,
                  borderWidth: b.props.borderWidth ?? 0,
                  borderStyle: "solid",
                  borderColor: "#E5E7EB",
                  boxShadow: b.props.shadow ? "0 4px 12px rgba(0,0,0,.08)" : undefined,
                  height: b.props.height ? `${b.props.height}px` : undefined,
                  objectFit: b.props.height ? "cover" : undefined,
                }}
              />
            ) : (
              <div
                className="w-full h-36 bg-gray-100 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center gap-2 text-gray-400 cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={20} />
                <span className="text-xs font-medium">Haz clic para subir imagen</span>
              </div>
            )}
          </div>
        );
      case "button":
        return (
          <div
            style={{
              textAlign: (b.props.align ?? "center") as React.CSSProperties["textAlign"],
              width: b.props.width != null ? `${b.props.width}%` : "100%",
            }}
          >
            <span
              contentEditable={!previewOpen}
              suppressContentEditableWarning
              onClick={() => setSelectedId(b.id)}
              onBlur={(e) => updateBlock(b.id, { text: e.currentTarget.innerText })}
              className="inline-flex items-center justify-center cursor-text font-bold"
              style={{
                background: b.props.bg ?? "#FBBF24",
                color: b.props.color ?? "#78350F",
                fontSize: b.props.fontSize ?? 14,
                padding: "12px 28px",
                borderRadius: b.props.radius ?? 10,
                minHeight: b.props.height ? `${b.props.height}px` : undefined,
              }}
            >
              {b.props.text ?? ""}
            </span>
          </div>
        );
      case "divider":
        return (
          <div className="w-full py-1 cursor-pointer" onClick={() => setSelectedId(b.id)}>
            <div
              style={{
                borderTopWidth: b.props.thickness ?? 2,
                borderTopStyle: (b.props.dividerStyle ?? "solid") as React.CSSProperties["borderTopStyle"],
                borderTopColor: b.props.dividerColor ?? "#E5E7EB",
                width: b.props.width != null ? `${b.props.width}%` : "100%",
                margin: "0 auto",
              }}
            />
          </div>
        );
      case "columns": {
        const n = b.props.columns ?? 2;
        const items = (b.props.items ?? []).slice(0, n);
        return (
          <div className="w-full flex gap-3 cursor-pointer" onClick={() => setSelectedId(b.id)}>
            {items.map((c, i) => (
              <div key={i} className="flex-1 min-w-0">
                {c.src && (
                  <img src={c.src} alt="" className="w-full rounded-lg mb-2 object-cover h-24" />
                )}
                <div
                  contentEditable={!previewOpen}
                  suppressContentEditableWarning
                  onBlur={(e) => {
                    const newItems = [...(b.props.items ?? [])];
                    newItems[i] = { ...newItems[i], text: e.currentTarget.innerText };
                    updateBlock(b.id, { items: newItems });
                  }}
                  className="text-xs text-gray-700 outline-none min-h-[20px] leading-relaxed"
                >
                  {c.text}
                </div>
              </div>
            ))}
          </div>
        );
      }
      case "social": {
        const nets = Object.entries(b.props.networks ?? {}).filter(([, url]) => url);
        return (
          <div
            className="flex gap-2 cursor-pointer"
            style={{ justifyContent: b.props.align === "left" ? "flex-start" : b.props.align === "right" ? "flex-end" : "center" }}
            onClick={() => setSelectedId(b.id)}
          >
            {nets.map(([k]) => (
              <span
                key={k}
                className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center"
                style={{ color: b.props.iconColor ?? "#6B7280" }}
              >
                {SOCIAL_ICONS[k]?.(b.props.iconSize ?? 22)}
              </span>
            ))}
          </div>
        );
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-gray-100">
      {/* ══ Toolbar ══ */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-white border-b border-gray-200 shrink-0">
        <p className="font-bold text-gray-900 text-sm">✉️ Diseñador de correo</p>
        <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">arrastra y suelta bloques</span>

        <div className="relative ml-2">
          <button
            onClick={() => setTagsOpen((o) => !o)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 transition-colors"
          >
            {"{ }"} Variables <ChevronDown size={12} />
          </button>
          {tagsOpen && (
            <div className="absolute top-full left-0 mt-1 w-64 bg-white rounded-xl shadow-xl border border-gray-100 z-20 py-1.5">
              <p className="px-3 py-1 text-[10px] text-gray-400 font-semibold uppercase">Campos personalizados</p>
              {MERGE_TAGS.map((t) => (
                <button
                  key={t.tag}
                  onClick={() => insertMergeTag(t.tag)}
                  className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <span className="font-mono text-amber-700">{t.tag}</span>
                  <span className="text-gray-400">{t.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1" />

        <button
          onClick={() => setPreviewOpen(true)}
          className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
        >
          Vista previa
        </button>
        <button
          onClick={() => setHtmlOpen(true)}
          className="px-3 py-1.5 text-xs font-semibold border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
        >
          {"</>"} Exportar HTML
        </button>
        <button
          onClick={() => setBlocks(defaultTemplate())}
          className="px-3 py-1.5 text-xs font-semibold border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Reiniciar plantilla
        </button>
        <button
          onClick={() => {
            (document.activeElement as HTMLElement | null)?.blur?.();
            onSave(blocks, blocksToHtml(blocks));
          }}
          className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold bg-amber-400 text-amber-900 rounded-lg hover:bg-amber-500 transition-colors"
        >
          <Check size={13} /> Guardar
        </button>
        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
          <X size={16} />
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f || !selected) return;
          const reader = new FileReader();
          reader.onload = () => updateBlock(selected.id, { src: String(reader.result) });
          reader.readAsDataURL(f);
          e.target.value = "";
        }}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* ══ Paleta ══ */}
        <aside className="w-56 shrink-0 bg-white border-r border-gray-200 overflow-y-auto p-3">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2 px-1">Bloques</p>
          <div className="space-y-1.5">
            {BLOCK_PALETTE.map((p) => (
              <div
                key={p.type}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/email-block", JSON.stringify({ kind: "new", type: p.type }));
                  e.dataTransfer.effectAllowed = "copy";
                }}
                className="flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl border border-gray-100 bg-gray-50 hover:border-amber-300 hover:bg-amber-50 cursor-grab active:cursor-grabbing transition-colors"
              >
                <p.icon size={15} className="text-gray-500 shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-gray-800 leading-tight">{p.label}</p>
                  <p className="text-[10px] text-gray-400 leading-tight">{p.hint}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-gray-400 mt-4 px-1 leading-relaxed">
            También puedes arrastrar los bloques del lienzo para reordenarlos.
          </p>
        </aside>

        {/* ══ Lienzo ══ */}
        <div className="flex-1 overflow-y-auto py-6">
          <div className="max-w-[620px] mx-auto">
            <div className="bg-white rounded-xl shadow-sm min-h-[300px] p-6 space-y-3">
              {blocks.length === 0 && (
                <div className="h-64 flex items-center justify-center text-gray-300 text-sm border-2 border-dashed border-gray-200 rounded-xl">
                  Arrastra bloques desde la barra lateral
                </div>
              )}
              {blocks.map((b, i) => {
                const isSelected = selectedId === b.id && !previewOpen;
                const resizeCfg = resizeConfig(b.type);
                const showDropTop = dropTarget?.id === b.id && dropTarget.after === false;
                const showDropBottom = dropTarget?.id === b.id && dropTarget.after === true;
                return (
                  <div
                    key={b.id}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDropTarget({ id: b.id, after: dropAfter(e) });
                    }}
                    onDragLeave={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                        setDropTarget(null);
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      handleDrop(e, i);
                      setDropTarget(null);
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedId(b.id);
                    }}
                    className={`relative group rounded-lg transition-all cursor-pointer ${
                      isSelected ? "ring-2 ring-amber-400 bg-amber-50/30" : "ring-1 ring-transparent hover:ring-gray-200"
                    }`}
                  >
                    {/* Indicador de posición de drop */}
                    {showDropTop && (
                      <div className="absolute -top-[7px] left-0 right-0 h-[3px] rounded-full bg-amber-400 z-20" />
                    )}
                    {showDropBottom && (
                      <div className="absolute -bottom-[7px] left-0 right-0 h-[3px] rounded-full bg-amber-400 z-20" />
                    )}

                    {/* Mango de arrastre (reordenar) */}
                    {!previewOpen && (
                      <div className="absolute -left-3 top-1/2 -translate-y-1/2 z-10 hidden group-hover:flex">
                        <div
                          draggable
                          onDragStart={(e) => {
                            e.stopPropagation();
                            e.dataTransfer.setData("text/email-block", JSON.stringify({ kind: "move", id: b.id }));
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          className="w-6 h-8 bg-white border border-gray-200 rounded-md flex items-center justify-center text-gray-400 hover:text-gray-700 shadow-sm cursor-grab active:cursor-grabbing"
                          title="Arrastrar para reordenar"
                        >
                          <GripVertical size={14} />
                        </div>
                      </div>
                    )}

                    {!previewOpen && (
                      <div className="absolute -right-1 -top-1 z-10 hidden group-hover:flex gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); duplicateBlock(b.id); }}
                          className="w-6 h-6 bg-white border border-gray-200 rounded-md flex items-center justify-center text-gray-400 hover:text-gray-700 shadow-sm"
                          title="Duplicar"
                        >
                          <Copy size={11} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); removeBlock(b.id); }}
                          className="w-6 h-6 bg-white border border-gray-200 rounded-md flex items-center justify-center text-gray-400 hover:text-red-600 shadow-sm"
                          title="Eliminar"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    )}

                    {/* Mango de redimensionado */}
                    {!previewOpen && isSelected && resizeCfg && (
                      <div
                        onPointerDown={(e) => beginResize(e, b)}
                        className="absolute -right-2 -bottom-2 z-20 w-6 h-6 bg-white border border-amber-300 rounded-full flex items-center justify-center text-amber-600 shadow-sm cursor-nwse-resize hover:bg-amber-50"
                        title={`Redimensionar ${resizeCfg.label}`}
                      >
                        <Maximize2 size={11} className="-rotate-45" />
                      </div>
                    )}

                    {renderBlockInner(b)}
                  </div>
                );
              })}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={appendAtEnd}
                className="h-14 rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center text-[11px] text-gray-300"
              >
                Suelta un bloque aquí
              </div>
            </div>
          </div>
        </div>

        {/* ══ Panel de propiedades ══ */}
        <aside className="w-64 shrink-0 bg-white border-l border-gray-200 overflow-y-auto">
          <PropertiesPanel
            block={selected}
            onChange={(props) => selected && updateBlock(selected.id, props)}
            onUpload={() => fileInputRef.current?.click()}
            onRemove={() => selected && removeBlock(selected.id)}
          />
        </aside>
      </div>

      {/* ══ Modal exportar HTML ══ */}
      {htmlOpen && (
        <div className="fixed inset-0 z-[80] bg-black/40 flex items-center justify-center p-6 cursor-pointer" onClick={() => setHtmlOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <p className="font-bold text-gray-900 text-sm">HTML del correo</p>
              <button onClick={() => setHtmlOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
            </div>
            <textarea
              readOnly
              value={blocksToHtml(blocks)}
              className="w-full h-72 text-[10px] font-mono border border-gray-200 rounded-xl p-3 focus:outline-none bg-gray-50"
            />
            <div className="flex justify-end mt-3">
              <button
                onClick={() => navigator.clipboard?.writeText(blocksToHtml(blocks))}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-amber-400 text-amber-900 rounded-xl hover:bg-amber-500 transition-colors"
              >
                <Copy size={12} /> Copiar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Modal vista previa ══ */}
      {previewOpen && (
        <EmailFullPreviewModal html={blocksToHtml(blocks)} onClose={() => setPreviewOpen(false)} />
      )}
    </div>
  );
}

/* ═══════════════════════════ Texto editable inline ═══════════════════════════ */

function EditableText({
  block,
  onSelect,
  onCommit,
}: {
  block: EmailBlock;
  onSelect: () => void;
  onCommit: (text: string) => void;
}) {
  return (
    <div
      contentEditable
      suppressContentEditableWarning
      dangerouslySetInnerHTML={{ __html: block.props.text ?? "" }}
      onFocus={onSelect}
      onBlur={(e) => onCommit(e.currentTarget.innerHTML)}
      className="outline-none w-full min-h-[18px] leading-relaxed cursor-text"
      style={{
        fontSize: block.props.fontSize ?? 15,
        lineHeight: block.props.lineHeight ?? 1.6,
        color: block.props.color ?? "#1F2937",
        textAlign: (block.props.align ?? "left") as React.CSSProperties["textAlign"],
        fontWeight: block.props.bold ? 700 : 400,
      }}
    />
  );
}

/* ═══════════════════════════ Panel de propiedades ═══════════════════════════ */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">{label}</p>
      {children}
    </div>
  );
}

const inputCls =
  "w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white";

function PropertiesPanel({
  block,
  onChange,
  onUpload,
  onRemove,
}: {
  block: EmailBlock | null;
  onChange: (props: Partial<EmailBlock["props"]>) => void;
  onUpload: () => void;
  onRemove: () => void;
}) {
  if (!block) {
    return (
      <div className="p-4 text-center text-xs text-gray-400">
        Selecciona un bloque en el lienzo para editar sus propiedades.
      </div>
    );
  }

  const p = block.props;

  return (
    <div className="p-4">
      <p className="text-xs font-bold text-gray-900 mb-3">
        {BLOCK_PALETTE.find((x) => x.type === block.type)?.label} <span className="text-gray-300">· propiedades</span>
      </p>

      {block.type === "text" && (
        <>
          <Field label={`Tamaño de fuente (${p.fontSize ?? 15}px)`}>
            <input
              type="range" min={10} max={40} value={p.fontSize ?? 15}
              onChange={(e) => onChange({ fontSize: Number(e.target.value) })}
              className="w-full"
            />
          </Field>
          <Field label={`Alto de línea (${p.lineHeight ?? 1.6})`}>
            <input
              type="range" min={1} max={2.5} step={0.1} value={p.lineHeight ?? 1.6}
              onChange={(e) => onChange({ lineHeight: Number(e.target.value) })}
              className="w-full"
            />
          </Field>
          <Field label="Color">
            <input type="color" value={p.color ?? "#1F2937"} onChange={(e) => onChange({ color: e.target.value })} className="w-full h-8 rounded-lg border border-gray-200 bg-white cursor-pointer" />
          </Field>
          <Field label="Alineación">
            <div className="flex gap-1.5">
              {(["left", "center", "right"] as const).map((a) => {
                const Icon = a === "left" ? AlignLeft : a === "center" ? AlignCenter : AlignRight;
                return (
                  <button
                    key={a}
                    onClick={() => onChange({ align: a })}
                    className={`flex-1 py-1.5 rounded-lg border flex items-center justify-center transition-colors ${p.align === a ? "bg-amber-100 border-amber-300 text-amber-700" : "border-gray-200 text-gray-400 hover:bg-gray-50"}`}
                  >
                    <Icon size={13} />
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => onChange({ bold: !(p.bold ?? false) })}
              className={`mt-2 w-full py-1.5 rounded-lg border flex items-center justify-center gap-1 text-xs font-semibold transition-colors ${p.bold ? "bg-amber-100 border-amber-300 text-amber-700" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}
            >
              <Bold size={12} /> Negrita
            </button>
          </Field>
        </>
      )}

      {block.type === "image" && (
        <>
          <Field label="Imagen">
            <button onClick={onUpload} className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-semibold border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors">
              <Upload size={12} /> Subir desde equipo
            </button>
            <input
              placeholder="o pega una URL…"
              value={p.src ?? ""}
              onChange={(e) => onChange({ src: e.target.value })}
              className={`${inputCls} mt-1.5`}
            />
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mt-3 mb-1">Banco de imágenes</p>
            <div className="grid grid-cols-3 gap-1.5">
              {INTERNAL_IMAGES.map((src) => (
                <button key={src} onClick={() => onChange({ src })} className="h-12 rounded-lg overflow-hidden border-2 border-transparent hover:border-amber-400 transition-colors">
                  <img src={src} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </Field>
          <Field label={`Ancho (${p.width ?? 100}%)`}>
            <input type="range" min={30} max={100} value={p.width ?? 100} onChange={(e) => onChange({ width: Number(e.target.value) })} className="w-full" />
          </Field>
          <Field label={`Alto (${p.height ? `${p.height}px` : "auto"})`}>
            <input type="range" min={0} max={600} value={p.height ?? 0} onChange={(e) => onChange({ height: Number(e.target.value) || undefined })} className="w-full" />
          </Field>
          <Field label={`Borde redondeado (${p.borderRadius ?? 8}px)`}>
            <input type="range" min={0} max={40} value={p.borderRadius ?? 8} onChange={(e) => onChange({ borderRadius: Number(e.target.value) })} className="w-full" />
          </Field>
          <Field label="Borde y sombra">
            <input type="range" min={0} max={10} value={p.borderWidth ?? 0} onChange={(e) => onChange({ borderWidth: Number(e.target.value) })} className="w-full" />
            <label className="flex items-center gap-2 text-xs text-gray-600 mt-1.5">
              <input type="checkbox" checked={p.shadow ?? true} onChange={(e) => onChange({ shadow: e.target.checked })} className="accent-amber-400" />
              Sombra
            </label>
          </Field>
          <Field label="Enlace al hacer clic">
            <input placeholder="https://…" value={p.link ?? ""} onChange={(e) => onChange({ link: e.target.value })} className={inputCls} />
          </Field>
        </>
      )}

      {block.type === "button" && (
        <>
          <Field label="Texto del botón">
            <input value={p.text ?? ""} onChange={(e) => onChange({ text: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Enlace (CTA)">
            <input placeholder="https://…" value={p.link ?? ""} onChange={(e) => onChange({ link: e.target.value })} className={inputCls} />
          </Field>
          <Field label={`Ancho (${p.width ?? 100}%)`}>
            <input type="range" min={30} max={100} value={p.width ?? 100} onChange={(e) => onChange({ width: Number(e.target.value) })} className="w-full" />
          </Field>
          <Field label={`Alto (${p.height ? `${p.height}px` : "auto"})`}>
            <input type="range" min={0} max={120} value={p.height ?? 0} onChange={(e) => onChange({ height: Number(e.target.value) || undefined })} className="w-full" />
          </Field>
          <Field label="Colores">
            <div className="flex gap-3">
              <div>
                <p className="text-[10px] text-gray-400 mb-0.5">Fondo</p>
                <input type="color" value={p.bg ?? "#FBBF24"} onChange={(e) => onChange({ bg: e.target.value })} className="w-12 h-7 rounded border border-gray-200 bg-white cursor-pointer" />
              </div>
              <div>
                <p className="text-[10px] text-gray-400 mb-0.5">Texto</p>
                <input type="color" value={p.color ?? "#78350F"} onChange={(e) => onChange({ color: e.target.value })} className="w-12 h-7 rounded border border-gray-200 bg-white cursor-pointer" />
              </div>
            </div>
          </Field>
          <Field label={`Radio (${p.radius ?? 10}px)`}>
            <input type="range" min={0} max={30} value={p.radius ?? 10} onChange={(e) => onChange({ radius: Number(e.target.value) })} className="w-full" />
          </Field>
          <Field label="Alineación">
            <div className="flex gap-1.5">
              {(["left", "center", "right"] as const).map((a) => (
                <button
                  key={a}
                  onClick={() => onChange({ align: a })}
                  className={`flex-1 py-1.5 rounded-lg border text-xs transition-colors ${p.align === a ? "bg-amber-100 border-amber-300 text-amber-700" : "border-gray-200 text-gray-400 hover:bg-gray-50"}`}
                >
                  {a === "left" ? "Izq" : a === "center" ? "Centro" : "Der"}
                </button>
              ))}
            </div>
          </Field>
        </>
      )}

      {block.type === "divider" && (
        <>
          <Field label={`Grosor (${p.thickness ?? 2}px)`}>
            <input type="range" min={1} max={8} value={p.thickness ?? 2} onChange={(e) => onChange({ thickness: Number(e.target.value) })} className="w-full" />
          </Field>
          <Field label={`Ancho (${p.width ?? 100}%)`}>
            <input type="range" min={20} max={100} value={p.width ?? 100} onChange={(e) => onChange({ width: Number(e.target.value) })} className="w-full" />
          </Field>
          <Field label="Color">
            <input type="color" value={p.dividerColor ?? "#E5E7EB"} onChange={(e) => onChange({ dividerColor: e.target.value })} className="w-full h-8 rounded-lg border border-gray-200 bg-white cursor-pointer" />
          </Field>
          <Field label="Estilo">
            <div className="flex gap-1.5">
              {(["solid", "dashed", "dotted"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => onChange({ dividerStyle: s })}
                  className={`flex-1 py-1.5 rounded-lg border text-xs transition-colors ${p.dividerStyle === s ? "bg-amber-100 border-amber-300 text-amber-700" : "border-gray-200 text-gray-400 hover:bg-gray-50"}`}
                >
                  {s === "solid" ? "Sólida" : s === "dashed" ? "Rayas" : "Puntos"}
                </button>
              ))}
            </div>
          </Field>
        </>
      )}

      {block.type === "columns" && (
        <>
          <Field label="Número de columnas">
            <div className="flex gap-1.5">
              {[2, 3].map((n) => (
                <button
                  key={n}
                  onClick={() => {
                    const items = [...(p.items ?? [])];
                    while (items.length < n) items.push({ text: `Columna ${items.length + 1}` });
                    onChange({ columns: n, items: items.slice(0, n) });
                  }}
                  className={`flex-1 py-1.5 rounded-lg border text-xs transition-colors ${p.columns === n ? "bg-amber-100 border-amber-300 text-amber-700" : "border-gray-200 text-gray-400 hover:bg-gray-50"}`}
                >
                  {n} columnas
                </button>
              ))}
            </div>
          </Field>
          {(p.items ?? []).map((item, i) => (
            <Field key={i} label={`Columna ${i + 1}`}>
              <textarea
                rows={3}
                value={item.text}
                onChange={(e) => {
                  const items = [...(p.items ?? [])];
                  items[i] = { ...items[i], text: e.target.value };
                  onChange({ items });
                }}
                className={inputCls}
              />
              <input
                placeholder="URL de imagen (opcional)"
                value={item.src ?? ""}
                onChange={(e) => {
                  const items = [...(p.items ?? [])];
                  items[i] = { ...items[i], src: e.target.value };
                  onChange({ items });
                }}
                className={`${inputCls} mt-1.5`}
              />
            </Field>
          ))}
        </>
      )}

      {block.type === "social" && (
        <>
          <Field label="Alineación">
            <div className="flex gap-1.5">
              {(["left", "center", "right"] as const).map((a) => (
                <button
                  key={a}
                  onClick={() => onChange({ align: a })}
                  className={`flex-1 py-1.5 rounded-lg border text-xs transition-colors ${p.align === a ? "bg-amber-100 border-amber-300 text-amber-700" : "border-gray-200 text-gray-400 hover:bg-gray-50"}`}
                >
                  {a === "left" ? "Izq" : a === "center" ? "Centro" : "Der"}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Color de íconos">
            <input type="color" value={p.iconColor ?? "#6B7280"} onChange={(e) => onChange({ iconColor: e.target.value })} className="w-full h-8 rounded-lg border border-gray-200 bg-white cursor-pointer" />
          </Field>
          <Field label={`Tamaño (${p.iconSize ?? 22}px)`}>
            <input type="range" min={16} max={32} value={p.iconSize ?? 22} onChange={(e) => onChange({ iconSize: Number(e.target.value) })} className="w-full" />
          </Field>
          {SOCIAL_NETWORKS.map(({ key, label }) => (
            <Field key={key} label={label}>
              <input
                placeholder="https://… (vacío = ocultar)"
                value={p.networks?.[key] ?? ""}
                onChange={(e) => onChange({ networks: { ...(p.networks ?? {}), [key]: e.target.value } })}
                className={inputCls}
              />
            </Field>
          ))}
        </>
      )}

      <div className="border-t border-gray-100 pt-3">
        <button
          onClick={onRemove}
          className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-semibold text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
        >
          <Trash2 size={12} /> Eliminar bloque
        </button>
      </div>
    </div>
  );
}
