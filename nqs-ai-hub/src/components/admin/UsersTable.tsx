"use client";

/**
 * Tabla de usuarios + botón "nuevo" + modal detalle al hacer click en
 * una fila.
 */
import { useCallback, useState } from "react";
import { NewUserModal } from "./NewUserModal";
import { UserDetailModal } from "./UserDetailModal";

export type AdminUserRow = {
  id: string;
  email: string;
  name: string;
  initials: string;
  role: "admin" | "employee";
  dept: string | null;
  job_title: string | null;
  is_active: boolean | null;
  created_at: string | null;
  tools_active_count: number;
  last_sign_in_at: string | null;
};

type UsersTableProps = Readonly<{
  initialUsers: AdminUserRow[];
}>;

const DATE_FMT = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export function UsersTable({ initialUsers }: UsersTableProps) {
  const [users, setUsers] = useState(initialUsers);
  const [newOpen, setNewOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = users.find((u) => u.id === selectedId) ?? null;

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/users", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { users: AdminUserRow[] };
      setUsers(data.users);
    } catch {
      // silent
    }
  }, []);

  return (
    <>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          marginBottom: 18,
        }}
      >
        <div>
          <div className="t-eyebrow" style={{ marginBottom: 8 }}>
            ↳ ADMIN · USUARIOS
          </div>
          <h1
            className="page-title"
            style={{ fontSize: 28, margin: 0, letterSpacing: "-0.01em" }}
          >
            Usuarios <span className="t-meta dim">({users.length})</span>
          </h1>
        </div>
        <button
          type="button"
          className="btn"
          onClick={() => setNewOpen(true)}
        >
          + nuevo usuario
        </button>
      </div>

      <div
        style={{
          border: "1px solid var(--line)",
          borderRadius: 10,
          overflow: "hidden",
          background: "var(--bg-elev)",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "minmax(180px, 1.6fr) 110px 130px minmax(180px, 1.4fr) 140px 90px 90px",
            gap: 0,
            padding: "10px 14px",
            borderBottom: "1px solid var(--line)",
            fontFamily: "var(--mono)",
            fontSize: 10,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "var(--fg-mute)",
          }}
        >
          <div>USUARIO</div>
          <div>ROL</div>
          <div>DEPT</div>
          <div>EMAIL</div>
          <div>ÚLTIMO ACCESO</div>
          <div style={{ textAlign: "center" }}>TOOLS</div>
          <div style={{ textAlign: "right" }}>ESTADO</div>
        </div>

        {users.length === 0 && (
          <div
            className="t-meta dim"
            style={{ padding: "40px 14px", textAlign: "center" }}
          >
            ↳ no hay usuarios
          </div>
        )}

        {users.map((u) => (
          <button
            key={u.id}
            type="button"
            onClick={() => setSelectedId(u.id)}
            style={{
              display: "grid",
              gridTemplateColumns:
                "minmax(180px, 1.6fr) 110px 130px minmax(180px, 1.4fr) 140px 90px 90px",
              gap: 0,
              padding: "12px 14px",
              borderTop: "1px solid var(--line)",
              alignItems: "center",
              width: "100%",
              textAlign: "left",
              background: "transparent",
              border: "none",
              borderRadius: 0,
              cursor: "pointer",
              color: "var(--fg)",
              fontFamily: "var(--sans)",
              fontSize: 13,
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = "var(--bg-elev-2, rgba(255,255,255,0.03))")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = "transparent")
            }
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div className="av" title={u.email}>
                {u.initials}
              </div>
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {u.name}
                </div>
                {u.job_title && (
                  <div
                    className="t-meta dim"
                    style={{ fontSize: 10, marginTop: 2 }}
                  >
                    {u.job_title}
                  </div>
                )}
              </div>
            </div>
            <div>
              <span
                className={`tag ${u.role === "admin" ? "accent" : ""}`}
                style={{ padding: "2px 8px" }}
              >
                {u.role}
              </span>
            </div>
            <div className="t-meta dim">{u.dept ?? "—"}</div>
            <div
              className="t-meta"
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {u.email}
            </div>
            <div className="t-meta dim">
              {u.last_sign_in_at
                ? DATE_FMT.format(new Date(u.last_sign_in_at))
                : "—"}
            </div>
            <div style={{ textAlign: "center" }} className="t-meta">
              {u.tools_active_count}
            </div>
            <div style={{ textAlign: "right" }}>
              <span
                className={`tag ${u.is_active ? "ok" : "danger"}`}
                style={{ padding: "2px 8px" }}
              >
                {u.is_active ? "activo" : "baja"}
              </span>
            </div>
          </button>
        ))}
      </div>

      <NewUserModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onCreated={() => {
          setNewOpen(false);
          void refresh();
        }}
      />

      {selected && (
        <UserDetailModal
          user={selected}
          onClose={() => setSelectedId(null)}
          onChanged={() => {
            void refresh();
          }}
        />
      )}
    </>
  );
}
