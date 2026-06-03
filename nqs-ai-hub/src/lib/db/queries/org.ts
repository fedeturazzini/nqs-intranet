/**
 * Queries del organigrama (migration 0010).
 *
 * El árbol se arma desde `users.reports_to_id`. Acá solo traemos los nodos
 * (users con is_in_org=true); el layout del árbol lo hace el componente.
 *
 * Server-only.
 */
import { createServerClient } from "@/lib/db/supabase";

export type OrgNode = {
  id: string;
  name: string;
  initials: string;
  dept: string | null;
  orgRole: string | null;
  reportsToId: string | null;
  orgPosition: number | null;
};

/** Users que están en el organigrama (is_in_org=true). */
export async function getOrgNodes(): Promise<OrgNode[]> {
  const db = createServerClient();
  const { data, error } = await db
    .from("users")
    .select("id, name, initials, dept, org_role, reports_to_id, org_position")
    .eq("is_in_org", true)
    .eq("is_active", true);
  if (error) throw error;
  return (data ?? []).map((u) => ({
    id: u.id,
    name: u.name,
    initials: u.initials,
    dept: u.dept,
    orgRole: u.org_role,
    reportsToId: u.reports_to_id,
    orgPosition: u.org_position,
  }));
}

/** Todos los users (para el panel admin del organigrama). */
export async function getAllUsersForOrg(): Promise<
  Array<OrgNode & { isInOrg: boolean }>
> {
  const db = createServerClient();
  const { data, error } = await db
    .from("users")
    .select(
      "id, name, initials, dept, org_role, reports_to_id, org_position, is_in_org",
    )
    .eq("is_active", true)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((u) => ({
    id: u.id,
    name: u.name,
    initials: u.initials,
    dept: u.dept,
    orgRole: u.org_role,
    reportsToId: u.reports_to_id,
    orgPosition: u.org_position,
    isInOrg: u.is_in_org,
  }));
}

/**
 * ¿Setear `reportsToId` como jefe de `userId` crearía un ciclo? Caminamos
 * hacia arriba desde `reportsToId`; si llegamos a `userId`, hay ciclo.
 */
export async function wouldCreateCycle(
  userId: string,
  reportsToId: string,
): Promise<boolean> {
  if (userId === reportsToId) return true;
  const db = createServerClient();
  let current: string | null = reportsToId;
  const seen = new Set<string>();
  while (current !== null) {
    if (current === userId) return true;
    if (seen.has(current)) break; // ciclo preexistente — cortamos
    seen.add(current);
    const cur: string = current;
    const { data } = await db
      .from("users")
      .select("reports_to_id")
      .eq("id", cur)
      .maybeSingle();
    const parent = data as { reports_to_id: string | null } | null;
    current = parent?.reports_to_id ?? null;
  }
  return false;
}
