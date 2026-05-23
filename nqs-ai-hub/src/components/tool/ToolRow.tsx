"use client";

/**
 * Fila de una tool en el Hub (vista lista). Client por los handlers.
 * Adaptado de design/components.jsx líneas 96-117.
 */
import { StatusPill } from "./StatusPill";
import type { ToolWithAccess } from "@/lib/db/queries/access";

type ToolRowProps = Readonly<{
  tool: ToolWithAccess;
  idx: number;
  onOpen: (tool: ToolWithAccess) => void;
  onRequest: (tool: ToolWithAccess) => void;
}>;

export function ToolRow({ tool, idx, onOpen, onRequest }: ToolRowProps) {
  const { access } = tool;
  const isActive = access.status === "active";
  const isPending = access.status === "pending";
  const isLocked = access.status === "locked" || access.status === "expired";
  const isComingSoon = access.status === "coming_soon";

  return (
    <div className="tool-row" data-status={access.status}>
      <div className="t-eyebrow tool-row-num">
        {String(idx + 1).padStart(2, "0")}
      </div>
      <div className="tool-row-glyph" style={{ color: tool.color }}>
        {tool.glyph}
      </div>
      <div className="tool-row-name">
        <div className="tool-row-name-t">{tool.name}</div>
        <div className="t-meta">{tool.vendor}</div>
      </div>
      <div className="tool-row-cat t-meta">{tool.category}</div>
      <div className="tool-row-status">
        <StatusPill
          status={access.status}
          credits={access.credits}
          creditsTotal={access.creditsTotal}
          expiresInMin={access.expiresInMin}
          requestedAt={access.requestedAt}
          expiredAt={access.expiredAt}
        />
      </div>
      <div className="tool-row-cta">
        {isActive && (
          <button className="btn sm" onClick={() => onOpen(tool)}>
            abrir →
          </button>
        )}
        {isPending && <span className="t-meta dim">esperando</span>}
        {isLocked && (
          <button
            className="btn sm secondary"
            onClick={() => onRequest(tool)}
          >
            solicitar
          </button>
        )}
        {isComingSoon && (
          <button
            className="btn sm secondary"
            disabled
            style={{ opacity: 0.6, cursor: "not-allowed" }}
          >
            próximamente
          </button>
        )}
      </div>
    </div>
  );
}
