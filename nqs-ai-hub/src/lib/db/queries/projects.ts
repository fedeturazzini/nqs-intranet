/**
 * Queries de `projects` + `user_active_project` (migration 0008).
 *
 * Los proyectos son COMPARTIDOS del estudio (no por usuario). Cada
 * proyecto tiene su propio system prompt + memoria (en `system_prompts`
 * filtrando por `project_id`).
 *
 * Privacidad (migration 0016): un proyecto puede ser privado (con
 * contraseña). El `password_hash` NUNCA se expone al cliente — estos helpers
 * devuelven `PublicProject` (sin el hash). La contraseña se lee solo en los
 * endpoints de verify/change-password con un select directo.
 *
 * Server-only.
 */
import { createServerClient } from "@/lib/db/supabase";
import type { ProjectRow } from "@/types/db-aliases";

/** Proyecto sin el hash de la contraseña — lo único que puede salir al cliente. */
export type PublicProject = Omit<ProjectRow, "password_hash">;

/** Saca `password_hash` antes de devolver un proyecto (defensa contra leaks). */
function toPublic(p: ProjectRow): PublicProject {
  const clone: Partial<ProjectRow> = { ...p };
  delete clone.password_hash;
  return clone as PublicProject;
}

/** Proyectos activos (para users), ordenados por creación (seed order). */
export async function listActiveProjects(): Promise<PublicProject[]> {
  const db = createServerClient();
  const { data, error } = await db
    .from("projects")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(toPublic);
}

/** Todos los proyectos (para el admin — incluye archivados). */
export async function listAllProjects(): Promise<PublicProject[]> {
  const db = createServerClient();
  const { data, error } = await db
    .from("projects")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(toPublic);
}

export async function getProjectById(id: string): Promise<PublicProject | null> {
  const db = createServerClient();
  const { data, error } = await db
    .from("projects")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? toPublic(data) : null;
}

/**
 * Campos mínimos que necesita el preflight de Claude. Incluye nombre para el
 * log `execute.context` y gate_version para validar la cookie sin releer la
 * misma fila dentro del request.
 */
export type ProjectExecuteContextRow = {
  id: string;
  name: string;
  is_active: boolean;
  is_private: boolean;
  gate_version: number;
};

export async function getProjectForExecuteContext(
  id: string,
): Promise<ProjectExecuteContextRow | null> {
  const db = createServerClient();
  const { data, error } = await db
    .from("projects")
    .select("id, name, is_active, is_private, gate_version")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function getProjectBySlug(
  slug: string,
): Promise<PublicProject | null> {
  const db = createServerClient();
  const { data, error } = await db
    .from("projects")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return data ? toPublic(data) : null;
}

/**
 * Campos mínimos para el gate de acceso (migration 0016). Devuelve null si el
 * proyecto no existe. Lo usa `hasProjectGate` y las rutas admin que necesitan
 * el `gate_version` actual para incrementarlo.
 */
export async function getProjectGateFields(
  id: string,
): Promise<{ id: string; is_private: boolean; gate_version: number } | null> {
  const db = createServerClient();
  const { data, error } = await db
    .from("projects")
    .select("id, is_private, gate_version")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

/** Id del proyecto activo del user, o null si todavía no eligió. */
export async function getActiveProjectId(
  userId: string,
): Promise<string | null> {
  const db = createServerClient();
  const { data, error } = await db
    .from("user_active_project")
    .select("project_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data?.project_id ?? null;
}

/**
 * Proyecto activo del user (resuelto). Devuelve null si no eligió ninguno
 * o si el proyecto quedó archivado (is_active=false) — en ese caso el user
 * tendrá que elegir de nuevo.
 */
export async function getActiveProjectForUser(
  userId: string,
): Promise<PublicProject | null> {
  const db = createServerClient();
  const { data, error } = await db
    .from("user_active_project")
    .select(
      "project:projects!user_active_project_project_id_fkey(*)",
    )
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;

  const relation = data?.project;
  const project = Array.isArray(relation) ? relation[0] : relation;
  if (!project || !project.is_active) return null;
  return toPublic(project);
}

/**
 * Nombre + privacidad de un proyecto, liviano (sin `select *`). Para el log de
 * diagnóstico `execute.context` (aux-log-system-brain): confirma qué proyecto se
 * usó realmente en cada llamada a Anthropic (bug de "pestañas mezcladas").
 */
export async function getProjectSummary(
  id: string,
): Promise<{ name: string; isPrivate: boolean } | null> {
  const db = createServerClient();
  const { data, error } = await db
    .from("projects")
    .select("name, is_private")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? { name: data.name, isPrivate: data.is_private } : null;
}

/** Setea/actualiza el proyecto activo del user (upsert por user_id). */
export async function setActiveProject(
  userId: string,
  projectId: string,
): Promise<void> {
  const db = createServerClient();
  const { error } = await db.from("user_active_project").upsert(
    {
      user_id: userId,
      project_id: projectId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw error;
}
