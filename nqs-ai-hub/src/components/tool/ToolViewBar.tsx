"use client";

/**
 * Barra superior de la vista de una tool — réplica del componente
 * `tool-view-bar` del diseño del cliente.
 *
 * Referencia: design/screens.jsx líneas 272-316, design/screens.css
 * líneas 618-629. Las clases `.tool-view-bar`, `.tool-view-bar-l`,
 * `.tool-view-bar-r`, `.btn.ghost.sm`, `.tag.accent`, `.tag.warn`, `.dot`
 * vienen del CSS del cliente ya importado en globals.css.
 *
 * Genérico: recibe nombre/vendor/glyph/color de la tool, créditos
 * opcionales (si la tool no usa créditos, no rendereamos el pill) y
 * los handlers de back + pedir más créditos.
 *
 * Reglas de color del pill:
 *   - 0 créditos                 → `.tag warn` + dot rojo (danger)
 *   - menos de `warnAt` (5 def.) → `.tag warn`
 *   - resto                       → `.tag accent`
 */
type ToolViewBarProps = Readonly<{
  toolName: string;
  toolGlyph: string;
  toolColor: string;
  vendorHost: string;
  /** Si la tool usa créditos, pasar este objeto; si no, omitir. */
  credits?: {
    left: number;
    total: number;
    /** Umbral para pasar de accent → warn. Default 5. */
    warnAt?: number;
  };
  onBack: () => void;
  /** Solo se renderiza el botón si `credits` está presente. */
  onRequestMore?: () => void;
}>;

export function ToolViewBar({
  toolName,
  toolGlyph,
  toolColor,
  vendorHost,
  credits,
  onBack,
  onRequestMore,
}: ToolViewBarProps) {
  const warnAt = credits?.warnAt ?? 5;
  const isOut = credits ? credits.left <= 0 : false;
  const isLow = credits ? credits.left < warnAt : false;
  const pillClass = credits
    ? `tag ${isLow || isOut ? "warn" : "accent"}`
    : "tag";

  return (
    <div className="tool-view-bar">
      <div className="tool-view-bar-l">
        <button
          type="button"
          className="btn ghost sm"
          onClick={onBack}
          aria-label="volver a la intranet"
        >
          ← intranet
        </button>
        <span className="t-meta">↳ /</span>
        <span
          style={{
            color: toolColor,
            fontFamily: "var(--serif)",
            fontStyle: "italic",
            fontSize: 18,
            lineHeight: 1,
          }}
        >
          {toolGlyph}
        </span>
        <span
          style={{
            fontFamily: "var(--serif)",
            fontStyle: "italic",
            fontSize: 22,
            letterSpacing: "-0.01em",
            lineHeight: 1,
          }}
        >
          {toolName}
        </span>
        <span className="t-meta dim">· {vendorHost}</span>
      </div>

      <div className="tool-view-bar-r">
        {credits && (
          <span className={pillClass}>
            <span
              className="dot"
              style={isOut ? { background: "var(--danger)" } : undefined}
            />
            {credits.left} créditos · de {credits.total}
          </span>
        )}
        {credits && onRequestMore && (
          <button
            type="button"
            className="btn sm"
            onClick={onRequestMore}
          >
            pedir más créditos
          </button>
        )}
      </div>
    </div>
  );
}
