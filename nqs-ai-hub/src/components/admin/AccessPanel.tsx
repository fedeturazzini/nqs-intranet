"use client";

/**
 * Panel split-view de accesos.
 *
 *   ┌──────────┬─────────────────────────────────┐
 *   │ user     │ ToolAccessCard × N              │
 *   │ list     │  (toggle + ScheduleEditor)      │
 *   └──────────┴─────────────────────────────────┘
 *
 * Recibe los datos pre-cargados del server. Cuando el admin toca
 * algo, hace fetch al endpoint y refetcha el state del user actual.
 */
import { useCallback, useMemo, useState } from "react";
import { ToolAccessCard } from "./ToolAccessCard";
import type { ToolSchedule } from "@/types/db-aliases";

type UserRow = {
  id: string;
  email: string;
  name: string;
  initials: string;
  dept: string | null;
  role: "admin" | "employee";
};

type ToolRow = {
  id: string;
  name: string;
  vendor: string;
  category: string;
  color: string | null;
  glyph: string | null;
  is_active: boolean | null;
  uses_credits: boolean | null;
};

type AccessRow = {
  user_id: string;
  tool_id: string;
  status: "active" | "pending" | "locked" | "expired";
  schedule: unknown; // JSON
  granted_at: string | null;
  expires_at: string | null;
};

type AccessPanelProps = Readonly<{
  users: UserRow[];
  tools: ToolRow[];
  accesses: AccessRow[];
  initialSelectedUserId: string | null;
}>;

export function AccessPanel({
  users,
  tools,
  accesses: initialAccesses,
  initialSelectedUserId,
}: AccessPanelProps) {
  const [selectedId, setSelectedId] = useState<string | null>(
    initialSelectedUserId ?? users[0]?.id ?? null,
  );
  const [accesses, setAccesses] = useState(initialAccesses);

  const accessByKey = useMemo(() => {
    const m = new Map<string, AccessRow>();
    for (const a of accesses) m.set(`${a.user_id}::${a.tool_id}`, a);
    return m;
  }, [accesses]);

  const selectedUser = useMemo(
    () => users.find((u) => u.id === selectedId) ?? null,
    [users, selectedId],
  );

  const refreshAccesses = useCallback(async () => {
    // Reload completo desde un endpoint genérico — no creamos endpoint
    // dedicado: hacemos query directa al cliente vía el endpoint que ya
    // existe. Para evitar agregar otro, refetchamos esta página con
    // router. Más simple y barato: re-disparamos al fetch directo a la
    // tabla via REST. Para MVP, recargamos la página por simplicidad.
    window.location.reload();
  }, []);

  const updateAccessStatus = useCallback(
    async (toolId: string, status: "active" | "locked") => {
      if (!selectedId) return;
      const res = await fetch("/api/admin/tools/access", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: selectedId, toolId, status }),
      });
      if (res.ok) {
        // Update local state en vez de refresh completo.
        setAccesses((prev) => {
          const idx = prev.findIndex(
            (a) => a.user_id === selectedId && a.tool_id === toolId,
          );
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = { ...next[idx], status };
            return next;
          }
          return [
            ...prev,
            {
              user_id: selectedId,
              tool_id: toolId,
              status,
              schedule: null,
              granted_at: new Date().toISOString(),
              expires_at: null,
            },
          ];
        });
      } else {
        await refreshAccesses();
      }
    },
    [selectedId, refreshAccesses],
  );

  const updateSchedule = useCallback(
    async (toolId: string, schedule: ToolSchedule | null) => {
      if (!selectedId) return;
      const res = await fetch("/api/admin/tools/schedule", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: selectedId, toolId, schedule }),
      });
      if (res.ok) {
        setAccesses((prev) => {
          const idx = prev.findIndex(
            (a) => a.user_id === selectedId && a.tool_id === toolId,
          );
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = { ...next[idx], schedule };
            return next;
          }
          return [
            ...prev,
            {
              user_id: selectedId,
              tool_id: toolId,
              status: "active",
              schedule,
              granted_at: new Date().toISOString(),
              expires_at: null,
            },
          ];
        });
      } else {
        await refreshAccesses();
      }
    },
    [selectedId, refreshAccesses],
  );

  return (
    <div style={{ display: "flex", height: "100%", minHeight: 0 }}>
      {/* Sidebar de users */}
      <aside
        style={{
          width: 260,
          flexShrink: 0,
          borderRight: "1px solid var(--line)",
          padding: "20px 12px",
          overflowY: "auto",
        }}
      >
        <div className="t-eyebrow" style={{ padding: "0 8px 8px" }}>
          ↳ USUARIOS ({users.length})
        </div>
        {users.map((u) => {
          const active = u.id === selectedId;
          return (
            <button
              key={u.id}
              type="button"
              onClick={() => setSelectedId(u.id)}
              style={{
                width: "100%",
                textAlign: "left",
                padding: "8px 10px",
                border: 0,
                borderLeft: active
                  ? "2px solid var(--accent)"
                  : "2px solid transparent",
                background: active ? "var(--bg-elev)" : "transparent",
                cursor: "pointer",
                display: "flex",
                gap: 10,
                alignItems: "center",
                color: active ? "var(--fg)" : "var(--fg-mute)",
              }}
            >
              <div className="av" style={{ width: 24, height: 24, fontSize: 10 }}>
                {u.initials}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontSize: 13,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {u.name}
                </div>
                <div
                  className="t-meta dim"
                  style={{ fontSize: 10, marginTop: 1 }}
                >
                  {u.dept ?? u.role}
                </div>
              </div>
            </button>
          );
        })}
      </aside>

      <main style={{ flex: 1, padding: 28, overflowY: "auto" }}>
        {!selectedUser && (
          <div className="t-meta dim">↳ seleccioná un usuario</div>
        )}
        {selectedUser && (
          <>
            <div className="t-eyebrow" style={{ marginBottom: 8 }}>
              ↳ ADMIN · ACCESOS PARA
            </div>
            <h1
              className="page-title"
              style={{
                fontSize: 28,
                margin: 0,
                letterSpacing: "-0.01em",
              }}
            >
              <em style={{ fontFamily: "var(--serif)" }}>{selectedUser.name}</em>
            </h1>
            <p className="t-meta dim" style={{ marginTop: 6, marginBottom: 24 }}>
              {selectedUser.email}
              {selectedUser.role === "admin"
                ? " · admin (pasa por arriba de todos los checks)"
                : ""}
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))",
                gap: 16,
              }}
            >
              {tools.map((tool) => {
                const access = accessByKey.get(
                  `${selectedUser.id}::${tool.id}`,
                );
                return (
                  // key incluye el user: al cambiar de usuario, React
                  // remonta cada card y `ToolAccessCard` re-inicializa su
                  // estado `showSchedule` desde el `access.schedule` del
                  // user correcto (si la key fuera solo `tool.id`, la
                  // instancia se reusaría entre usuarios y el estado
                  // quedaría stale → mostraba "24/7" aunque hubiera schedule).
                  <ToolAccessCard
                    key={`${selectedUser.id}::${tool.id}`}
                    tool={tool}
                    access={access ?? null}
                    onStatusToggle={(next) =>
                      updateAccessStatus(tool.id, next)
                    }
                    onScheduleChange={(sched) =>
                      updateSchedule(tool.id, sched)
                    }
                  />
                );
              })}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
