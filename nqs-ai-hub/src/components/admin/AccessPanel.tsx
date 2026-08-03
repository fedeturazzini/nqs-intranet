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
import { deptOrder } from "@/lib/constants/departments";
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

  // FEEDBACK NQS v2.0 (4.1): usuarios agrupados por departamento y
  // ordenados alfabéticamente por nombre dentro de cada grupo. Los GRUPOS van
  // por el orden del menú fijo (DEPARTMENTS.indexOf, mismo comparador que la
  // tabla de usuarios); "SIN DEPARTAMENTO"/desconocidos quedan al final.
  const groupedUsers = useMemo<Array<[string, UserRow[]]>>(() => {
    const groups = new Map<string, UserRow[]>();
    for (const u of users) {
      const key = (u.dept ?? "").trim() || "SIN DEPARTAMENTO";
      const arr = groups.get(key) ?? [];
      arr.push(u);
      groups.set(key, arr);
    }
    const entries = [...groups.entries()];
    for (const [, arr] of entries) {
      arr.sort((x, y) => x.name.localeCompare(y.name, "es"));
    }
    entries.sort(
      (a, b) =>
        deptOrder(a[0]) - deptOrder(b[0]) || a[0].localeCompare(b[0], "es"),
    );
    return entries;
  }, [users]);

  const updateAccessStatus = useCallback(
    async (
      toolId: string,
      status: "active" | "locked",
      opts?: {
        durationMinutes?: number;
        customExpiresAt?: string | null;
      },
    ) => {
      if (!selectedId) return;
      const body: Record<string, unknown> = {
        userId: selectedId,
        toolId,
        status,
      };
      if (opts?.customExpiresAt !== undefined) {
        body.custom_expires_at = opts.customExpiresAt;
      } else if (opts?.durationMinutes != null) {
        body.duration_minutes = opts.durationMinutes;
      }

      const res = await fetch("/api/admin/tools/access", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        throw new Error(`access_update_failed_${res.status}`);
      }

      const data = (await res.json().catch(() => ({}))) as {
        expires_at?: string | null;
      };
      const expiresAt =
        status === "locked"
          ? null
          : opts?.customExpiresAt !== undefined
            ? opts.customExpiresAt
            : (data.expires_at ?? null);

      setAccesses((prev) => {
        const idx = prev.findIndex(
          (a) => a.user_id === selectedId && a.tool_id === toolId,
        );
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { ...next[idx], status, expires_at: expiresAt };
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
            expires_at: expiresAt,
          },
        ];
      });
    },
    [selectedId],
  );

  const updateSchedule = useCallback(
    async (toolId: string, schedule: ToolSchedule | null) => {
      if (!selectedId) throw new Error("no_user_selected");
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
        return;
      }
      throw new Error(`schedule_update_failed_${res.status}`);
    },
    [selectedId],
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
        {/* FEEDBACK NQS v2.0 (4.1): agrupados por departamento + alfabético. */}
        {groupedUsers.map(([deptLabel, deptUsers]) => (
          <div key={deptLabel} style={{ marginBottom: 6 }}>
            <div
              className="t-eyebrow"
              style={{
                padding: "10px 8px 4px",
                fontSize: 9,
                color: "var(--fg-mute)",
                opacity: 0.7,
                letterSpacing: "0.12em",
              }}
            >
              ───── {deptLabel} ─────
            </div>
            {deptUsers.map((u) => {
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
                  <div
                    className="av"
                    style={{ width: 24, height: 24, fontSize: 10 }}
                  >
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
                      {u.role === "admin" ? "admin" : (u.dept ?? "—")}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ))}
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
              <em style={{ fontFamily: "var(--serif)" }}>
                {selectedUser.name}
              </em>
            </h1>
            <p
              className="t-meta dim"
              style={{ marginTop: 6, marginBottom: 24 }}
            >
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
                    access={
                      access
                        ? {
                            status: access.status,
                            schedule: access.schedule,
                            expires_at: access.expires_at,
                          }
                        : null
                    }
                    onStatusToggle={(next) => updateAccessStatus(tool.id, next)}
                    onSetDuration={(opts) =>
                      updateAccessStatus(tool.id, "active", opts)
                    }
                    onScheduleSave={(sched) => updateSchedule(tool.id, sched)}
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
