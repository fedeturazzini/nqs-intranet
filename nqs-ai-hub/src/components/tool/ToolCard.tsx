"use client";

/**
 * Tarjeta de una tool en el Hub (vista grid). Client Component porque
 * recibe drag handlers + onClick handlers.
 *
 * Adaptado de design/components.jsx líneas 38-93.
 *
 * Estados visuales:
 *   - active        → clickeable; botón "abrir →"; opcionalmente barra
 *                     de créditos.
 *   - pending       → "esperando confirmación".
 *   - locked        → opacity 0.78, botón "solicitar acceso".
 *   - expired       → idem locked.
 *   - coming_soon   → opacity 0.78, botón "próximamente" deshabilitado.
 */
import { StatusPill } from "./StatusPill";
import type { ToolWithAccess } from "@/lib/db/queries/access";

type ToolCardProps = Readonly<{
  tool: ToolWithAccess;
  idx: number;
  onOpen: (tool: ToolWithAccess) => void;
  onRequest: (tool: ToolWithAccess) => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragOver?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDrop?: (e: React.DragEvent<HTMLDivElement>) => void;
  dragging?: boolean;
  dragOver?: boolean;
}>;

export function ToolCard({
  tool,
  idx,
  onOpen,
  onRequest,
  draggable = false,
  onDragStart,
  onDragOver,
  onDrop,
  dragging = false,
  dragOver = false,
}: ToolCardProps) {
  const { access } = tool;
  const isActive = access.status === "active";
  const isPending = access.status === "pending";
  const isLocked = access.status === "locked" || access.status === "expired";
  const isComingSoon = access.status === "coming_soon";
  const hasCredits = access.credits != null && access.creditsTotal != null;

  const classes = [
    "tool-card",
    dragging ? "is-dragging" : "",
    dragOver ? "is-drag-over" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={classes}
      data-status={access.status}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={() => (isActive ? onOpen(tool) : undefined)}
      style={{ cursor: isActive ? "pointer" : undefined }}
    >
      <div className="tool-card-top">
        <div className="tool-card-num t-eyebrow">
          {String(idx + 1).padStart(2, "0")}
        </div>
        <div className="tool-card-handle" title="Arrastrar para reordenar">
          ⋮⋮
        </div>
        <div className="tool-card-glyph" style={{ color: tool.color }}>
          {tool.glyph}
        </div>
      </div>

      <div className="tool-card-body">
        <div className="t-eyebrow">{tool.category}</div>
        <h3 className="tool-card-name">{tool.name}</h3>
        <p className="tool-card-desc">{tool.description}</p>
      </div>

      <div className="tool-card-foot">
        <StatusPill
          status={access.status}
          credits={access.credits}
          creditsTotal={access.creditsTotal}
          expiresInMin={access.expiresInMin}
          requestedAt={access.requestedAt}
          expiredAt={access.expiredAt}
        />

        {isActive && hasCredits && (
          <div className="tool-card-meter">
            <div className="meter">
              <div
                className="meter-fill"
                style={{
                  width: `${(access.credits! / access.creditsTotal!) * 100}%`,
                  background: tool.color,
                }}
              />
            </div>
            <span className="t-meta">{access.credits} disponibles</span>
          </div>
        )}

        {isPending && (
          <span className="t-meta">esperando confirmación</span>
        )}

        {isLocked && (
          <button
            className="btn sm secondary"
            onClick={(e) => {
              e.stopPropagation();
              onRequest(tool);
            }}
          >
            solicitar acceso
          </button>
        )}

        {isComingSoon && (
          <button
            className="btn sm secondary"
            disabled
            title="esta tool todavía no está habilitada en el hub"
            onClick={(e) => e.stopPropagation()}
            style={{ opacity: 0.6, cursor: "not-allowed" }}
          >
            próximamente
          </button>
        )}

        {isActive && (
          <button
            className="btn sm"
            onClick={(e) => {
              e.stopPropagation();
              onOpen(tool);
            }}
          >
            abrir →
          </button>
        )}
      </div>
    </div>
  );
}
