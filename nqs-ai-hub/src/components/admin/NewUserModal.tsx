"use client";

/**
 * Modal para crear un nuevo usuario.
 * Espeja el schema Zod del endpoint POST /api/admin/users.
 */
import { useEffect, useRef, useState } from "react";
import { showToast } from "@/lib/store/toast";

type NewUserModalProps = Readonly<{
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}>;

type Role = "employee" | "admin";

export function NewUserModal({ open, onClose, onCreated }: NewUserModalProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [initials, setInitials] = useState("");
  const [dept, setDept] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [role, setRole] = useState<Role>("employee");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setEmail("");
      setInitials("");
      setDept("");
      setJobTitle("");
      setRole("employee");
      setPassword("");
      setError(null);
      setTimeout(() => firstInputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Auto-compute initials de "Nombre Apellido" mientras tipea (si el
  // user no las puso manualmente).
  useEffect(() => {
    if (initials.length > 0) return;
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return;
    const auto = (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
    setInitials(auto);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  if (!open) return null;

  const canSubmit =
    !submitting &&
    name.trim().length >= 2 &&
    email.includes("@") &&
    initials.length >= 1 &&
    password.length >= 8;

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          initials: initials.trim().toUpperCase(),
          dept: dept.trim() || undefined,
          jobTitle: jobTitle.trim() || undefined,
          role,
          password,
        }),
      });
      const data = (await res.json()) as
        | { user: { name: string; email: string } }
        | { error: string; message?: string };
      if (!res.ok || "error" in data) {
        const msg = "message" in data && data.message ? data.message : "no_user_created";
        setError(msg);
        setSubmitting(false);
        return;
      }
      showToast({
        title: "USUARIO CREADO",
        msg: `${data.user.name} (${data.user.email}) listo para loguearse.`,
        color: "var(--ok)",
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "network_error");
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-user-title"
      onClick={onClose}
      style={backdropStyle}
    >
      <div onClick={(e) => e.stopPropagation()} style={cardStyle}>
        <div style={hdStyle}>
          <div className="t-eyebrow">↳ NUEVO USUARIO</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="cerrar"
            style={closeBtnStyle}
          >
            ✕
          </button>
        </div>
        <h2 id="new-user-title" style={titleStyle}>
          Crear empleado o admin
        </h2>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Field label="NOMBRE COMPLETO">
            <input
              ref={firstInputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={submitting}
              placeholder="Lucía Pérez"
              style={inputStyle}
            />
          </Field>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <Field label="EMAIL">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={submitting}
                  placeholder="lucia@nqs.com.ar"
                  style={inputStyle}
                />
              </Field>
            </div>
            <div style={{ width: 80 }}>
              <Field label="INICIALES">
                <input
                  type="text"
                  value={initials}
                  onChange={(e) => setInitials(e.target.value.toUpperCase())}
                  disabled={submitting}
                  maxLength={4}
                  placeholder="LP"
                  style={{ ...inputStyle, textAlign: "center" }}
                />
              </Field>
            </div>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <Field label="DEPARTAMENTO">
                <input
                  type="text"
                  value={dept}
                  onChange={(e) => setDept(e.target.value)}
                  disabled={submitting}
                  placeholder="Diseño"
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
                  disabled={submitting}
                  placeholder="Senior Designer"
                  style={inputStyle}
                />
              </Field>
            </div>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
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
            <div style={{ flex: 1 }}>
              <Field label="PASSWORD INICIAL">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={submitting}
                  placeholder="mínimo 8 chars"
                  style={inputStyle}
                />
              </Field>
            </div>
          </div>
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
            justifyContent: "flex-end",
            gap: 10,
            marginTop: 18,
          }}
        >
          <button
            type="button"
            className="btn secondary"
            onClick={onClose}
            disabled={submitting}
          >
            cancelar
          </button>
          <button
            type="button"
            className="btn"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {submitting ? "creando…" : "crear usuario →"}
          </button>
        </div>
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
};

const hdStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
};

const titleStyle: React.CSSProperties = {
  fontFamily: "var(--serif)",
  fontStyle: "italic",
  fontSize: 24,
  margin: "8px 0 18px",
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
