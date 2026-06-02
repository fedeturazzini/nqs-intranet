"use client";

/**
 * Chip de usuario del topbar con dropdown: "Cambiar contraseña" + "Cerrar
 * sesión". Reemplaza al UserChip estático (prompt 17, gestión de passwords).
 */
import { useEffect, useRef, useState } from "react";
import { showToast } from "@/lib/store/toast";

type UserMenuProps = Readonly<{
  user: { name: string; initials: string };
}>;

export function UserMenu({ user }: UserMenuProps) {
  const firstName = user.name.split(" ")[0];
  const [open, setOpen] = useState(false);
  const [changeOpen, setChangeOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      window.location.href = "/login";
    } catch {
      setLoggingOut(false);
    }
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        className="user-chip"
        onClick={() => setOpen((v) => !v)}
        style={{
          background: "transparent",
          border: 0,
          cursor: "pointer",
          font: "inherit",
          color: "inherit",
        }}
      >
        <div className="av">{user.initials}</div>
        <span>{firstName}</span>
        <span className="dim" style={{ fontSize: 9 }}>
          ▾
        </span>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            minWidth: 190,
            background: "var(--bg-elev)",
            border: "1px solid var(--line-strong)",
            borderRadius: 8,
            boxShadow: "0 12px 40px rgba(0,0,0,0.4)",
            padding: 6,
            zIndex: 1100,
          }}
        >
          <MenuItem
            onClick={() => {
              setOpen(false);
              setChangeOpen(true);
            }}
          >
            🔑 Cambiar contraseña
          </MenuItem>
          <MenuItem onClick={logout}>
            {loggingOut ? "saliendo…" : "→ Cerrar sesión"}
          </MenuItem>
        </div>
      )}

      {changeOpen && (
        <ChangeOwnPasswordModal onClose={() => setChangeOpen(false)} />
      )}
    </div>
  );
}

function MenuItem({
  onClick,
  children,
}: Readonly<{ onClick: () => void; children: React.ReactNode }>) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        background: "transparent",
        border: 0,
        color: "var(--fg)",
        cursor: "pointer",
        fontFamily: "var(--sans)",
        fontSize: 13,
        padding: "8px 10px",
        borderRadius: 6,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {children}
    </button>
  );
}

function ChangeOwnPasswordModal({ onClose }: Readonly<{ onClose: () => void }>) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (next.length < 8) {
      setError("la nueva contraseña debe tener al menos 8 caracteres");
      return;
    }
    if (next !== confirm) {
      setError("las contraseñas nuevas no coinciden");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/me/change-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          current_password: current,
          new_password: next,
        }),
      });
      const data = (await res.json()) as { success?: boolean; message?: string };
      if (!res.ok || !data.success) {
        setError(data.message ?? "no se pudo cambiar la contraseña");
        setBusy(false);
        return;
      }
      showToast({
        title: "CONTRASEÑA ACTUALIZADA",
        msg: "Usá la nueva la próxima vez que ingreses.",
        color: "var(--ok)",
      });
      onClose();
    } catch {
      setError("error de red");
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "grid",
        placeItems: "center",
        zIndex: 1200,
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-elev)",
          border: "1px solid var(--line-strong)",
          borderRadius: 12,
          padding: 24,
          width: "100%",
          maxWidth: 380,
        }}
      >
        <div className="t-eyebrow" style={{ marginBottom: 14 }}>
          ↳ CAMBIAR CONTRASEÑA
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Pw label="CONTRASEÑA ACTUAL" value={current} onChange={setCurrent} />
          <Pw label="NUEVA CONTRASEÑA" value={next} onChange={setNext} />
          <Pw label="CONFIRMAR NUEVA" value={confirm} onChange={setConfirm} />
        </div>
        {error && (
          <div className="t-meta" style={{ color: "var(--danger)", marginTop: 10 }}>
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
          <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>
            cancelar
          </button>
          <button
            type="button"
            className="btn"
            onClick={submit}
            disabled={busy || !current || !next || !confirm}
          >
            {busy ? "guardando…" : "guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Pw({
  label,
  value,
  onChange,
}: Readonly<{ label: string; value: string; onChange: (v: string) => void }>) {
  return (
    <label style={{ display: "block" }}>
      <span className="t-eyebrow" style={{ display: "block", marginBottom: 4 }}>
        {label}
      </span>
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%",
          background: "var(--bg)",
          border: "1px solid var(--line-strong)",
          borderRadius: 6,
          color: "var(--fg)",
          fontFamily: "var(--mono)",
          fontSize: 13,
          padding: "8px 10px",
          outline: "none",
        }}
      />
    </label>
  );
}
