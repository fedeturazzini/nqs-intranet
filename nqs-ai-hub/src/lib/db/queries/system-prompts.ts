/**
 * Queries de system_prompts (el "cerebro" + la "memoria" de cada tool).
 *
 * Desde la migration 0006 hay 2 tipos de prompt por tool:
 *   - `type='system'` → el cerebro (instrucciones del asistente)
 *   - `type='memory'` → contexto del workspace (proyectos activos,
 *      clientes, glosario, etc). Editable independientemente del system.
 *
 * Server-only — el contenido desencriptado NUNCA sale al cliente. Solo
 * se usa para mandárselo a Anthropic en el endpoint de Claude, y para
 * el editor del panel admin (que también es server-side).
 */
import { createServerClient } from "@/lib/db/supabase";
import { decrypt, encrypt } from "@/lib/utils/crypto";
import type { SystemPromptRow, ToolId } from "@/types/db-aliases";

export type SystemPromptType = "system" | "memory";

export type ActiveSystemPrompt = {
  id: string;
  toolId: ToolId;
  type: SystemPromptType;
  name: string;
  version: number;
  /** Modelo a usar para esta versión (Haiku/Sonnet/Opus). */
  model: string;
  content: string; // plaintext, ya desencriptado
};

/**
 * Devuelve el prompt activo de una tool para un type específico.
 * Si no hay ninguno activo, devuelve null.
 */
export async function getActiveSystemPrompt(
  toolId: ToolId,
  type: SystemPromptType = "system",
): Promise<ActiveSystemPrompt | null> {
  const db = createServerClient();
  const { data, error } = await db
    .from("system_prompts")
    .select("*")
    .eq("tool_id", toolId)
    .eq("type", type)
    .eq("is_active", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const raw = data.content_encrypted ?? "";
  return {
    id: data.id,
    toolId: data.tool_id as ToolId,
    type: (data.type === "memory" ? "memory" : "system") as SystemPromptType,
    name: data.name,
    version: data.version ?? 1,
    model: data.model,
    content: raw === "" ? "" : decrypt(raw),
  };
}

/**
 * Devuelve los dos prompts activos (system + memory) en una sola query.
 * Útil para el adapter de Claude que concatena ambos antes de pegarle
 * a la API.
 */
export async function getActiveSystemAndMemory(
  toolId: ToolId,
): Promise<{
  system: ActiveSystemPrompt | null;
  memory: ActiveSystemPrompt | null;
}> {
  const db = createServerClient();
  const { data, error } = await db
    .from("system_prompts")
    .select("*")
    .eq("tool_id", toolId)
    .eq("is_active", true)
    .in("type", ["system", "memory"])
    .order("version", { ascending: false });

  if (error) throw error;

  // Si hay múltiples activos del mismo type (no debería), el primero
  // por version desc gana.
  let system: ActiveSystemPrompt | null = null;
  let memory: ActiveSystemPrompt | null = null;
  for (const row of data ?? []) {
    const t = row.type === "memory" ? "memory" : "system";
    // `content_encrypted` puede ser '' en memorias recién creadas (la
    // migration 0006 insertó una memoria vacía como bootstrap). `decrypt`
    // espera el formato `v1.<iv>.<ct>.<tag>`; si llega vacío, asumimos
    // memoria vacía y no tocamos.
    const raw = row.content_encrypted ?? "";
    const content = raw === "" ? "" : decrypt(raw);
    const parsed: ActiveSystemPrompt = {
      id: row.id,
      toolId: row.tool_id as ToolId,
      type: t,
      name: row.name,
      version: row.version ?? 1,
      model: row.model,
      content,
    };
    if (t === "system" && !system) system = parsed;
    if (t === "memory" && !memory) memory = parsed;
  }
  return { system, memory };
}

/**
 * Actualiza el contenido (plaintext) de un prompt. Se encripta antes de
 * persistir. No toca `is_active`, `tool_id`, `type` ni `version` — para
 * versionar usar el flow del endpoint admin que crea row nuevo.
 */
export async function updateSystemPrompt(
  id: string,
  content: string,
): Promise<SystemPromptRow> {
  const db = createServerClient();
  const { data, error } = await db
    .from("system_prompts")
    .update({ content_encrypted: encrypt(content) })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}
