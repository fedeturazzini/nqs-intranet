/**
 * /admin — placeholder protegido por rol admin.
 *
 * El panel admin real (ABM users, ABM créditos, editor de system prompt)
 * se construye en sesiones 10-11. Acá solo confirmamos el guard.
 */
import { LogoutButton } from "@/components/ui/LogoutButton";
import { requireAdmin } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await requireAdmin();

  return (
    <main className="grow center" style={{ padding: 80 }}>
      <div
        className="col"
        style={{ alignItems: "center", gap: 24, textAlign: "center" }}
      >
        <div className="t-eyebrow">↳ ADMIN · OVERVIEW</div>
        <h1 className="t-display" style={{ fontSize: 48, margin: 0 }}>
          Admin: <em style={{ fontFamily: "var(--serif)" }}>{session.name}</em>
        </h1>
        <p className="muted" style={{ margin: 0 }}>
          email: <span className="mono">{session.email}</span>
        </p>
        <p className="muted" style={{ maxWidth: 520, margin: 0 }}>
          El panel admin real se construye en{" "}
          <span className="mono">prompts/mvp/10-admin-base.md</span>.
        </p>
        <LogoutButton />
      </div>
    </main>
  );
}
