import { hasProjectGate } from "@/lib/auth/project-gate";
import { createServerClient } from "@/lib/db/supabase";
import { getActiveProjectId, getProjectById } from "@/lib/db/queries/projects";
import { logWarn } from "@/lib/log";
import type { ExecuteParams } from "@/lib/adapters/types";

type ContextSource = NonNullable<ExecuteParams["projectContext"]>["source"];

export type ClaudeExecuteContext = {
  projectId: string;
  source: ContextSource;
};

export type ClaudeExecuteContextFailure = {
  status: number;
  error: string;
  message: string;
};

export type ClaudeExecuteContextResult =
  | { ok: true; value: ClaudeExecuteContext }
  | { ok: false; error: ClaudeExecuteContextFailure };

type ResolveOptions = {
  requestId?: string;
};

function failure(
  status: number,
  error: string,
  message: string,
): ClaudeExecuteContextResult {
  return { ok: false, error: { status, error, message } };
}

/**
 * Resuelve el proyecto canónico ANTES de abrir el stream.
 *
 * - Conversación existente: manda `claude_conversations.project_id`.
 * - Conversación nueva: manda el projectId explícito; el global queda como
 *   fallback temporal para clientes viejos.
 * - Conversación legacy sin project_id: explícito primero, global después, con
 *   telemetría. No re-clasificamos la conversación silenciosamente.
 */
export async function resolveClaudeExecuteContext(
  userId: string,
  input: Pick<ExecuteParams, "conversationId" | "projectId">,
  options: ResolveOptions = {},
): Promise<ClaudeExecuteContextResult> {
  const logBase = {
    route: "tools/claude/execute",
    userId,
    requestId: options.requestId,
    conversationId: input.conversationId ?? null,
    requestedProjectId: input.projectId ?? null,
  };

  let projectId: string | null = null;
  let source: ContextSource;

  if (input.conversationId) {
    const db = createServerClient();
    const { data: conversation, error } = await db
      .from("claude_conversations")
      .select("id, user_id, project_id")
      .eq("id", input.conversationId)
      .maybeSingle();

    if (error) throw error;
    if (!conversation) {
      return failure(404, "not_found", "Conversación no encontrada.");
    }
    if (conversation.user_id !== userId) {
      return failure(403, "forbidden", "No tenés acceso a esta conversación.");
    }

    if (conversation.project_id) {
      projectId = conversation.project_id;
      source = "conversation";
      if (input.projectId && input.projectId !== projectId) {
        logWarn("execute: contexto de proyecto no coincide", {
          ...logBase,
          status: 409,
          reason: "project_context_mismatch",
          conversationProjectId: projectId,
        });
        return failure(
          409,
          "project_context_mismatch",
          "Esta conversación pertenece a otro proyecto. Recargá o reabrí el proyecto antes de continuar.",
        );
      }
    } else {
      logWarn("execute: conversación sin proyecto", {
        ...logBase,
        reason: "conversation_project_null",
      });

      if (input.projectId) {
        projectId = input.projectId;
        source = "legacy_request";
      } else {
        projectId = await getActiveProjectId(userId);
        if (!projectId) {
          return failure(
            409,
            "legacy_conversation_no_project",
            "Esta conversación no tiene un proyecto asociado. Elegí un proyecto y volvé a abrirla.",
          );
        }
        source = "legacy_global_fallback";
        logWarn("execute: fallback al proyecto activo global", {
          ...logBase,
          reason: "global_project_fallback",
          resolvedProjectId: projectId,
          source,
        });
      }
    }
  } else if (input.projectId) {
    projectId = input.projectId;
    source = "request";
  } else {
    projectId = await getActiveProjectId(userId);
    if (!projectId) {
      return failure(
        400,
        "project_required",
        "Seleccioná un proyecto antes de usar Claude.",
      );
    }
    source = "global_fallback";
    logWarn("execute: fallback al proyecto activo global", {
      ...logBase,
      reason: "global_project_fallback",
      resolvedProjectId: projectId,
      source,
    });
  }

  const project = await getProjectById(projectId);
  if (!project || !project.is_active) {
    return failure(
      404,
      "project_not_available",
      "Este proyecto ya no está disponible.",
    );
  }

  if (project.is_private && !(await hasProjectGate(projectId))) {
    return failure(
      403,
      "project_locked",
      "Este proyecto es privado. Ingresá la contraseña para usarlo.",
    );
  }

  return { ok: true, value: { projectId, source } };
}
