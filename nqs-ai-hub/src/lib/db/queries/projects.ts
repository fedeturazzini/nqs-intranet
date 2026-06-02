/**
 * Queries de `projects` + `user_active_project` (migration 0008).
 *
 * Los proyectos son COMPARTIDOS del estudio (no por usuario). Cada
 * proyecto tiene su propio system prompt + memoria (en `system_prompts`
 * filtrando por `project_id`).
 *
 * Server-only.
 */
import { createServerClient } from "@/lib/db/supabase";
import type { ProjectRow } from "@/types/db-aliases";

/** Proyectos activos (para users), ordenados por creación (seed order). */
export async function listActiveProjects(): Promise<ProjectRow[]> {
  const db = createServerClient();
  const { data, error } = await db
    .from("projects")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Todos los proyectos (para el admin — incluye archivados). */
export async function listAllProjects(): Promise<ProjectRow[]> {
  const db = createServerClient();
  const { data, error } = await db
    .from("projects")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getProjectById(id: string): Promise<ProjectRow | null> {
  const db = createServerClient();
  const { data, error } = await db
    .from("projects")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getProjectBySlug(
  slug: string,
): Promise<ProjectRow | null> {
  const db = createServerClient();
  const { data, error } = await db
    .from("projects")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return data;
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
): Promise<ProjectRow | null> {
  const projectId = await getActiveProjectId(userId);
  if (!projectId) return null;
  const project = await getProjectById(projectId);
  if (!project || !project.is_active) return null;
  return project;
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
