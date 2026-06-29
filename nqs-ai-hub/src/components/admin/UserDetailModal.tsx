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
  // Reset de password (admin): guardamos la nueva para mostrarla 1 vez.
  const [resetResult, setResetResult] = useState<string | null>(null);
  // Confirmación del borrado definitivo (solo para users en baja).
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function resetPassword() {
    if (
      !confirm(
        `¿Resetear la password de ${user.name}? Se genera una nueva y la actual deja de funcionar.`,
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/reset-password`, {
        method: "POST",
      });
      const data = (await res.json()) as
        | { newPassword: string }
        | { error: string; message?: string };
      if (!res.ok || "error" in data) {
        setError(
          "message" in data && data.message ? data.message : "no se pudo resetear",
        );
        setBusy(false);
        return;
      }
      setResetResult(data.newPassword);
      setBusy(false);
    } catch {
      setError("network_error");
      setBusy(false);
    }
  }

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

  // Borrado DEFINITIVO (hard delete). Solo se ofrece para users en baja.
  async function hardDelete() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}?hard=true`, {
        method: "DELETE",
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
      };
      if (!res.ok || !data.ok) {
        setError(data.message ?? "no se pudo eliminar el usuario");
        setBusy(false);
        return;
      }
      showToast({
        title: "USUARIO ELIMINADO",
        msg: `${user.name} y sus datos fueron borrados definitivamente.`,
        color: "var(--danger)",
      });
      setConfirmDelete(false);
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

            {/* Reset de password (admin) */}
            <div
              style={{
                marginTop: 16,
                paddingTop: 14,
                borderTop: "1px solid var(--line)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
              }}
            >
              <span className="t-meta dim" style={{ fontSize: 11 }}>
                ↳ Resetea la contraseña y te muestra la nueva para pasársela.
              </span>
              <button
                type="button"
                className="btn sm secondary"
                onClick={resetPassword}
                disabled={busy}
              >
                🔑 resetear password
              </button>
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
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={reactivate}
                    disabled={busy}
                  >
                    reactivar
                  </button>
                  {/* Borrado definitivo: solo se ofrece para users en baja. */}
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => setConfirmDelete(true)}
                    disabled={busy}
                    style={{
                      color: "var(--danger)",
                      borderColor: "var(--danger)",
                    }}
                  >
                    eliminar definitivamente
                  </button>
                </div>
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

        {resetResult && (
          <ResetResultModal
            password={resetResult}
            onClose={() => setResetResult(null)}
          />
        )}

        {confirmDelete && (
          <ConfirmDeleteModal
            userName={user.name}
            busy={busy}
            onCancel={() => setConfirmDelete(false)}
            onConfirm={hardDelete}
          />
        )}
      </div>
    </div>
  );
}

/** Confirmación fuerte del borrado definitivo (irreversible). */
function ConfirmDeleteModal({
  userName,
  busy,
  onCancel,
  onConfirm,
}: Readonly<{
  userName: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}>) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        display: "grid",
        placeItems: "center",
        zIndex: 1300,
        padding: 16,
      }}
    >
      <div
        style={{
          background: "var(--bg-elev)",
          border: "1px solid var(--danger)",
          borderRadius: 12,
          padding: 24,
          width: "100%",
          maxWidth: 420,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 34 }}>⚠️</div>
        <h3
          style={{
            fontFamily: "var(--serif)",
            fontStyle: "italic",
            fontSize: 22,
            margin: "8px 0 4px",
          }}
        >
          ¿Eliminar a {userName}?
        </h3>
        <p
          className="t-meta dim"
          style={{ lineHeight: 1.55, margin: "8px 0 0", fontSize: 12 }}
        >
          Esto es{" "}
          <strong style={{ color: "var(--danger)" }}>irreversible</strong>. Se
          borra el usuario y todos sus datos (logs, solicitudes, créditos,
          conversaciones). No se puede deshacer.
        </p>
        <div
          style={{
            display: "flex",
            gap: 10,
            justifyContent: "center",
            marginTop: 20,
          }}
        >
          <button
            type="button"
            className="btn secondary"
            onClick={onCancel}
            disabled={busy}
          >
            cancelar
          </button>
          <button
            type="button"
            className="btn"
            onClick={onConfirm}
            disabled={busy}
            style={{ background: "var(--danger)", color: "#fff", border: 0 }}
          >
            {busy ? "eliminando…" : "sí, eliminar definitivamente"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ResetResultModal({
  password,
  onClose,
}: Readonly<{ password: string; onClose: () => void }>) {
  const [copied, setCopied] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(60);

  // Auto-cierre a los 60s + countdown.
  useEffect(() => {
    const t = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(t);
          onClose();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [onClose]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast({
        title: "ERROR",
        msg: "no pude copiar; copiala a mano",
        color: "var(--danger)",
      });
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        display: "grid",
        placeItems: "center",
        zIndex: 1300,
        padding: 16,
      }}
    >
      <div
        style={{
          background: "var(--bg-elev)",
          border: "1px solid var(--line-strong)",
          borderRadius: 12,
          padding: 24,
          width: "100%",
          maxWidth: 420,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 34 }}>✅</div>
        <h3
          style={{
            fontFamily: "var(--serif)",
            fontStyle: "italic",
            fontSize: 22,
            margin: "8px 0 4px",
          }}
        >
          Password reseteada
        </h3>
        <div className="t-eyebrow" style={{ marginTop: 14, marginBottom: 6 }}>
          ↳ NUEVA CONTRASEÑA
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          <code
            style={{
              flex: 1,
              maxWidth: 240,
              background: "var(--bg)",
              border: "1px solid var(--line-strong)",
              borderRadius: 6,
              padding: "10px 12px",
              fontFamily: "var(--mono)",
              fontSize: 16,
              letterSpacing: "0.04em",
            }}
          >
            {password}
          </code>
          <button type="button" className="btn sm" onClick={copy}>
            {copied ? "✓ copiado" : "📋 copiar"}
          </button>
        </div>
        <p
          className="t-meta dim"
          style={{ lineHeight: 1.5, marginTop: 14, fontSize: 11 }}
        >
          Pasale esta contraseña al usuario por un canal seguro. Por
          seguridad, este modal se cierra en <strong>{secondsLeft}s</strong>.
        </p>
        <button
          type="button"
          className="btn secondary"
          onClick={onClose}
          style={{ marginTop: 12 }}
        >
          cerrar
        </button>
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
