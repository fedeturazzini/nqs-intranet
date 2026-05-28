/**
 * /admin/access — Accesos & horarios por usuario.
 *
 * Server Component que pre-carga users + tools + accesses de TODOS los
 * users (suele ser una lista chica — 5-50 employees). El layout es:
 *
 *   ┌──────────┬─────────────────────────────────────┐
 *   │ users    │ panel del user seleccionado:        │
 *   │ list     │  cards de tools con toggle + sched  │
 *   └──────────┴─────────────────────────────────────┘
 *
 * Query param `?user=<uuid>` selecciona el user (también vincula desde
 * UserDetailModal).
 */
import { AccessPanel } from "@/components/admin/AccessPanel";
import { createServerClient } from "@/lib/db/supabase";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ user?: string }>;
};

export default async function AdminAccessPage({ searchParams }: PageProps) {
  const { user: selectedFromQuery } = await searchParams;
  const db = createServerClient();

  const [usersRes, toolsRes, accessRes] = await Promise.all([
    db
      .from("users")
      .select("id, email, name, initials, dept, role, is_active")
      .eq("is_active", true)
      .order("name", { ascending: true }),
    db
      .from("tools")
      .select("id, name, vendor, category, color, glyph, is_active, uses_credits")
      .order("name", { ascending: true }),
    db
      .from("tool_access")
      .select("user_id, tool_id, status, schedule, granted_at, expires_at"),
  ]);

  return (
    <AccessPanel
      users={usersRes.data ?? []}
      tools={toolsRes.data ?? []}
      accesses={accessRes.data ?? []}
      initialSelectedUserId={selectedFromQuery ?? null}
    />
  );
}
