/**
 * /hub — placeholder. El layout `(dashboard)` ya garantiza que hay
 * sesión, así que acá no hace falta `requireAuth` (lo deja por defensa
 * en profundidad — `cache()` por request evita doble query).
 *
 * El Hub real (grid de tools + filtros) se construye en sesión 05.
 */
import { requireAuth } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export default async function HubPage() {
  await requireAuth();

  return (
    <div className="page">
      <div className="t-eyebrow" style={{ marginBottom: 12 }}>
        ↳ DASHBOARD · HUB
      </div>
      <h1 className="t-display" style={{ fontSize: 48, margin: 0 }}>
        Hub <em style={{ fontFamily: "var(--serif)" }}>(próxima sesión)</em>
      </h1>
      <p className="muted" style={{ marginTop: 12, maxWidth: 520 }}>
        El grid de herramientas se construye en{" "}
        <span className="mono">prompts/mvp/05-hub.md</span>.
      </p>
    </div>
  );
}
