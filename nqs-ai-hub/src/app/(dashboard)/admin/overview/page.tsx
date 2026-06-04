/**
 * /admin — Overview del panel admin.
 *
 * Server Component. 4 stat tiles + 2 widgets nuevos (sesión 11):
 *   - Pool 3DSky (total - asignados - usados).
 *   - Últimas 10 acciones del usage_logs con link a /admin/logs.
 */
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/server";
import { createServerClient } from "@/lib/db/supabase";
import { StatTile } from "@/components/admin/StatTile";

export const dynamic = "force-dynamic";

const DT = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

async function loadStats() {
  const db = createServerClient();
  const since7d = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const [
    usersRes,
    toolsRes,
    claudeCallsRes,
    pendingRes,
    poolsRes,
    allocsRes,
    recentLogsRes,
  ] = await Promise.all([
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
    db.from("credit_pools").select("total_credits").eq("tool_id", "3dsky"),
    db
      .from("credit_allocations")
      .select("credits_assigned, credits_used")
      .eq("tool_id", "3dsky"),
    db
      .from("usage_logs")
      .select(
        "id, action, tool_id, tokens_consumed, credits_consumed, created_at, users(name, initials)",
      )
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const poolTotal = (poolsRes.data ?? []).reduce(
    (s, p) => s + (p.total_credits ?? 0),
    0,
  );
  const allocated = (allocsRes.data ?? []).reduce(
    (s, a) => s + (a.credits_assigned ?? 0),
    0,
  );
  const used = (allocsRes.data ?? []).reduce(
    (s, a) => s + (a.credits_used ?? 0),
    0,
  );

  return {
    usersActive: usersRes.count ?? 0,
    toolsActive: toolsRes.count ?? 0,
    claudeCalls7d: claudeCallsRes.count ?? 0,
    pendingRequests: pendingRes.count ?? 0,
    pool3dsky: { total: poolTotal, allocated, used },
    recentLogs: recentLogsRes.data ?? [],
  };
}

export default async function AdminOverviewPage() {
  const session = await requireAdmin();
  const stats = await loadStats();
  const poolFree = stats.pool3dsky.total - stats.pool3dsky.allocated;

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
          accent={stats.pendingRequests > 0 ? "var(--warn)" : undefined}
        />
      </div>

      {/* Widgets — Pool 3DSky + Últimas acciones */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1.5fr",
          gap: 14,
          marginTop: 22,
        }}
      >
        {/* Pool 3DSky */}
        <Link
          href="/admin/credits"
          prefetch={false}
          style={{
            display: "block",
            padding: 18,
            border: "1px solid var(--line)",
            borderRadius: 10,
            background: "var(--bg-elev)",
            textDecoration: "none",
            color: "var(--fg)",
          }}
        >
          <div className="t-eyebrow" style={{ color: "var(--fg-mute)" }}>
            ↳ POOL 3DSKY
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 8,
              marginTop: 8,
            }}
          >
            <span
              style={{
                fontFamily: "var(--serif)",
                fontStyle: "italic",
                fontSize: 36,
                lineHeight: 1,
                letterSpacing: "-0.02em",
                color: poolFree < 0 ? "var(--danger)" : "var(--fg)",
              }}
            >
              {poolFree}
            </span>
            <span className="t-meta dim" style={{ fontSize: 11 }}>
              libres / {stats.pool3dsky.total}
            </span>
          </div>
          <div
            className="meter"
            style={{ width: "100%", marginTop: 10 }}
          >
            <div
              className="meter-fill"
              style={{
                width: `${stats.pool3dsky.total === 0 ? 0 : Math.min(100, (stats.pool3dsky.allocated / stats.pool3dsky.total) * 100)}%`,
                background:
                  poolFree < 20 ? "var(--warn)" : "#4FD1C5",
              }}
            />
          </div>
          <div className="t-meta dim" style={{ marginTop: 8, fontSize: 11 }}>
            {stats.pool3dsky.allocated} asignados · {stats.pool3dsky.used} consumidos →
            ir a gestión →
          </div>
        </Link>

        {/* Últimas 10 acciones */}
        <div
          style={{
            padding: 18,
            border: "1px solid var(--line)",
            borderRadius: 10,
            background: "var(--bg-elev)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 10,
            }}
          >
            <div className="t-eyebrow" style={{ color: "var(--fg-mute)" }}>
              ↳ ÚLTIMAS 10 ACCIONES
            </div>
            <Link
              href="/admin/logs"
              prefetch={false}
              className="t-meta"
              style={{
                color: "var(--accent)",
                textDecoration: "none",
                fontSize: 10,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              ver todos →
            </Link>
          </div>
          {stats.recentLogs.length === 0 && (
            <div
              className="t-meta dim"
              style={{ padding: "16px 0", textAlign: "center" }}
            >
              ↳ no hay actividad reciente
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column" }}>
            {stats.recentLogs.map((log) => {
              const u = (log.users as unknown as { name?: string; initials?: string } | null) ?? null;
              return (
                <div
                  key={log.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "auto 1fr auto auto",
                    gap: 8,
                    alignItems: "center",
                    padding: "8px 0",
                    borderBottom: "1px solid var(--line)",
                  }}
                >
                  <div
                    className="av"
                    style={{ width: 22, height: 22, fontSize: 9 }}
                    title={u?.name ?? ""}
                  >
                    {u?.initials ?? "?"}
                  </div>
                  <span style={{ fontSize: 12 }}>
                    <span style={{ color: "var(--fg-mute)" }}>
                      {log.tool_id ?? "—"} ·{" "}
                    </span>
                    <span className="mono">{log.action}</span>
                  </span>
                  <span
                    className="t-meta dim"
                    style={{ fontSize: 10, textAlign: "right" }}
                  >
                    {log.tokens_consumed != null
                      ? `${log.tokens_consumed} tok`
                      : log.credits_consumed != null
                        ? `${log.credits_consumed} cr`
                        : ""}
                  </span>
                  <span
                    className="t-meta dim"
                    style={{ fontSize: 10, fontFamily: "var(--mono)" }}
                  >
                    {log.created_at ? DT.format(new Date(log.created_at)) : "—"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
