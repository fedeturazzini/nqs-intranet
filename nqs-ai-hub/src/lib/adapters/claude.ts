/**
 * ClaudeAdapter — wrapper sobre la API de Anthropic.
 *
 * Características:
 *   - El system prompt vive cifrado en `system_prompts` y NUNCA sale
 *     al cliente. Se desencripta server-side y se manda como `system:`
 *     en el call al SDK.
 *   - Soporta multimodal: el caller puede pasar hasta N imágenes en
 *     base64 (la validación de N la hace Zod en el endpoint).
 *   - Conversaciones persistentes: si viene `conversationId`, levanta
 *     la historia y la mete en el contexto; si no, crea una conv nueva
 *     con título derivado del primer prompt.
 *
 * Orden de operaciones (importante para minimizar partial state):
 *   1. Fetch system prompt (DB)
 *   2. Si hay conversationId, levantar mensajes previos + validar ownership
 *   3. Llamar a Anthropic (caro)
 *   4. Si OK: crear conversación si nueva + persistir user msg + asistente
 *   5. Loguear usage
 *
 * Si #4 o #5 fallan después de un Anthropic OK, devolvemos igual la
 * respuesta al user (ya pagamos esos tokens) y dejamos console.error
 * con la metadata para auditar. Esto NO es una transacción real —
 * Supabase JS no las soporta. Para atomicidad de verdad habría que
 * mover la persistencia + log a un RPC de Postgres.
 */
import {
  buildUserContent,
  callClaude,
  type ClaudeMessage,
} from "@/lib/anthropic/client";
import { createServerClient } from "@/lib/db/supabase";
import { getToolAccess } from "@/lib/db/queries/tools";
import { getActiveSystemPrompt } from "@/lib/db/queries/system-prompts";
import { logToolUsage } from "./utils";
import type {
  AccessState,
  ExecuteParams,
  ExecuteResult,
  Result,
  ToolAdapter,
} from "./types";

const TOOL_ID = "claude" as const;

export const claudeAdapter: ToolAdapter = {
  id: TOOL_ID,
  category: "text",
  usesCredits: false,
  isEmbedded: false,

  async checkAccess(userId): Promise<AccessState> {
    const access = await getToolAccess(userId, TOOL_ID);
    if (!access) return { status: "locked" };

    switch (access.status) {
      case "active":
        return {
          status: "active",
          expiresAt: access.expires_at
            ? new Date(access.expires_at)
            : undefined,
        };
      case "pending":
        return {
          status: "pending",
          requestedAt: access.granted_at
            ? new Date(access.granted_at)
            : new Date(),
        };
      case "expired":
        return {
          status: "expired",
          expiredAt: access.expires_at
            ? new Date(access.expires_at)
            : new Date(),
        };
      case "locked":
      default:
        return { status: "locked" };
    }
  },

  async logUsage(userId, action, metadata) {
    await logToolUsage({
      userId,
      toolId: TOOL_ID,
      action,
      metadata,
    });
  },

  async execute(userId, params): Promise<Result<ExecuteResult>> {
    try {
      const db = createServerClient();

      // 1. System prompt (plaintext, ya desencriptado).
      const systemPrompt = await getActiveSystemPrompt(TOOL_ID);
      if (!systemPrompt) {
        return {
          ok: false,
          error: new Error(
            "no hay system prompt activo para Claude. Cargalo desde el panel admin.",
          ),
        };
      }

      // 2. Construir history si vino conversationId.
      const messages: ClaudeMessage[] = [];
      let conversationId = params.conversationId ?? null;

      if (conversationId) {
        // Validar ownership y traer historial.
        const { data: conv, error: convErr } = await db
          .from("claude_conversations")
          .select("id, user_id")
          .eq("id", conversationId)
          .maybeSingle();

        if (convErr) throw convErr;
        if (!conv) {
          return {
            ok: false,
            error: new Error("conversación no encontrada"),
          };
        }
        if (conv.user_id !== userId) {
          return {
            ok: false,
            error: new Error("conversación pertenece a otro usuario"),
          };
        }

        const { data: prior, error: prErr } = await db
          .from("claude_messages")
          .select("role, content")
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: true });
        if (prErr) throw prErr;

        for (const m of prior ?? []) {
          messages.push({ role: m.role, content: m.content });
        }
      }

      // Mensaje del user actual (texto + imágenes).
      messages.push({
        role: "user",
        content: buildUserContent(params.prompt, params.images),
      });

      // 3. Anthropic.
      // El modelo viene de DB (system_prompts.model). El admin lo
      // configura desde /admin/prompt; el SDK lo recibe en cada call.
      const response = await callClaude(systemPrompt.content, messages, {
        model: systemPrompt.model,
      });

      // 4. Persistencia. Best-effort: si falla algo acá, igual devolvemos
      // la respuesta al user porque ya pagamos los tokens.
      let messageId = "";
      try {
        if (!conversationId) {
          const title = params.prompt.slice(0, 80);
          const { data: newConv, error: newConvErr } = await db
            .from("claude_conversations")
            .insert({ user_id: userId, title })
            .select("id")
            .single();
          if (newConvErr) throw newConvErr;
          conversationId = newConv.id;
        }

        // Insertamos los 2 mensajes de la vuelta actual (user + assistant)
        // en un solo batch. Para imágenes, en MVP guardamos `[]` —
        // mover a Supabase Storage cuando exista el módulo de uploads
        // (queda como TODO).
        const { data: inserted, error: msgErr } = await db
          .from("claude_messages")
          .insert([
            {
              conversation_id: conversationId,
              role: "user" as const,
              content: params.prompt,
              images: [],
            },
            {
              conversation_id: conversationId,
              role: "assistant" as const,
              content: response.text,
              images: [],
              tokens_input: response.tokensInput,
              tokens_output: response.tokensOutput,
            },
          ])
          .select("id, role");
        if (msgErr) throw msgErr;

        const assistantRow = inserted?.find((r) => r.role === "assistant");
        messageId = assistantRow?.id ?? "";

        // Bump updated_at de la conversación (para el listado por
        // recientes). Es no-bloqueante.
        await db
          .from("claude_conversations")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", conversationId);
      } catch (persistError) {
        console.error(
          JSON.stringify({
            level: "error",
            msg: "claude.execute persistence failed AFTER successful API call",
            userId,
            conversationId,
            tokensInput: response.tokensInput,
            tokensOutput: response.tokensOutput,
            error:
              persistError instanceof Error
                ? persistError.message
                : String(persistError),
          }),
        );
        // Seguimos: el user recibe su texto. La conv queda inconsistente.
      }

      // 5. Log de uso (también best-effort). Incluimos `model` en metadata
      // para que el admin pueda filtrar logs por modelo usado (ej. ver
      // si un cambio a Haiku bajó la calidad).
      await logToolUsage({
        userId,
        toolId: TOOL_ID,
        action: "claude.execute",
        metadata: {
          conversationId,
          messageId,
          imagesCount: params.images?.length ?? 0,
          promptLength: params.prompt.length,
          model: systemPrompt.model,
          promptVersion: systemPrompt.version,
        },
        tokensConsumed: response.tokensInput + response.tokensOutput,
      });

      return {
        ok: true,
        value: {
          text: response.text,
          tokensInput: response.tokensInput,
          tokensOutput: response.tokensOutput,
          conversationId: conversationId ?? "",
          messageId,
        },
      };
    } catch (error) {
      // Errores ANTES del API call (config, DB previa, network al SDK).
      // Logueamos el real para debug interno, pero devolvemos un Error
      // genérico para no leakear detalles de Anthropic al caller.
      console.error(
        JSON.stringify({
          level: "error",
          msg: "claude.execute failed",
          userId,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      return {
        ok: false,
        error: new Error("no pudimos procesar tu pedido, intentá de nuevo"),
      };
    }
  },
};
