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
import { basename } from "node:path";
import {
  buildUserContent,
  downloadGeneratedFile,
  modelSupportsCodeExecution,
  streamClaude,
  type ClaudeMessage,
} from "@/lib/anthropic/client";
import { createServerClient } from "@/lib/db/supabase";
import { getToolAccess } from "@/lib/db/queries/tools";
import { getActiveSystemAndMemoryForProject } from "@/lib/db/queries/system-prompts";
import { getActiveProjectId } from "@/lib/db/queries/projects";
import {
  pathBelongsToUser,
  signDownloadUrls,
  uploadBuffer,
} from "@/lib/storage/claude-uploads";
import { logToolUsage } from "./utils";
import type {
  AccessState,
  ExecuteParams,
  ExecuteResult,
  Result,
  ToolAdapter,
} from "./types";

const TOOL_ID = "claude" as const;

/**
 * Instrucciones de formato que se appendean AL FINAL del system prompt de cada
 * proyecto. CAMBIO DE ESTRATEGIA: antes prohibíamos los artifacts, pero el
 * modelo los genera igual (está entrenado fuerte para usarlos). Ahora los
 * permitimos: la app los parsea (parse-artifacts.ts) y los muestra como cards
 * descargables (ArtifactCard). Van al final para que Claude las priorice.
 */
const FORMAT_INSTRUCTIONS = `=== FORMATO DE RESPUESTAS (NQS AI Hub) ===
Usá markdown estándar (headers, listas, **negrita**, *itálica*, código inline o bloques con triple backtick).

Cuando necesites devolver contenido largo o autocontenido (documentos, prompts extensos, código, etc.), podés usar artifacts: esta app los renderiza como cards descargables. Usá la sintaxis estándar:
<function_calls>
<invoke name="artifacts">
<parameter name="command">create</parameter>
<parameter name="type">text/plain</parameter>
<parameter name="title">nombre_del_archivo</parameter>
<parameter name="content">contenido completo…</parameter>
</invoke>
</function_calls>

Tipos soportados:
- text/plain (.txt) — texto plano, prompts largos
- text/markdown (.md) — documentos formateados
- application/vnd.ant.code (con language="python|javascript|…") — código

Patrón recomendado:
- En el chat respondé breve y conversacional ("Listo, generé el prompt…").
- En el artifact poné el contenido pesado (prompt completo, código, documento).
El user lo ve como una card con botones de copiar y descargar.

Si el contenido es corto (< 200 palabras) o conversacional, NO uses artifact: devolvelo inline con markdown.

REGLA DE TÍTULOS:
- Para títulos de sección dentro de tus respuestas, usá SIEMPRE \`## Título\` (header H2 de markdown).
- Ejemplos correctos: "## Lo que veo", "## 10 ideas", "## Análisis".
- NUNCA uses **Título:** ni **Título** para encabezar una sección.
- El bold (**...**) es solo para enfatizar palabras dentro de un párrafo, no para titular secciones.

=== COMPORTAMIENTO ===
Respondé directamente al pedido del user. No expliques tu proceso de razonamiento ni lo que vas a hacer antes de hacerlo.
NUNCA uses:
- Tags <thinking>…</thinking> ni similares.
- Frases meta sobre el user en tercera persona ("The user wants…", "El usuario me pidió…", "Let me think about what they need…").
- Comentarios sobre tu propio proceso ("I will now create…", "Voy a desarrollar esto en un artifact…", "Let me write the prompt…").
- Preámbulos antes del output ("Acá va el artifact:", "Listo, generando…"). EXCEPCIÓN: si vas a generar un artifact, podés decir UNA frase breve conversacional antes (ej: "Listo, va el archivo.") y nada más.
Si tenés que pensar internamente, hacelo en silencio y devolvé solo el resultado final.
Mantené el tono conversacional y profesional. Hablale al user en segunda persona ("vos", "tu pedido"), nunca en tercera.`;

/**
 * Instrucciones EXTRA que se appendean SOLO cuando la generación de archivos
 * está activa (flag + modelo compatible). Le dicen a Claude que use la
 * generación real (code execution + skills) para binarios, en vez de devolver
 * un script de Python o un artifact de código. El artifact de TEXTO
 * (txt/markdown) sigue igual — esto no lo toca.
 */
const FILE_GEN_INSTRUCTIONS = `=== GENERACIÓN DE ARCHIVOS REALES ===
Cuando el user pida un DOCUMENTO BINARIO (PDF, Word/.docx, Excel/.xlsx, PowerPoint/.pptx),
GENERALO DE VERDAD ejecutando código en el sandbox (tenés python-docx, openpyxl, pypdf,
python-pptx, matplotlib, etc. disponibles). Producí el archivo real como salida.
- NO devuelvas un script de Python para que lo corra el user.
- NO metas el contenido en un artifact de código ni en el pseudo-XML de artifacts.
- Una frase breve alcanza ("Listo, te armé el PDF."); el archivo es la entrega.
Para TEXTO o Markdown (no binario), seguí usando el artifact de texto de siempre.`;

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

  async execute(userId, params, onText): Promise<Result<ExecuteResult>> {
    try {
      const db = createServerClient();

      // 0. Proyecto activo del user (migration 0008). Cada proyecto tiene
      //    su propio cerebro + memoria. Sin proyecto activo, no se puede
      //    usar Claude.
      const projectId = await getActiveProjectId(userId);
      if (!projectId) {
        return {
          ok: false,
          error: new Error("Seleccioná un proyecto antes de usar Claude"),
        };
      }

      // 1. System prompt + memoria DEL PROYECTO (plaintext, desencriptados).
      //    Concatenamos con tags <system_prompt> / <workspace_memory>.
      //    Si la memoria está vacía, no incluimos el bloque.
      const prompts = await getActiveSystemAndMemoryForProject(
        TOOL_ID,
        projectId,
      );
      const systemPrompt = prompts.system;
      const memoryPrompt = prompts.memory;
      if (!systemPrompt) {
        return {
          ok: false,
          error: new Error(
            "Este proyecto todavía no tiene un cerebro configurado. Pedile al admin que lo cargue en el System Brain.",
          ),
        };
      }
      const memoryText = memoryPrompt?.content.trim() ?? "";
      const projectSystem = memoryText
        ? `<system_prompt>${systemPrompt.content}</system_prompt>\n<workspace_memory>${memoryText}</workspace_memory>`
        : systemPrompt.content;
      // Generación de archivos reales (etapa 1): detrás de un flag (costo de
      // container) + solo si el modelo del proyecto soporta code execution
      // (Sonnet/Opus 4.5+, Fable 5). Si no, se comporta como hoy (solo texto).
      // TEMP DEBUG: flag y soporte separados para poder reportarlos en el chat.
      const flagEnabled = process.env.ENABLE_FILE_GENERATION === "true";
      const modelSupported = modelSupportsCodeExecution(systemPrompt.model);
      const fileGenEnabled = flagEnabled && modelSupported;

      // Las instrucciones de formato van al final (prioridad). Con file-gen
      // activo, sumamos las instrucciones de generación real de binarios.
      const fullSystem = fileGenEnabled
        ? `${projectSystem}\n\n${FORMAT_INSTRUCTIONS}\n\n${FILE_GEN_INSTRUCTIONS}`
        : `${projectSystem}\n\n${FORMAT_INSTRUCTIONS}`;

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

      // Imágenes: validamos ownership de cada path y generamos signed
      // download URLs (1h) para que Anthropic las descargue. Los paths
      // ya fueron subidos a Storage por el cliente vía signed upload URL.
      const imagePaths = (params.imagePaths ?? []).filter((p) =>
        pathBelongsToUser(p, userId),
      );
      const signed =
        imagePaths.length > 0 ? await signDownloadUrls(imagePaths) : [];
      const imageUrls = signed.map((s) => s.url);

      // Mensaje del user actual (texto + imágenes).
      messages.push({
        role: "user",
        content: buildUserContent(params.prompt, imageUrls),
      });

      // 3. Anthropic.
      // El modelo viene de DB (system_prompts.model del type='system').
      // El admin lo configura desde /admin/prompt; el SDK lo recibe en
      // cada call.
      // Streaming: si el caller pasó `onText`, los deltas se emiten a
      // medida que se generan (la respuesta no se corta por timeout aunque
      // el prompt sea grande). Igual acumulamos el texto completo.
      const response = await streamClaude(
        fullSystem,
        messages,
        { model: systemPrompt.model, enableFileGeneration: fileGenEnabled },
        onText,
      );

      // ETAPA 1: si Claude generó archivos en el sandbox, logueamos los file_id
      // para confirmar que anda. Todavía NO se bajan ni se guardan (etapa 2).
      if (response.generatedFiles && response.generatedFiles.length > 0) {
        console.log(
          JSON.stringify({
            level: "info",
            msg: "code exec: archivos generados (etapa 1, solo captura de file_id)",
            userId,
            conversationId,
            fileIds: response.generatedFiles.map((f) => f.fileId),
          }),
        );
      }

      // TEMP DEBUG - remover: con DEBUG_FILE_GENERATION=true, appendeamos un bloque
      // de diagnóstico AL STREAM (onText) para verlo en el chat sin logs de Vercel.
      // Se muestra en vivo (queda en el `acc` del cliente) pero NO se persiste:
      // abajo guardamos `response.text` (sin este bloque). Todo detrás del flag.
      if (process.env.DEBUG_FILE_GENERATION === "true" && onText) {
        const d = response.codeExecDebug;
        const dbg =
          `\n\n---\n[DEBUG code-exec]\n` +
          `flagEnabled=${flagEnabled} model=${systemPrompt.model} ` +
          `modelSupported=${modelSupported} toolIncluded=${fileGenEnabled}\n` +
          `toolVersion=${d?.toolVersion ?? "-"} betas=[${d?.betas?.join(",") ?? ""}] ` +
          `stopReasons=[${d?.stopReasons?.join(",") ?? ""}] ` +
          `codeExecBlocksSeen=${d?.codeExecBlocksSeen ?? 0} ` +
          `fileIdsCount=${d?.fileIdsCount ?? response.generatedFiles?.length ?? 0} ` +
          `error=${d?.errorIfAny ?? "none"}`;
        onText(dbg);
      }

      // 4. Persistencia. Best-effort: si falla algo acá, igual devolvemos
      // la respuesta al user porque ya pagamos los tokens.
      let messageId = "";
      try {
        if (!conversationId) {
          const title = params.prompt.slice(0, 80);
          const { data: newConv, error: newConvErr } = await db
            .from("claude_conversations")
            // FIX 17.5: la conversación nace asociada al proyecto activo.
            .insert({ user_id: userId, title, project_id: projectId })
            .select("id")
            .single();
          if (newConvErr) throw newConvErr;
          conversationId = newConv.id;
        }

        // Insertamos los 2 mensajes de la vuelta actual (user + assistant)
        // en un solo batch. En el mensaje del user persistimos los PATHS
        // de Storage (no las URLs firmadas, que expiran). Al renderear
        // histórico se vuelven a firmar on-demand.
        const { data: inserted, error: msgErr } = await db
          .from("claude_messages")
          .insert([
            {
              conversation_id: conversationId,
              role: "user" as const,
              content: params.prompt,
              images: imagePaths,
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

      // 4.5 ETAPA 2: bajar cada archivo generado de la Files API, subirlo a
      // Storage y registrarlo en claude_files. Best-effort POR ARCHIVO: si uno
      // falla (download/upload/insert), lo logueamos y seguimos; nunca rompemos
      // la respuesta por un archivo. Necesita conversationId + messageId (de
      // arriba). Solo corre con file-gen activo y si hubo file_id capturados.
      let persistedFiles: ExecuteResult["files"];
      const fileIds = response.generatedFiles?.map((f) => f.fileId) ?? [];
      if (fileGenEnabled && fileIds.length > 0 && conversationId) {
        persistedFiles = [];
        for (const fileId of fileIds) {
          try {
            const dl = await downloadGeneratedFile(fileId);
            // Sanitizamos el nombre (path traversal) y derivamos la extensión.
            const safeName = basename(dl.name) || "archivo";
            const ext = safeName.includes(".")
              ? (safeName.split(".").pop() ?? "bin")
              : "bin";
            const storagePath = await uploadBuffer(
              userId,
              conversationId,
              dl.bytes,
              dl.mediaType,
              ext,
            );
            const { data: row, error: insErr } = await db
              .from("claude_files")
              .insert({
                conversation_id: conversationId,
                message_id: messageId || null,
                user_id: userId,
                name: safeName,
                media_type: dl.mediaType,
                storage_path: storagePath,
                size_bytes: dl.sizeBytes,
                anthropic_file_id: fileId,
              })
              .select("id")
              .single();
            if (insErr || !row) throw insErr ?? new Error("insert sin fila");
            persistedFiles.push({
              id: row.id,
              name: safeName,
              mediaType: dl.mediaType,
              storagePath,
            });
          } catch (fileErr) {
            console.error(
              JSON.stringify({
                level: "error",
                msg: "code exec: falló bajar/subir/registrar un archivo generado",
                userId,
                conversationId,
                fileId,
                error:
                  fileErr instanceof Error ? fileErr.message : String(fileErr),
              }),
            );
          }
        }
      }

      // 5. Log de uso (también best-effort). Incluimos `model` en metadata
      // para que el admin pueda filtrar logs por modelo usado (ej. ver
      // si un cambio a Haiku bajó la calidad).
      await logToolUsage({
        userId,
        toolId: TOOL_ID,
        action: "claude.execute",
        metadata: {
          projectId,
          conversationId,
          messageId,
          imagesCount: imagePaths.length,
          promptLength: params.prompt.length,
          model: systemPrompt.model,
          // Split de tokens para el cálculo de gasto USD (Logs USD, prompt 17).
          tokensInput: response.tokensInput,
          tokensOutput: response.tokensOutput,
          promptVersion: systemPrompt.version,
          memoryVersion: memoryPrompt?.version ?? null,
          memoryLength: memoryText.length,
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
          stopReason: response.stopReason,
          // ETAPA 1: capturados, todavía sin bajar ni guardar (la etapa 2 los consume).
          generatedFiles: response.generatedFiles,
          // ETAPA 2: ya en Storage + claude_files (viajan en el `done` del NDJSON).
          files: persistedFiles,
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
