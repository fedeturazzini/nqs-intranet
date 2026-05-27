"use client";

/**
 * Pantalla full cuando el user tiene acceso a 3DSky pero 0 créditos.
 *
 * Client porque incluye el modal de solicitud (state + Esc handling).
 */
import { useState } from "react";
import Link from "next/link";
import { CreditRequestModal } from "@/components/tool/CreditRequestModal";
import { showToast } from "@/lib/store/toast";

export function NoCreditsScreen() {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="page"
      style={{ maxWidth: 560, margin: "0 auto", padding: "60px 32px" }}
    >
      <div className="t-eyebrow" style={{ marginBottom: 16 }}>
        ↳ SIN CRÉDITOS
      </div>
      <h1
        className="t-display"
        style={{ fontSize: 44, margin: 0, letterSpacing: "-0.01em" }}
      >
        No tenés créditos de{" "}
        <em style={{ fontFamily: "var(--serif)" }}>3DSky</em>.
      </h1>
      <p className="muted" style={{ marginTop: 16, lineHeight: 1.6 }}>
        Pedile al admin que te asigne créditos para usar 3DSky. Al confirmar
        el pedido, le llega una notificación a Slack.
      </p>

      <div
        className="row"
        style={{
          display: "flex",
          gap: 10,
          marginTop: 24,
        }}
      >
        <button
          type="button"
          className="btn"
          onClick={() => setOpen(true)}
        >
          solicitar créditos
        </button>
        <Link href="/hub" prefetch={false} className="btn secondary">
          ← volver al hub
        </Link>
      </div>

      <CreditRequestModal
        open={open}
        currentCredits={0}
        onClose={() => setOpen(false)}
        onSubmitted={(requestId) => {
          setOpen(false);
          showToast({
            title: "SOLICITUD ENVIADA",
            msg: `Pedido ${requestId.slice(0, 8)}… mandado al admin.`,
            color: "var(--ok)",
          });
        }}
      />
    </div>
  );
}
