"use client";

/**
 * Gate de password del panel de Gastos. Se muestra cuando no hay cookie
 * `gastos_gate` válida. Al acertar, el endpoint setea la cookie y
 * recargamos para mostrar el contenido.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { showToast } from "@/lib/store/toast";

export function GastosPasswordGate() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/gastos/verify-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.refresh();
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

  return (
    <div
      style={{
        display: "grid",
        placeItems: "center",
        height: "100%",
        padding: 24,
      }}
    >
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
          Acceso a Gastos
        </h2>
        <p className="t-meta dim" style={{ lineHeight: 1.5, margin: "0 0 18px" }}>
          Esta sección está protegida. Ingresá la contraseña para ver gastos y
          detalles.
        </p>
        <form onSubmit={submit}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
            autoFocus
            placeholder="contraseña de Gastos"
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
          <button
            type="submit"
            className="btn"
            disabled={busy || !password}
            style={{ width: "100%", marginTop: 14 }}
          >
            {busy ? "verificando…" : "acceder →"}
          </button>
        </form>
      </div>
    </div>
  );
}
