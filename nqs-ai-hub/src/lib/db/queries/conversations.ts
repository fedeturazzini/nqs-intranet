import { createServerClient } from "@/lib/db/supabase";

export const CONVERSATION_LIST_LIMIT = 20;

export type ConversationListRow = {
  id: string;
  title: string | null;
  created_at: string | null;
  updated_at: string | null;
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
