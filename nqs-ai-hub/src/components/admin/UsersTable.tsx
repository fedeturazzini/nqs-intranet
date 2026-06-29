"use client";

/**
 * Tabla de usuarios + botón "nuevo" + modal detalle al hacer click en
 * una fila.
 */
import { useCallback, useMemo, useState } from "react";
import { NewUserModal } from "./NewUserModal";
import { UserDetailModal } from "./UserDetailModal";
import { deptOrder } from "@/lib/constants/departments";

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

type SortKey = "name" | "role" | "dept";
type SortDir = "asc" | "desc";

const DATE_FMT = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  // Forzamos hora Argentina para que la fecha sea la del día local (sin esto,
  // cerca de medianoche SSR en UTC podría mostrar el día siguiente).
  timeZone: "America/Argentina/Buenos_Aires",
});

export function UsersTable({ initialUsers }: UsersTableProps) {
  const [users, setUsers] = useState(initialUsers);
  const [newOpen, setNewOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = users.find((u) => u.id === selectedId) ?? null;

  // Orden client-side (todos los users ya están en memoria). Default: Usuario A→Z.
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: "name",
    dir: "asc",
  });
  const toggleSort = useCallback((key: SortKey) => {
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" },
    );
  }, []);
  const sortedUsers = useMemo(() => {
    const dir = sort.dir === "asc" ? 1 : -1;
    const byName = (a: AdminUserRow, b: AdminUserRow) =>
      a.name.localeCompare(b.name, "es");
    return [...users].sort((a, b) => {
      let cmp: number;
      if (sort.key === "role") {
        cmp = a.role.localeCompare(b.role) || byName(a, b);
      } else if (sort.key === "dept") {
        // Dept por ORDEN DE MENÚ (DEPARTMENTS.indexOf), no alfabético;
        // vacíos/desconocidos al final. Desempata por nombre.
        cmp = deptOrder(a.dept) - deptOrder(b.dept) || byName(a, b);
      } else {
        cmp = byName(a, b);
      }
      return cmp * dir;
    });
  }, [users, sort]);

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
          <SortableTh
            label="USUARIO"
            sortKey="name"
            active={sort.key === "name"}
            dir={sort.dir}
            onSort={toggleSort}
          />
          <SortableTh
            label="ROL"
            sortKey="role"
            active={sort.key === "role"}
            dir={sort.dir}
            onSort={toggleSort}
          />
          <SortableTh
            label="DEPT"
            sortKey="dept"
            active={sort.key === "dept"}
            dir={sort.dir}
            onSort={toggleSort}
          />
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

        {sortedUsers.map((u) => (
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

/** Header de columna clickeable para ordenar (toggle asc/desc). */
function SortableTh({
  label,
  sortKey,
  active,
  dir,
  onSort,
}: Readonly<{
  label: string;
  sortKey: SortKey;
  active: boolean;
  dir: SortDir;
  onSort: (key: SortKey) => void;
}>) {
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      title="ordenar"
      style={{
        background: "transparent",
        border: 0,
        padding: 0,
        font: "inherit",
        letterSpacing: "inherit",
        textTransform: "inherit",
        color: active ? "var(--fg)" : "inherit",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        justifySelf: "start",
      }}
    >
      {label}
      <span style={{ opacity: active ? 1 : 0.3 }}>
        {active ? (dir === "asc" ? "↑" : "↓") : "↕"}
      </span>
    </button>
  );
}
