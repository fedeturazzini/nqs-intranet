"use client";

/**
 * Pantalla de "sin acceso" a Tutoriales. Reusa RequestAccessModal para
 * pedirle el acceso al admin (igual que las tools bloqueadas del hub).
 */
import { useState } from "react";
import { RequestAccessModal } from "@/components/tool/RequestAccessModal";

export function TutorialesGate() {
  const [open, setOpen] = useState(false);

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
        <div className="t-eyebrow" style={{ marginBottom: 12 }}>
          ↳ TUTORIALES
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
          Tu acceso a Tutoriales <em style={{ color: "var(--accent)" }}>no está habilitado.</em>
        </h1>
        <p className="t-meta dim" style={{ lineHeight: 1.6, marginBottom: 24 }}>
          Es un único permiso. Pedíselo al admin y con eso accedés a todos los
          recorridos del estudio.
        </p>
        <button type="button" className="btn" onClick={() => setOpen(true)}>
          solicitar acceso al admin →
        </button>
      </div>

      <RequestAccessModal
        open={open}
        toolId="tutoriales"
        toolName="Tutoriales"
        toolGlyph="📚"
        toolColor="var(--accent)"
        onClose={() => setOpen(false)}
        onSubmitted={() => setOpen(false)}
      />
    </div>
  );
}
