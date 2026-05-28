/**
 * /admin — Overview del panel admin.
 *
 * Server Component. 4 stat tiles con queries livianas (head:true cuando
 * solo necesitamos contar). El panel completo de gráficos/exportación
 * es v2 — esto es lo mínimo para tener algo en la home del admin.
 */
import { requireAdmin } from "@/lib/auth/server";
import { createServerClient } from "@/lib/db/supabase";
import { StatTile } from "@/components/admin/StatTile";

export const dynamic = "force-dynamic";

async function loadStats() {
  const db = createServerClient();
  const since7d = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const [usersRes, toolsRes, claudeCallsRes, pendingRes] = await Promise.all([
    db
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true),
    db
      .from("tools")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true),
    db
      .from("usage_logs")
      .select("id", { count: "exact", head: true })
      .eq("action", "claude.execute")
      .gte("created_at", since7d),
    db
      .from("access_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
  ]);

  return {
    usersActive: usersRes.count ?? 0,
    toolsActive: toolsRes.count ?? 0,
    claudeCalls7d: claudeCallsRes.count ?? 0,
    pendingRequests: pendingRes.count ?? 0,
  };
}

export default async function AdminOverviewPage() {
  const session = await requireAdmin();
  const stats = await loadStats();

  return (
    <div className="page" style={{ padding: "32px" }}>
      <div className="t-eyebrow" style={{ marginBottom: 14 }}>
        ↳ ADMIN · OVERVIEW
      </div>
      <h1
        className="page-title"
        style={{ fontSize: 36, margin: 0, letterSpacing: "-0.01em" }}
      >
        Hola, <em style={{ fontFamily: "var(--serif)" }}>{session.name}</em>.
      </h1>
      <p className="muted" style={{ marginTop: 8, marginBottom: 28 }}>
        Resumen rápido del workspace.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 14,
          marginTop: 14,
        }}
      >
        <StatTile label="USUARIOS ACTIVOS" value={stats.usersActive} />
        <StatTile
          label="TOOLS HABILITADAS"
          value={stats.toolsActive}
          accent="#4FD1C5"
        />
        <StatTile
          label="LLAMADAS CLAUDE · 7D"
          value={stats.claudeCalls7d}
          accent="#D97757"
        />
        <StatTile
          label="SOLICITUDES PENDIENTES"
          value={stats.pendingRequests}
          accent={
            stats.pendingRequests > 0 ? "var(--warn)" : undefined
          }
        />
      </div>
    </div>
  );
}
