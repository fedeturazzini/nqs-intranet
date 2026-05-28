"use client";

/**
 * Modal de detalle de usuario con 2 tabs:
 *   - "Datos básicos": editar name / dept / job_title / role + dar de baja
 *   - "Accesos": link rápido a `/admin/access?user={id}` (la página real
 *     vive ahí, el modal solo redirige)
 *
 * Para MVP no incluimos la tab "Créditos" — la 11 traerá esa vista.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { showToast } from "@/lib/store/toast";
import type { AdminUserRow } from "./UsersTable";

type UserDetailModalProps = Readonly<{
  user: AdminUserRow;
  onClose: () => void;
  /** Triggerea refetch en el padre. */
  onChanged: () => void;
}>;

type Tab = "basic" | "access";

export function UserDetailModal({
  user,
  onClose,
  onChanged,
}: UserDetailModalProps) {
  const [tab, setTab] = useState<Tab>("basic");
  const [name, setName] = useState(user.name);
  const [dept, setDept] = useState(user.dept ?? "");
  const [jobTitle, setJobTitle] = useState(user.job_title ?? "");
  const [role, setRole] = useState(user.role);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const dirty =
    name !== user.name ||
    dept !== (user.dept ?? "") ||
    jobTitle !== (user.job_title ?? "") ||
    role !== user.role;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          dept: dept.trim() || null,
          jobTitle: jobTitle.trim() || null,
          role,
        }),
      });
      const data = (await res.json()) as
        | { user: unknown }
        | { error: string; message?: string };
      if (!res.ok || "error" in data) {
        const msg = "message" in data && data.message ? data.message : "update_failed";
        setError(msg);
        setBusy(false);
        return;
      }
      showToast({
        title: "GUARDADO",
        msg: `Cambios aplicados a ${name}.`,
        color: "var(--ok)",
      });
      onChanged();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "network_error");
      setBusy(false);
    }
  }

  async function deactivate() {
    if (
      !confirm(
        `¿Dar de baja a ${user.name}? Su sesión se invalida y deja de poder loguearse.`,
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setError("no se pudo dar de baja");
        setBusy(false);
        return;
      }
      showToast({
        title: "DADO DE BAJA",
        msg: `${user.name} ya no puede entrar al hub.`,
        color: "var(--warn)",
      });
      onChanged();
      onClose();
    } catch {
      setError("network_error");
      setBusy(false);
    }
  }

  async function reactivate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isActive: true }),
      });
      if (!res.ok) {
        setError("no se pudo reactivar");
        setBusy(false);
        return;
      }
      showToast({
        title: "REACTIVADO",
        msg: `${user.name} puede volver a loguearse.`,
        color: "var(--ok)",
      });
      onChanged();
      onClose();
    } catch {
      setError("network_error");
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="user-detail-title"
      onClick={onClose}
      style={backdropStyle}
    >
      <div onClick={(e) => e.stopPropagation()} style={cardStyle}>
        <div style={hdStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div className="av" style={{ width: 32, height: 32, fontSize: 12 }}>
              {user.initials}
            </div>
            <div>
              <div className="t-eyebrow">↳ USUARIO</div>
              <h2 id="user-detail-title" style={titleStyle}>
                {user.name}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="cerrar"
            style={closeBtnStyle}
          >
            ✕
          </button>
        </div>

        <div style={tabsRow}>
          <TabButton
            active={tab === "basic"}
            onClick={() => setTab("basic")}
            label="datos básicos"
          />
          <TabButton
            active={tab === "access"}
            onClick={() => setTab("access")}
            label="accesos & horarios"
          />
        </div>

        {tab === "basic" && (
          <>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 12,
                marginTop: 18,
              }}
            >
              <Field label="NOMBRE">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={busy}
                  style={inputStyle}
                />
              </Field>
              <Field label="EMAIL (inmutable)">
                <input
                  type="email"
                  value={user.email}
                  disabled
                  style={{ ...inputStyle, opacity: 0.6 }}
                />
              </Field>
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <Field label="DEPARTAMENTO">
                    <input
                      type="text"
                      value={dept}
                      onChange={(e) => setDept(e.target.value)}
                      disabled={busy}
                      style={inputStyle}
                    />
                  </Field>
                </div>
                <div style={{ flex: 1 }}>
                  <Field label="JOB TITLE">
                    <input
                      type="text"
                      value={jobTitle}
                      onChange={(e) => setJobTitle(e.target.value)}
                      disabled={busy}
                      style={inputStyle}
                    />
                  </Field>
                </div>
              </div>
              <Field label="ROL">
                <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                  <RoleButton
                    active={role === "employee"}
                    onClick={() => setRole("employee")}
                    label="employee"
                  />
                  <RoleButton
                    active={role === "admin"}
                    onClick={() => setRole("admin")}
                    label="admin"
                  />
                </div>
              </Field>
            </div>

            {error && (
              <div
                className="t-meta"
                style={{ color: "var(--danger)", marginTop: 12 }}
              >
                ↳ {error}
              </div>
            )}

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
                marginTop: 20,
                alignItems: "center",
              }}
            >
              {user.is_active ? (
                <button
                  type="button"
                  className="btn secondary"
                  onClick={deactivate}
                  disabled={busy}
                  style={{ color: "var(--danger)" }}
                >
                  dar de baja
                </button>
              ) : (
                <button
                  type="button"
                  className="btn secondary"
                  onClick={reactivate}
                  disabled={busy}
                >
                  reactivar
                </button>
              )}
              <button
                type="button"
                className="btn"
                onClick={save}
                disabled={busy || !dirty}
              >
                {busy ? "guardando…" : "guardar cambios →"}
              </button>
            </div>
          </>
        )}

        {tab === "access" && (
          <div
            style={{
              marginTop: 24,
              padding: 20,
              border: "1px dashed var(--line-strong)",
              borderRadius: 10,
              textAlign: "center",
            }}
          >
            <div className="t-meta dim" style={{ marginBottom: 12 }}>
              ↳ Para gestionar acceso a tools, horarios y créditos
            </div>
            <Link
              href={`/admin/access?user=${user.id}`}
              className="btn"
              prefetch={false}
            >
              abrir panel de accesos →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <label style={{ display: "block" }}>
      <span className="t-eyebrow" style={{ display: "block", marginBottom: 6 }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function RoleButton({
  active,
  onClick,
  label,
}: Readonly<{ active: boolean; onClick: () => void; label: string }>) {
  return (
    <button
      type="button"
      className="btn sm"
      onClick={onClick}
      style={{
        background: active ? "var(--accent)" : "transparent",
        color: active ? "var(--accent-fg)" : "var(--fg-mute)",
        border: active ? "0" : "1px solid var(--line-strong)",
      }}
    >
      {label}
    </button>
  );
}

function TabButton({
  active,
  onClick,
  label,
}: Readonly<{ active: boolean; onClick: () => void; label: string }>) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "8px 14px",
        background: "transparent",
        border: 0,
        borderBottom: active
          ? "2px solid var(--accent)"
          : "2px solid transparent",
        color: active ? "var(--fg)" : "var(--fg-mute)",
        fontFamily: "var(--mono)",
        fontSize: 11,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

const backdropStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0, 0, 0, 0.6)",
  display: "grid",
  placeItems: "center",
  zIndex: 1000,
  padding: 16,
};

const cardStyle: React.CSSProperties = {
  background: "var(--bg-elev)",
  border: "1px solid var(--line-strong)",
  borderRadius: 12,
  padding: 24,
  width: "100%",
  maxWidth: 560,
  boxShadow: "0 16px 60px rgba(0,0,0,0.5)",
  maxHeight: "90vh",
  overflowY: "auto",
};

const hdStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  marginBottom: 16,
};

const titleStyle: React.CSSProperties = {
  fontFamily: "var(--serif)",
  fontStyle: "italic",
  fontSize: 22,
  margin: "4px 0 0 0",
  letterSpacing: "-0.01em",
};

const closeBtnStyle: React.CSSProperties = {
  background: "transparent",
  border: 0,
  color: "var(--fg-mute)",
  cursor: "pointer",
  fontSize: 16,
  padding: 4,
};

const tabsRow: React.CSSProperties = {
  display: "flex",
  gap: 4,
  borderBottom: "1px solid var(--line)",
  marginTop: 4,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--bg)",
  border: "1px solid var(--line-strong)",
  borderRadius: 6,
  color: "var(--fg)",
  fontFamily: "var(--sans)",
  fontSize: 13,
  padding: "8px 10px",
  outline: "none",
};
