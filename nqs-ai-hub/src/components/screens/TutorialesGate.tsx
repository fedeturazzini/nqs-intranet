"use client";

/**
 * Pantalla de "sin acceso" a Tutoriales (ajuste aux). Mismo patrón que
 * cualquier tool bloqueada: pedís acceso al admin con un click → se crea
 * una solicitud (POST /api/me/access-request) → notif a Slack. Si ya hay
 * una pendiente, el botón queda como "solicitud pendiente".
 */
import { useState } from "react";
import Link from "next/link";
import { showToast } from "@/lib/store/toast";

const REASON = "Solicito acceso a la sección de Tutoriales del estudio.";

type TutorialesGateProps = Readonly<{
  /** Si ya existe una solicitud 'access' pendiente del user para tutoriales. */
  alreadyPending?: boolean;
}>;

export function TutorialesGate({ alreadyPending = false }: TutorialesGateProps) {
  const [pending, setPending] = useState(alreadyPending);
  const [busy, setBusy] = useState(false);

  async function requestAccess() {
    if (busy || pending) return;
    setBusy(true);
    try {
      const res = await fetch("/api/me/access-request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ toolId: "tutoriales", reason: REASON }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };
      if (res.ok) {
        setPending(true);
        showToast({
          title: "SOLICITUD ENVIADA",
          msg: "Te avisamos cuando el admin la apruebe.",
          color: "var(--ok)",
        });
        return;
      }
      // Ya había una pendiente → reflejamos el estado igual.
      if (data.error === "already_pending") {
        setPending(true);
        showToast({
          title: "YA PEDISTE ACCESO",
          msg: "Tu solicitud está pendiente de aprobación.",
          color: "var(--warn)",
        });
        return;
      }
      showToast({
        title: "ERROR",
        msg: data.message ?? "no se pudo enviar la solicitud",
        color: "var(--danger)",
      });
    } catch {
      showToast({ title: "ERROR", msg: "error de red", color: "var(--danger)" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page" style={{ padding: 32 }}>
      <div
        style={{
          maxWidth: 520,
          margin: "8vh auto 0",
          textAlign: "center",
          border: "1px solid var(--line)",
          borderRadius: 16,
          padding: "48px 40px",
          background: "var(--bg-elev)",
        }}
      >
        <div style={{ fontSize: 44, marginBottom: 8 }}>📚</div>
        <div
          className="t-eyebrow"
          style={{ marginBottom: 12, color: "var(--fg-mute)" }}
        >
          ↳ ACCESO BLOQUEADO
        </div>
        <h1
          style={{
            fontFamily: "var(--serif)",
            fontStyle: "italic",
            fontSize: 32,
            margin: "0 0 10px",
            lineHeight: 1.1,
          }}
        >
          No tenés acceso a <em style={{ color: "var(--accent)" }}>Tutoriales.</em>
        </h1>
        <p className="t-meta dim" style={{ lineHeight: 1.6, marginBottom: 24 }}>
          {pending
            ? "Tu solicitud está pendiente de aprobación. Te avisamos cuando el admin la habilite."
            : "Pedile al admin que te habilite esta sección. Es un único permiso para todos los recorridos."}
        </p>

        <div
          style={{
            display: "flex",
            gap: 10,
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            className="btn"
            onClick={requestAccess}
            disabled={busy || pending}
            style={{ opacity: pending ? 0.6 : 1 }}
          >
            {pending
              ? "solicitud pendiente"
              : busy
                ? "enviando…"
                : "solicitar acceso al admin →"}
          </button>
          <Link href="/hub" prefetch={false} className="btn secondary">
            volver al hub
          </Link>
        </div>
      </div>
    </div>
  );
}
