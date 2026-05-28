/**
 * /admin/credits — Pool de créditos 3DSky + asignación por usuario.
 *
 * Server Component pre-carga: pool total, allocations actuales, users.
 * El client component (`AdminCreditsView`) maneja los botones +/- con
 * actualización optimista contra `/api/admin/credits/allocations`.
 *
 * El layout `/admin` ya garantizó rol admin.
 */
import { AdminCreditsView } from "@/components/admin/AdminCreditsView";
import { createServerClient } from "@/lib/db/supabase";

export const dynamic = "force-dynamic";

const TOOL_ID = "3dsky";

async function loadCreditsState() {
  const db = createServerClient();
  const [poolsRes, allocsRes, usersRes] = await Promise.all([
    db
      .from("credit_pools")
      .select("total_credits")
      .eq("tool_id", TOOL_ID),
    db
      .from("credit_allocations")
      .select(
        "id, user_id, credits_assigned, credits_used, updated_at",
      )
      .eq("tool_id", TOOL_ID),
    db
      .from("users")
      .select("id, name, initials, email, dept, role, is_active")
      .eq("is_active", true)
      .order("name", { ascending: true }),
  ]);

  const poolTotal =
    (poolsRes.data ?? []).reduce((s, p) => s + (p.total_credits ?? 0), 0);

  const allocByUser = new Map(
    (allocsRes.data ?? []).map((a) => [a.user_id, a]),
  );

  // Por cada user (que no es admin), levantamos su allocation o 0.
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

export default async function AdminCreditsPage() {
  const state = await loadCreditsState();
  return (
    <div style={{ padding: 32, height: "100%", overflow: "auto" }}>
      <AdminCreditsView
        toolId={TOOL_ID}
        poolTotal={state.poolTotal}
        initialRows={state.rows}
      />
    </div>
  );
}
