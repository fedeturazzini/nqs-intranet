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

/** Persona (nodo del organigrama) con lo que necesita el auto-layout. */
export type OrgPerson = {
  id: string;
  name: string;
  dept: string | null;
  orgRole: string | null;
  reportsToId: string | null;
  orgPosition: number | null;
  orgX: number | null;
  orgY: number | null;
};

/** Caja de área (org_dept_nodes): agrupa reportes de una persona por dept. */
export type OrgDeptNode = {
  id: string;
  name: string;
  department: string | null;
  parentPersonId: string | null;
  accent: string | null;
  sortOrder: number | null;
  orgX: number | null;
  orgY: number | null;
};

/**
 * Datos crudos para el auto-layout del organigrama híbrido: personas in-org +
 * cajas de área. Las posiciones/edges/teamCount se calculan en
 * `src/lib/org/layout.ts` a partir de esto (posición = override org_x/org_y ??
 * calculada). No ordena — el layout ordena hermanos por org_position → nombre.
 */
export async function getOrgLayoutData(): Promise<{
  persons: OrgPerson[];
  deptNodes: OrgDeptNode[];
}> {
  const db = createServerClient();
  const [personsRes, deptRes] = await Promise.all([
    db
      .from("users")
      .select(
        "id, name, dept, org_role, reports_to_id, org_position, org_x, org_y",
      )
      .eq("is_in_org", true)
      .eq("is_active", true),
    db
      .from("org_dept_nodes")
      .select(
        "id, name, department, parent_person_id, accent, sort_order, org_x, org_y",
      ),
  ]);
  if (personsRes.error) throw personsRes.error;
  if (deptRes.error) throw deptRes.error;
  const persons: OrgPerson[] = (personsRes.data ?? []).map((u) => ({
    id: u.id,
    name: u.name,
    dept: u.dept,
    orgRole: u.org_role,
    reportsToId: u.reports_to_id,
    orgPosition: u.org_position,
    orgX: u.org_x,
    orgY: u.org_y,
  }));
  const deptNodes: OrgDeptNode[] = (deptRes.data ?? []).map((d) => ({
    id: d.id,
    name: d.name,
    department: d.department,
    parentPersonId: d.parent_person_id,
    accent: d.accent,
    sortOrder: d.sort_order,
    orgX: d.org_x,
    orgY: d.org_y,
  }));
  return { persons, deptNodes };
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
