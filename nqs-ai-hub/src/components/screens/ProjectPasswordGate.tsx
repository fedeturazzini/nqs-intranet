"use client";

/**
 * Gate de contraseña de un proyecto PRIVADO (migration 0016). Calca el estilo
 * del gate del System Brain. Dos usos:
 *   - variant="page" (default): pantalla completa en /tool/claude cuando el
 *     proyecto activo es privado y no hay gate. Al acertar → router.refresh()
 *     (el Server Component re-renderiza y muestra el chat).
 *   - variant="modal": overlay en la lista de proyectos al clickear uno privado
 *     bloqueado. Al acertar → onUnlocked(); "cancelar" → onCancel().
 */
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { showToast } from "@/lib/store/toast";

type Props = Readonly<{
  projectId: string;
  projectName: string;
  variant?: "page" | "modal";
  onUnlocked?: () => void;
  onCancel?: () => void;
}>;

export function ProjectPasswordGate({
  projectId,
  projectName,
  variant = "page",
  onUnlocked,
  onCancel,
}: Props) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/verify-password`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        // La cookie de gate quedó seteada.
        if (onUnlocked) onUnlocked();
        else router.refresh();
        return;
      }
      showToast({
        title: "CONTRASEÑA INCORRECTA",
        msg: "Probá de nuevo.",
        color: "var(--danger)",
      });
      setPassword("");
      setBusy(false);
    } catch {
      showToast({ title: "ERROR", msg: "error de red", color: "var(--danger)" });
      setBusy(false);
    }
  }

  const card = (
    <div
      style={{
        background: "var(--bg-elev)",
        border: "1px solid var(--line-strong)",
        borderRadius: 12,
        padding: 28,
        width: "100%",
        maxWidth: 420,
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 40, lineHeight: 1, marginBottom: 8 }}>🔒</div>
      <h2
        style={{
          fontFamily: "var(--serif)",
          fontStyle: "italic",
          fontSize: 24,
          margin: "0 0 8px",
        }}
      >
        {projectName}
      </h2>
      <p className="t-meta dim" style={{ lineHeight: 1.5, margin: "0 0 18px" }}>
        Proyecto privado. Ingresá la contraseña para ver su contenido.
      </p>
      <form onSubmit={submit}>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy}
          autoFocus
          placeholder="contraseña del proyecto"
          style={{
            width: "100%",
            background: "var(--bg)",
            border: "1px solid var(--line-strong)",
            borderRadius: 6,
            color: "var(--fg)",
            fontFamily: "var(--mono)",
            fontSize: 14,
            padding: "10px 12px",
            outline: "none",
            textAlign: "center",
          }}
        />
        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          {variant === "modal" && (
            <button
              type="button"
              className="btn secondary"
              onClick={onCancel}
              disabled={busy}
              style={{ flex: 1 }}
            >
              cancelar
            </button>
          )}
          <button
            type="submit"
            className="btn"
            disabled={busy || !password}
            style={{ flex: 1 }}
          >
            {busy ? "verificando…" : "acceder →"}
          </button>
        </div>
      </form>
    </div>
  );

  if (variant === "modal") {
    return (
      <div
        role="dialog"
        aria-modal="true"
        onClick={onCancel}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.6)",
          display: "grid",
          placeItems: "center",
          zIndex: 1000,
          padding: 16,
        }}
      >
        <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 420 }}>
          {card}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", placeItems: "center", height: "100%", padding: 24 }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 14,
        }}
      >
        {card}
        <Link
          href="/hub"
          prefetch={false}
          className="t-meta dim"
          style={{ textDecoration: "none" }}
        >
          ← volver al hub
        </Link>
      </div>
    </div>
  );
}
