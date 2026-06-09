/**
 * /admin/credits — Pool de créditos + asignación por usuario, por tool.
 *
 * Multi-tool: hay un selector con todas las tools que usan créditos
 * (`uses_credits = true`), así que 3DSky, Kling y cualquier tool futura
 * aparecen solas. El tool activo viene de `?tool=…` (default 3dsky).
 *
 * Server Component pre-carga: pool total, allocations actuales, users. El
 * client (`AdminCreditsView`) maneja los +/- con update optimista.
 *
 * El layout `/admin` ya garantizó rol admin.
 */
import Link from "next/link";
import { AdminCreditsView } from "@/components/admin/AdminCreditsView";
import { createServerClient } from "@/lib/db/supabase";

export const dynamic = "force-dynamic";

type CreditTool = { id: string; name: string };

async function loadCreditTools(): Promise<CreditTool[]> {
  const db = createServerClient();
  const { data } = await db
    .from("tools")
    .select("id, name")
    .eq("uses_credits", true)
    .eq("is_active", true)
    .order("name", { ascending: true });
  return data ?? [];
}

async function loadCreditsState(toolId: string) {
  const db = createServerClient();
  const [poolsRes, allocsRes, usersRes] = await Promise.all([
    db.from("credit_pools").select("total_credits").eq("tool_id", toolId),
    db
      .from("credit_allocations")
      .select("id, user_id, credits_assigned, credits_used, updated_at")
      .eq("tool_id", toolId),
    db
      .from("users")
      .select("id, name, initials, email, dept, role, is_active")
      .eq("is_active", true)
      .order("name", { ascending: true }),
  ]);

  const poolTotal = (poolsRes.data ?? []).reduce(
    (s, p) => s + (p.total_credits ?? 0),
    0,
  );

  const allocByUser = new Map(
    (allocsRes.data ?? []).map((a) => [a.user_id, a]),
  );

  const rows = (usersRes.data ?? [])
    .filter((u) => u.role === "employee")
    .map((u) => {
      const alloc = allocByUser.get(u.id);
      return {
        userId: u.id,
        name: u.name,
        initials: u.initials,
        dept: u.dept,
        role: u.role as "admin" | "employee",
        assigned: alloc?.credits_assigned ?? 0,
        used: alloc?.credits_used ?? 0,
        allocationId: alloc?.id ?? null,
      };
    });

  return { poolTotal, rows };
}

export default async function AdminCreditsPage({
  searchParams,
}: {
  searchParams: Promise<{ tool?: string }>;
}) {
  const [{ tool }, tools] = await Promise.all([
    searchParams,
    loadCreditTools(),
  ]);

  // Tool seleccionado: el de la query si es válido; si no, 3dsky o el primero.
  const validIds = new Set(tools.map((t) => t.id));
  const toolId =
    tool && validIds.has(tool)
      ? tool
      : tools.find((t) => t.id === "3dsky")?.id ?? tools[0]?.id ?? "3dsky";

  const state = await loadCreditsState(toolId);

  return (
    <div style={{ padding: 32, height: "100%", overflow: "auto" }}>
      {tools.length > 1 && (
        <div
          className="row"
          style={{ gap: 8, marginBottom: 18, flexWrap: "wrap" }}
        >
          {tools.map((t) => (
            <Link
              key={t.id}
              href={`/admin/credits?tool=${t.id}`}
              prefetch={false}
              className={`btn sm ${t.id === toolId ? "" : "secondary"}`}
            >
              {t.name}
            </Link>
          ))}
        </div>
      )}
      <AdminCreditsView
        toolId={toolId}
        poolTotal={state.poolTotal}
        initialRows={state.rows}
      />
    </div>
  );
}
