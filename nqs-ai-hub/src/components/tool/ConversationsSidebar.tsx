"use client";

/**
 * Sidebar con el historial de conversaciones del user.
 *
 * Carga `/api/me/conversations` en mount. Click en una conv → callback
 * al padre para que la levante con `loadConversation(id)`.
 *
 * Botón "nueva" arriba resetea el chat actual.
 *
 * Renombrar: ícono de lápiz (on-hover) o doble-click en el título → input
 * inline. Enter/✓ guarda (PATCH), Escape/blur cancela. El título se actualiza
 * en la lista al instante (sin recargar); si el PATCH falla, se avisa y se
 * mantiene el título viejo.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { showToast } from "@/lib/store/toast";
import type { ConversationListRow } from "@/lib/db/queries/conversations";

type ConversationsSidebarProps = Readonly<{
  /** ID de la conv actualmente activa (si la hay) para destacarla. */
  activeId: string | null;
  /** Vuelve a llamar al endpoint — útil después de crear una nueva conv. */
  refreshSignal?: number;
  /** Nombre del proyecto activo (FIX 17.5) — para el título del sidebar. */
  projectName?: string;
  /** Lista resuelta por el SSR; evita repetir sesión/proyecto/gate al montar. */
  initialConversations: ConversationListRow[] | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}>;

export function ConversationsSidebar({
  activeId,
  refreshSignal,
  projectName,
  initialConversations,
  onSelect,
  onNew,
}: ConversationsSidebarProps) {
  const [items, setItems] =
    useState<ConversationListRow[]>(initialConversations ?? []);
  const [loading, setLoading] = useState(initialConversations === null);
  const [err, setErr] = useState<string | null>(null);
  const initialRefreshSignal = useRef(refreshSignal);
  const hasInitialConversations = useRef(initialConversations !== null);

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
      const data = (await res.json()) as {
        conversations: ConversationListRow[];
      };
      setItems(data.conversations);
    } catch (error) {
      setErr(error instanceof Error ? error.message : "error de red");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // El SSR ya entregó la primera lista. Solo consultamos el endpoint cuando
    // una acción posterior (nuevo chat/cambio de proyecto) pide refrescarla.
    if (
      hasInitialConversations.current &&
      refreshSignal === initialRefreshSignal.current
    ) {
      return;
    }
    hasInitialConversations.current = true;
    void fetchList();
  }, [fetchList, refreshSignal]);

  // Renombra vía PATCH y refleja el nuevo título en la lista al instante. Si
  // falla, avisa y NO toca el estado (queda el título viejo). Devuelve si andó.
  const handleRename = useCallback(
    async (id: string, rawTitle: string): Promise<boolean> => {
      const title = rawTitle.trim();
      if (!title) return false;
      try {
        const res = await fetch(`/api/me/conversations/${id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title }),
        });
        if (!res.ok) {
          showToast({
            title: "ERROR",
            msg: "No pude renombrar la conversación.",
            color: "var(--danger, #ff5c5c)",
          });
          return false;
        }
        const data = (await res.json().catch(() => ({}))) as { title?: string };
        const finalTitle = data.title ?? title;
        setItems((prev) =>
          prev.map((c) => (c.id === id ? { ...c, title: finalTitle } : c)),
        );
        return true;
      } catch {
        showToast({
          title: "ERROR",
          msg: "Error de red al renombrar.",
          color: "var(--danger, #ff5c5c)",
        });
        return false;
      }
    },
    [],
  );

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
        <div className="t-eyebrow" style={{ minWidth: 0 }}>
          ↳ {projectName ? `CONVERSACIONES · ${projectName}` : "HISTORIAL"}
        </div>
        <button
          type="button"
          className="btn sm"
          onClick={onNew}
          title="nueva conversación"
          style={{ flexShrink: 0 }}
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
          <ConvRow
            key={c.id}
            conv={c}
            active={c.id === activeId}
            onSelect={() => onSelect(c.id)}
            onRename={handleRename}
          />
        ))}
      </div>
    </aside>
  );
}

type ConvRowProps = Readonly<{
  conv: ConversationListRow;
  active: boolean;
  onSelect: () => void;
  /** Renombra en el server + lista. Devuelve true si guardó. */
  onRename: (id: string, title: string) => Promise<boolean>;
}>;

function ConvRow({ conv, active, onSelect, onRename }: ConvRowProps) {
  const [hovered, setHovered] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const title = conv.title?.trim() || "(sin título)";

  const startEdit = useCallback(() => {
    setDraft(conv.title ?? "");
    setEditing(true);
  }, [conv.title]);

  const cancel = useCallback(() => setEditing(false), []);

  const confirm = useCallback(async () => {
    if (saving) return;
    const clean = draft.trim();
    // Sin cambios o vacío → salir sin pegarle al server.
    if (!clean || clean === (conv.title ?? "").trim()) {
      setEditing(false);
      return;
    }
    setSaving(true);
    await onRename(conv.id, clean);
    // Éxito: el padre ya actualizó el título. Fallo: se mostró el toast y queda
    // el viejo. En ambos casos salimos del modo edición.
    setSaving(false);
    setEditing(false);
  }, [saving, draft, conv.id, conv.title, onRename]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  if (editing) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "4px 6px",
        }}
      >
        <input
          ref={inputRef}
          value={draft}
          maxLength={100}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void confirm();
            } else if (e.key === "Escape") {
              e.preventDefault();
              cancel();
            }
          }}
          onBlur={cancel}
          disabled={saving}
          style={{
            flex: 1,
            minWidth: 0,
            background: "var(--bg)",
            border: "1px solid var(--line-strong)",
            borderRadius: 6,
            padding: "6px 8px",
            color: "var(--fg)",
            fontSize: 12,
            fontFamily: "var(--sans)",
          }}
        />
        <button
          type="button"
          title="guardar"
          // onMouseDown (no onClick) para actuar ANTES de que el blur del input
          // dispare el cancel.
          onMouseDown={(e) => {
            e.preventDefault();
            void confirm();
          }}
          style={iconBtnStyle}
        >
          ✓
        </button>
      </div>
    );
  }

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        background: active ? "var(--bg-elev)" : "transparent",
        borderLeft: active
          ? "2px solid var(--accent)"
          : "2px solid transparent",
        borderRadius: 0,
      }}
    >
      <button
        type="button"
        onClick={onSelect}
        onDoubleClick={startEdit}
        style={{
          appearance: "none",
          flex: 1,
          minWidth: 0,
          textAlign: "left",
          background: "transparent",
          border: 0,
          padding: "8px 4px 8px 10px",
          cursor: "pointer",
          color: active ? "var(--fg)" : "var(--fg-mute)",
          fontSize: 12,
          lineHeight: 1.35,
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
      <button
        type="button"
        title="renombrar"
        onClick={(e) => {
          e.stopPropagation();
          startEdit();
        }}
        style={{
          ...iconBtnStyle,
          marginRight: 4,
          fontSize: 16,
          // Visible siempre que la conv esté seleccionada (o al pasar el mouse).
          color: active ? "var(--fg)" : "var(--fg-mute)",
          opacity: active ? 1 : hovered ? 0.8 : 0,
          transition: "opacity 0.12s",
        }}
      >
        ✎
      </button>
    </div>
  );
}

const iconBtnStyle: React.CSSProperties = {
  appearance: "none",
  background: "transparent",
  border: 0,
  cursor: "pointer",
  color: "var(--fg-mute)",
  fontSize: 12,
  lineHeight: 1,
  padding: "4px 6px",
  flexShrink: 0,
};
