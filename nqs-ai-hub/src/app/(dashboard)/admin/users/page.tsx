/**
 * /admin/users — ABM de usuarios.
 *
 * Server Component pre-carga la lista (3 queries en paralelo). Los
 * modales (crear, editar, dar de baja) pegan al endpoint REST desde el
 * cliente — `UsersTable` los maneja.
 *
 * El layout del segmento `/admin` ya garantizó rol admin.
 */
import { UsersTable } from "@/components/admin/UsersTable";
import { createServerClient } from "@/lib/db/supabase";

export const dynamic = "force-dynamic";

type UserRow = {
  id: string;
  email: string;
  name: string;
  initials: string;
  role: "admin" | "employee";
  dept: string | null;
  job_title: string | null;
  is_active: boolean | null;
  created_at: string | null;
  tools_active_count: number;
  last_sign_in_at: string | null;
};

async function fetchUsers(): Promise<UserRow[]> {
  const db = createServerClient();

  // 3 queries paralelas — son independientes.
  const [usersRes, accessRes, authRes] = await Promise.all([
    db
      .from("users")
      .select(
        "id, email, name, initials, role, dept, job_title, is_active, created_at",
      )
      .order("created_at", { ascending: true }),
    db.from("tool_access").select("user_id, status").eq("status", "active"),
    db.auth.admin.listUsers({ page: 1, perPage: 200 }),
  ]);

  const activeCount = new Map<string, number>();
  for (const a of accessRes.data ?? []) {
    activeCount.set(a.user_id, (activeCount.get(a.user_id) ?? 0) + 1);
  }

  const lastSignIn = new Map<string, string | null>();
  for (const u of authRes.data?.users ?? []) {
    lastSignIn.set(u.id, u.last_sign_in_at ?? null);
  }

  return (usersRes.data ?? []).map((u) => ({
    ...u,
    role: u.role as "admin" | "employee",
    tools_active_count: activeCount.get(u.id) ?? 0,
    last_sign_in_at: lastSignIn.get(u.id) ?? null,
  }));
}

export default async function AdminUsersPage() {
  const users = await fetchUsers();
  return (
    <div className="page" style={{ padding: 32 }}>
      <UsersTable initialUsers={users} />
    </div>
  );
}
