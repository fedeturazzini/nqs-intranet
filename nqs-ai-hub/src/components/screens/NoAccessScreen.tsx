/**
 * Pantalla full cuando el admin bloqueó el acceso del user a 3DSky
 * (o nunca lo habilitó / quedó pending / expirado).
 */
import Link from "next/link";

type NoAccessScreenProps = Readonly<{
  /** Razón devuelta por `canUseTool` (sin tocar mensajes técnicos). */
  reason?: "no_access" | "pending_approval" | "expired";
  message?: string | null;
}>;

export function NoAccessScreen({ reason, message }: NoAccessScreenProps) {
  let title = "Acceso bloqueado";
  let body =
    "El admin cerró tu acceso a esta herramienta. Si pensás que es un error, contactalo.";
  if (reason === "pending_approval") {
    title = "Tu acceso está pendiente";
    body =
      "El admin todavía no aprobó tu solicitud para usar 3DSky. Te avisamos cuando responda.";
  } else if (reason === "expired") {
    title = "Tu acceso expiró";
    body =
      message ??
      "El acceso temporal que te habían otorgado venció. Pedile al admin que te lo renueve.";
  }

  return (
    <div
      className="page"
      style={{ maxWidth: 560, margin: "0 auto", padding: "60px 32px" }}
    >
      <div className="t-eyebrow" style={{ marginBottom: 16 }}>
        ↳ ACCESO {reason === "pending_approval" ? "PENDIENTE" : "BLOQUEADO"}
      </div>
      <h1
        className="t-display"
        style={{ fontSize: 44, margin: 0, letterSpacing: "-0.01em" }}
      >
        {title}
      </h1>
      <p className="muted" style={{ marginTop: 16, lineHeight: 1.6 }}>
        {body}
      </p>

      <div style={{ marginTop: 24 }}>
        <Link href="/hub" prefetch={false} className="btn secondary">
          ← volver al hub
        </Link>
      </div>
    </div>
  );
}
