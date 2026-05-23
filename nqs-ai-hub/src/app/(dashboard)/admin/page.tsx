/**
 * /admin — placeholder protegido por rol admin.
 *
 * El layout ya garantiza sesión, pero el chequeo de rol vive en la
 * página (el layout es común a employees también). El panel admin real
 * arranca en sesión 10.
 */
import { requireAdmin } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await requireAdmin();

  return (
    <div className="page">
      <div className="t-eyebrow" style={{ marginBottom: 12 }}>
        ↳ ADMIN · OVERVIEW
      </div>
      <h1 className="t-display" style={{ fontSize: 48, margin: 0 }}>
        Admin: <em style={{ fontFamily: "var(--serif)" }}>{session.name}</em>
      </h1>
      <p className="muted" style={{ marginTop: 12, maxWidth: 520 }}>
        El panel admin real se construye en{" "}
        <span className="mono">prompts/mvp/10-admin-base.md</span>.
      </p>
    </div>
  );
}
