import { useEffect, useRef, useState, type ReactNode } from "react";
import { Mail, X } from "lucide-react";

type PreviewVariant = "card" | "full";

/**
 * Renderiza el HTML del correo dentro de un contenedor, escalándolo con
 * `transform`. El correo se maqueta a un ancho fijo (600px), por lo que el
 * escalado siempre se calcula por ancho (se ve legible y ocupa todo el ancho):
 *  - `variant="card"`: la vista toma la altura que necesite el correo (se ajusta
 *    al alto real). Sin scroll.
 *  - `variant="full"`: ocupa el alto disponible con scroll vertical (modal).
 */
export function EmailHtmlPreview({ html, variant = "card" }: { html: string; variant?: PreviewVariant }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [content, setContent] = useState({ w: 600, h: 800 });
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const compute = () => {
      const w = el.clientWidth;
      if (w <= 0) return;
      setScale(Math.min(w / content.w, 1));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [content]);

  return (
    <div
      ref={containerRef}
      className={
        variant === "full"
          ? "w-full h-full overflow-y-auto overflow-x-hidden flex justify-center"
          : "w-full overflow-hidden flex justify-center"
      }
      style={{ background: "#F3F4F6" }}
    >
      {/* Capa con el tamaño ya escalado (el iframe usa transform, que no afecta al
          flujo del layout). El flex la centra cuando sobra espacio. */}
      <div className="relative" style={{ width: content.w * scale, height: content.h * scale }}>
        <iframe
          srcDoc={html}
          title="Vista previa del correo"
          scrolling="no"
          onLoad={(e) => {
            const frame = e.currentTarget as HTMLIFrameElement;
            try {
              const doc = frame.contentDocument;
              const de = doc?.documentElement;
              if (doc && de) {
                setContent({
                  w: Math.max(de.scrollWidth, 600),
                  h: Math.max(doc.body?.scrollHeight || de.scrollHeight, 600),
                });
              }
            } catch {
              /* si no es accesible, queda con el tamaño por defecto */
            }
          }}
          style={{
            width: content.w,
            height: content.h,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            position: "absolute",
            top: 0,
            left: 0,
            border: 0,
            display: "block",
            background: "#F3F4F6",
          }}
        />
      </div>
    </div>
  );
}

/**
 * Modal con la vista del correo completo.
 * `actions` permite inyectar botones extra (p. ej. "Diseñar") junto al cierre.
 */
export function EmailFullPreviewModal({
  html,
  onClose,
  title = "Correo completo",
  actions,
}: {
  html: string;
  onClose: () => void;
  title?: string;
  actions?: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/50 cursor-pointer"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[88vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <Mail size={15} className="text-blue-500" />
            <p className="font-bold text-gray-900 text-sm">{title}</p>
          </div>
          <div className="flex items-center gap-2">
            {actions}
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-0 bg-gray-100">
          <EmailHtmlPreview html={html} variant="full" />
        </div>
      </div>
    </div>
  );
}
