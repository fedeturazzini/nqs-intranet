/**
 * /hub — placeholder protegido.
 *
 * El Hub real (grid de tools, filtros, etc.) se construye en sesión 05.
 * Acá sólo confirmamos que el guard de auth funciona y que el rol llega
 * a la página.
 */
import { LogoutButton } from "@/components/ui/LogoutButton";
import { requireAuth } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export default async function HubPage() {
  const session = await requireAuth();

  return (
    <main className="grow center" style={{ padding: 80 }}>
      <div
        className="col"
        style={{ alignItems: "center", gap: 24, textAlign: "center" }}
      >
        <div className="t-eyebrow">↳ DASHBOARD · HUB</div>
        <h1 className="t-display" style={{ fontSize: 48, margin: 0 }}>
          Hola, <em style={{ fontFamily: "var(--serif)" }}>{session.name}</em>.
        </h1>
        <p className="muted" style={{ margin: 0 }}>
          rol: <span className="mono">{session.role}</span> · email:{" "}
          <span className="mono">{session.email}</span>
        </p>
        <p className="muted" style={{ maxWidth: 520, margin: 0 }}>
          El Hub real se construye en{" "}
          <span className="mono">prompts/mvp/05-hub.md</span>.
        </p>
        <LogoutButton />
      </div>
    </main>
  );
}
