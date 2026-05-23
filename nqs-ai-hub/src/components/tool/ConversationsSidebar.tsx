"use client";

/**
 * Sidebar con el historial de conversaciones del user.
 *
 * Carga `/api/me/conversations` en mount. Click en una conv → callback
 * al padre para que la levante con `loadConversation(id)`.
 *
 * Botón "nueva" arriba resetea el chat actual.
 */
import { useCallback, useEffect, useState } from "react";

type ConversationRow = {
  id: string;
  title: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type ConversationsSidebarProps = Readonly<{
  /** ID de la conv actualmente activa (si la hay) para destacarla. */
  activeId: string | null;
  /** Vuelve a llamar al endpoint — útil después de crear una nueva conv. */
  refreshSignal?: number;
  onSelect: (id: string) => void;
  onNew: () => void;
}>;

export function ConversationsSidebar({
  activeId,
  refreshSignal,
  onSelect,
  onNew,
}: ConversationsSidebarProps) {
  const [items, setItems] = useState<ConversationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/me/conversations", { cache: "no-store" });
      if (!res.ok) {
        setErr(`error ${res.status}`);
        setItems([]);
        return;
      }
      const data = (await res.json()) as { conversations: ConversationRow[] };
      setItems(data.conversations);
    } catch (error) {
      setErr(error instanceof Error ? error.message : "error de red");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchList();
  }, [fetchList, refreshSignal]);

  return (
    <aside
      style={{
        width: 280,
        flexShrink: 0,
        borderRight: "1px solid var(--line)",
        padding: "20px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        overflowY: "auto",
      }}
    >
      <div
        className="row"
        style={{ justifyContent: "space-between", alignItems: "center" }}
      >
        <div className="t-eyebrow">↳ HISTORIAL</div>
        <button
          type="button"
          className="btn sm"
          onClick={onNew}
          title="nueva conversación"
        >
          + nueva
        </button>
      </div>

      {loading && (
        <div className="t-meta dim">cargando…</div>
      )}

      {err && (
        <div className="chat-block">
          <strong>ERROR</strong>
          {err}
        </div>
      )}

      {!loading && !err && items.length === 0 && (
        <div className="t-meta dim">↳ todavía no hay conversaciones</div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {items.map((c) => (
          <ConvButton
            key={c.id}
            conv={c}
            active={c.id === activeId}
            onClick={() => onSelect(c.id)}
          />
        ))}
      </div>
    </aside>
  );
}

type ConvButtonProps = Readonly<{
  conv: ConversationRow;
  active: boolean;
  onClick: () => void;
}>;

function ConvButton({ conv, active, onClick }: ConvButtonProps) {
  const title = conv.title?.trim() || "(sin título)";
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        appearance: "none",
        textAlign: "left",
        background: active ? "var(--bg-elev)" : "transparent",
        border: 0,
        borderLeft: active ? "2px solid var(--accent)" : "2px solid transparent",
        padding: "8px 10px",
        cursor: "pointer",
        color: active ? "var(--fg)" : "var(--fg-mute)",
        fontSize: 12,
        lineHeight: 1.35,
        borderRadius: 0,
        fontFamily: "var(--sans)",
      }}
    >
      <div
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {title}
      </div>
    </button>
  );
}
