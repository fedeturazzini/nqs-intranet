import { createServerClient } from "@/lib/db/supabase";

export const CONVERSATION_LIST_LIMIT = 20;
export const ADMIN_CONVERSATION_LIST_DEFAULT_LIMIT = 50;
export const ADMIN_CONVERSATION_LIST_MAX_LIMIT = 100;

export type ConversationListRow = {
  id: string;
  title: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type AdminConversationListRow = ConversationListRow & {
  project_id: string | null;
  project_name: string | null;
};

/**
 * Lista mínima del sidebar para un proyecto ya autorizado. El caller conserva
 * la responsabilidad de validar sesión, permiso y gate antes de invocarla.
 */
export async function listConversationsForProject(
  userId: string,
  projectId: string,
): Promise<ConversationListRow[]> {
  const db = createServerClient();
  const { data, error } = await db
    .from("claude_conversations")
    .select("id, title, created_at, updated_at")
    .eq("user_id", userId)
    .eq("project_id", projectId)
    .order("updated_at", { ascending: false })
    .limit(CONVERSATION_LIST_LIMIT);

  if (error) throw error;
  return data ?? [];
}

/**
 * Todas las conversaciones de un usuario (admin). Incluye nombre de proyecto.
 * Sin filtro de proyecto activo ni hard-limit 20 del empleado.
 */
export async function listConversationsForUser(
  userId: string,
  opts: { limit: number; offset: number },
): Promise<{ rows: AdminConversationListRow[]; hasMore: boolean }> {
  const db = createServerClient();
  const limit = Math.min(
    Math.max(1, opts.limit),
    ADMIN_CONVERSATION_LIST_MAX_LIMIT,
  );
  const offset = Math.max(0, opts.offset);

  const { data, error } = await db
    .from("claude_conversations")
    .select(
      "id, title, created_at, updated_at, project_id, projects(name)",
    )
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .range(offset, offset + limit); // pide limit+1 para hasMore

  if (error) throw error;

  const raw = data ?? [];
  const hasMore = raw.length > limit;
  const slice = hasMore ? raw.slice(0, limit) : raw;

  const rows: AdminConversationListRow[] = slice.map((row) => {
    const projects = row.projects as { name: string } | null;
    return {
      id: row.id,
      title: row.title,
      created_at: row.created_at,
      updated_at: row.updated_at,
      project_id: row.project_id,
      project_name: projects?.name ?? null,
    };
  });

  return { rows, hasMore };
}
