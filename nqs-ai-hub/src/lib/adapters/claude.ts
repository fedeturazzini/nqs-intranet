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
 *   1. Fetch system prompt y, si hay conversationId, mensajes previos en
 *      paralelo (ownership/proyecto ya fueron validados pre-stream)
 *   2. Llamar a Anthropic (caro)
 *   3. Si OK: crear conversación si nueva + persistir user msg + asistente
 *   4. Loguear usage
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
  maxTokensFor,
  modelSupportsCodeExecution,
  streamClaude,
  type ClaudeMessage,
} from "@/lib/anthropic/client";
import { isNoCreditsError, NO_CREDITS_CODE } from "@/lib/anthropic/errors";
import { logInfo, logWarn } from "@/lib/log";
import { analyzeArtifactAttempt } from "@/lib/utils/parse-artifacts";
import { shortHash, previewText } from "@/lib/utils/log-preview";
import { createServerClient } from "@/lib/db/supabase";
import { getToolAccess } from "@/lib/db/queries/tools";
import { getActiveSystemAndMemoryForProject } from "@/lib/db/queries/system-prompts";
import {
  pathBelongsToUser,
  signDownloadUrls,
  uploadBuffer,
} from "@/lib/storage/claude-uploads";
import {
  detectBinaryDeliveryIntent,
  isPotentialBinaryFollowUp,
  orderPriorDeliveryMessages,
  resolvePriorDeliveryTurn,
  shouldEnableBinaryFileGeneration,
} from "./claude-binary-delivery";
import {
  detectTextDeliveryIntent,
  hasDeliveredTextArtifact,
  repairMalformedTextDelivery,
} from "./claude-text-delivery";
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
 * descargables (ArtifactCard). Van al final del system prompt del proyecto — ver
 * ALCANCE acá abajo para qué manda cada cosa cuando hay conflicto.
 *
 * ALCANCE (fix formato-txt-audit.md): estas reglas están divididas en dos clases
 * y el texto lo dice explícito, porque antes pisaban el System Brain del proyecto
 * incluso DENTRO del content del artifact (los .txt salían con el formato del hub
 * y no con el que pedía el cerebro del proyecto — ver formato-txt-audit.md §4):
 *   - MECÁNICAS (mandan siempre, no ceden): la sintaxis pseudo-XML del artifact y
 *     el no emitir <thinking>. Si el proyecto las pisara, el hub no podría parsear
 *     → se rompe la card y el .txt.
 *   - ESTILÍSTICAS (aplican SOLO a la prosa del chat): regla de títulos, tono.
 *     NO gobiernan el contenido del artifact — ahí manda el system prompt del
 *     proyecto.
 * Se mantiene la posición (al final): el scoping explícito es señal más fuerte y
 * predecible que la recencia, y mover el bloque debilitaría también las mecánicas.
 */
const FORMAT_INSTRUCTIONS = `=== FORMATO DE RESPUESTAS (NQS AI Hub) ===

ALCANCE DE ESTAS REGLAS (leelo primero):
- Gobiernan CÓMO CONVERSÁS EN EL CHAT y la MECÁNICA del artifact (la sintaxis de acá abajo).
- NO gobiernan el formato del CONTENIDO que va DENTRO de un artifact. Ese contenido sigue, al pie de la letra, el formato que pida el system prompt del proyecto.
- Si para el contenido del artifact el system prompt del proyecto pide un formato distinto al que sugieren estas reglas, priorizá SIEMPRE el del proyecto. ÚNICA excepción: la sintaxis del artifact (los tags de abajo) es obligatoria siempre — sin ella la app no puede mostrar la card ni generar el archivo.

En el chat, usá markdown estándar (headers, listas, **negrita**, *itálica*, código inline o bloques con triple backtick).

Cuando necesites devolver contenido largo o autocontenido (documentos, prompts extensos, código, etc.), podés usar artifacts: esta app los renderiza como cards descargables. Usá la sintaxis estándar:
<function_calls>
<invoke name="artifacts">
<parameter name="command">create</parameter>
<parameter name="type">text/plain</parameter>
<parameter name="title">nombre_del_archivo</parameter>
<parameter name="content">contenido completo…</parameter>
</invoke>
</function_calls>

Tipos soportados (esto define el TIPO DE ARCHIVO, NO es una instrucción de estilo):
- text/plain (.txt) — prompts largos, texto. "plain" se refiere solo a la extensión del archivo: NO significa "sin marcado". Si el proyecto pide asteriscos, guiones, separadores, MAYÚSCULAS o cualquier estructura, reproducilos LITERALMENTE dentro del content.
- text/markdown (.md) — documentos formateados
- application/vnd.ant.code (con language="python|javascript|…") — código

Patrón recomendado:
- En el chat respondé breve y conversacional ("Listo, generé el prompt…").
- En el artifact poné el contenido pesado (prompt completo, código, documento).
El user lo ve como una card con botones de copiar y descargar.

REGLA OBLIGATORIA PARA ENTREGAS TXT/MARKDOWN:
- Si el user pide explícitamente un .txt, .md, Markdown, "archivo de texto", descargar, entregar o volver a entregar un archivo textual, DEBÉS usar el artifact de arriba aunque el contenido sea corto.
- Para TXT/Markdown usá EXCLUSIVAMENTE <invoke name="artifacts">. NUNCA escribas ni simules bash_tool, present_files, cat >, /mnt/user-data, rutas de sandbox ni comandos de shell.
- No afirmes que entregaste un archivo si no emitiste el artifact completo con type, title y content.

Si el contenido es corto (< 200 palabras) o conversacional, NO uses artifact y devolvelo inline con markdown, SALVO que el user haya pedido explícitamente una entrega TXT/Markdown.

REGLA DE TÍTULOS (aplica SOLO a tus mensajes conversacionales del chat):
- Para títulos de sección EN EL CHAT, usá SIEMPRE \`## Título\` (header H2 de markdown).
- Ejemplos correctos: "## Lo que veo", "## 10 ideas", "## Análisis".
- EN EL CHAT, NUNCA uses **Título:** ni **Título** para encabezar una sección.
- EN EL CHAT, el bold (**...**) es solo para enfatizar palabras dentro de un párrafo, no para titular secciones.
- DENTRO del content de un artifact NO apliques esta regla: ahí respetá literalmente el formato que pida el system prompt del proyecto. Si el proyecto pide **HOOK:**, ---, viñetas, numeración o MAYÚSCULAS como encabezados, usalos tal cual y NO los conviertas a \`##\`.

=== COMPORTAMIENTO (aplica a tu prosa del chat, NO al contenido de los artifacts) ===
Respondé directamente al pedido del user. No expliques tu proceso de razonamiento ni lo que vas a hacer antes de hacerlo.
NUNCA uses:
- Tags <thinking>…</thinking> ni similares. (Esta es absoluta: tampoco dentro de un artifact.)
- Frases meta sobre el user en tercera persona ("The user wants…", "El usuario me pidió…", "Let me think about what they need…").
- Comentarios sobre tu propio proceso ("I will now create…", "Voy a desarrollar esto en un artifact…", "Let me write the prompt…").
- Preámbulos antes del output ("Acá va el artifact:", "Listo, generando…"). EXCEPCIÓN: si vas a generar un artifact, podés decir UNA frase breve conversacional antes (ej: "Listo, va el archivo.") y nada más.
Si tenés que pensar internamente, hacelo en silencio y devolvé solo el resultado final.
Mantené el tono conversacional y profesional. Hablale al user en segunda persona ("vos", "tu pedido"), nunca en tercera.

Estas reglas de comportamiento son para el CHAT. El contenido de un artifact se rige por el system prompt del proyecto: si ahí se pide otro tono, otra persona gramatical o una plantilla fija, respetalo tal cual adentro del content.`;

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
- Una frase breve alcanza ("Listo, te armé el PDF."), PERO solo DESPUÉS de haber
  ejecutado el código y generado el archivo en ESTE mensaje.

CÓMO FUNCIONA LA ENTREGA (no es opcional, es mecánico):
El user solo recibe los archivos que generás ejecutando código EN ESTE MISMO mensaje.
Los archivos de mensajes anteriores NO se re-adjuntan. Si en este mensaje no ejecutás
código, el user NO recibe NINGÚN archivo — por más que digas que se lo mandaste.
- Cada pedido de archivo (una versión nueva, otra variante, otro ángulo, "hacelo de
  nuevo", "cambiá esto") requiere ejecutar código y producir un archivo NUEVO.
- NUNCA presentes un archivo que entregaste antes como si fuera la entrega de ahora
  ("es el mismo", "ya te lo mandé", "usá el anterior"): generalo de nuevo.
- Si por algún motivo no podés generarlo, DECILO explícitamente en vez de dar por
  hecho que llegó.
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

  async execute(
    userId,
    params,
    onText,
    onStatus,
  ): Promise<Result<ExecuteResult>> {
    try {
      const db = createServerClient();

      // 0. Contexto canónico resuelto por la route ANTES de abrir el stream.
      //    Para una conversación existente viene de conversation.project_id;
      //    el projectId del request/global nunca puede pisarlo.
      const projectContext = params.projectContext;
      if (!projectContext) {
        return {
          ok: false,
          error: new Error(
            "No pudimos validar el proyecto de esta conversación.",
          ),
        };
      }
      const projectId = projectContext.projectId;
      let conversationId = params.conversationId ?? null;

      // 1. Cerebro e historial son independientes una vez resuelto projectId:
      //    arrancan juntos para pagar una sola ola de latencia de DB.
      const historyPromise = conversationId
        ? db
            .from("claude_messages")
            .select("id, role, content, created_at")
            .eq("conversation_id", conversationId)
            .order("created_at", { ascending: true })
        : Promise.resolve({ data: [], error: null });
      const [prompts, historyResult] = await Promise.all([
        getActiveSystemAndMemoryForProject(TOOL_ID, projectId),
        historyPromise,
      ]);

      // System prompt + memoria DEL PROYECTO (plaintext, desencriptados).
      // Concatenamos con tags <system_prompt> / <workspace_memory>.
      // Si la memoria está vacía, no incluimos el bloque.
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
      // Capacidad disponible. La intención del turno se resuelve después de
      // cargar el contexto: tener sandbox disponible no significa prenderlo.
      const fileGenerationAvailable =
        process.env.ENABLE_FILE_GENERATION === "true" &&
        modelSupportsCodeExecution(systemPrompt.model);

      // 2. Construir history si vino conversationId.
      const messages: ClaudeMessage[] = [];
      let previousUserPrompt: string | null = null;
      let previousAssistantId: string | null = null;
      let previousAssistantText: string | null = null;
      let recentDeliveryMessages: Array<{
        role: string;
        content: string;
      }> = [];
      let previousAssistantFileMediaTypes: string[] = [];

      if (conversationId) {
        // Ownership + project_id ya se resolvieron una sola vez pre-stream.
        // La historia ya terminó de cargar en paralelo con el cerebro.
        const { data: prior, error: prErr } = historyResult;
        if (prErr) throw prErr;

        const priorMessages = orderPriorDeliveryMessages(prior ?? []);
        recentDeliveryMessages = priorMessages.slice(-12).map((message) => ({
          role: message.role,
          content: message.content,
        }));
        for (const m of priorMessages) {
          messages.push({ role: m.role, content: m.content });
        }
        ({ previousUserPrompt, previousAssistantId } =
          resolvePriorDeliveryTurn(priorMessages));
        const immediatelyPrevious = priorMessages.at(-1);
        previousAssistantText =
          immediatelyPrevious?.role === "assistant"
            ? immediatelyPrevious.content
            : null;

        // Solo miramos archivos del assistant inmediatamente relevante. Nunca
        // heredamos "el último archivo de la conversación": ese atajo fue la
        // causa de archivo-equivocado.
        if (previousAssistantId && isPotentialBinaryFollowUp(params.prompt)) {
          const { data: previousFiles, error: previousFilesError } = await db
            .from("claude_files")
            .select("media_type")
            .eq("conversation_id", conversationId)
            .eq("message_id", previousAssistantId);
          if (previousFilesError) throw previousFilesError;
          previousAssistantFileMediaTypes = (previousFiles ?? []).map(
            (file) => file.media_type,
          );
        }
      }

      const binaryDeliveryIntent = detectBinaryDeliveryIntent(params.prompt, {
        previousUserPrompt,
        previousAssistantFileMediaTypes,
      });
      const fileGenEnabled = shouldEnableBinaryFileGeneration(
        fileGenerationAvailable,
        binaryDeliveryIntent,
      );
      const fullSystem = fileGenEnabled
        ? `${projectSystem}\n\n${FORMAT_INSTRUCTIONS}\n\n${FILE_GEN_INSTRUCTIONS}`
        : `${projectSystem}\n\n${FORMAT_INSTRUCTIONS}`;

      // Imágenes: validamos ownership de cada path y generamos signed
      // download URLs (1h) para que Anthropic las descargue. Los paths
      // ya fueron subidos a Storage por el cliente vía signed upload URL.
      const imagePaths = (params.imagePaths ?? []).filter((p) =>
        pathBelongsToUser(p, userId),
      );
      const signed =
        imagePaths.length > 0 ? await signDownloadUrls(imagePaths) : [];

      // Mensaje del user actual (texto + adjuntos). `signed` son pares
      // { path, url }: buildUserContent decide image vs document por la
      // extensión del path (.pdf → document).
      const userContent = buildUserContent(params.prompt, signed);
      messages.push({ role: "user", content: userContent });
      // Cuántos bloques image/document quedaron REALMENTE en el request (vs
      // imagePaths.length, lo que el user adjuntó) — para el bug "no me llegan
      // las imágenes al sandbox": distingue si el problema es que no se mandan,
      // o que se mandan y el sandbox no las procesa. El source siempre es "url"
      // (signed URL de Storage); si algún día cambia a base64 esto lo muestra.
      const imagesReceived = userContent.filter(
        (b) => b.type === "image" || b.type === "document",
      ).length;

      // Log de diagnóstico: qué se está por mandar a Anthropic — projectId +
      // nombre + de qué fila salió el cerebro (para el bug de "pestañas
      // mezcladas": si el cerebro que usa un execute NO corresponde al
      // proyecto activo de esa pestaña), modelo, tamaño/hash/preview del
      // system prompt (confirma que no viene cortado ni vacío, sin loguear el
      // contenido entero), y el contexto (mensajes, imágenes, max_tokens).
      // Detrás de DEBUG_BRAIN_VERBOSE (default off) suma el cerebro COMPLETO.
      // Nombre/privacidad ya vienen del proyecto validado pre-stream: el log no
      // agrega una query ni un RTT antes de Anthropic.
      const textDeliveryIntent = detectTextDeliveryIntent(params.prompt, {
        previousUserPrompt,
        previousAssistantText,
        recentMessages: recentDeliveryMessages,
      });
      try {
        const brainVerbose = process.env.DEBUG_BRAIN_VERBOSE === "true";
        logInfo("execute.context", {
          userId,
          projectId,
          projectContextSource: projectContext.source,
          projectName: projectContext.projectName,
          systemPromptId: systemPrompt.id,
          systemPromptSource: `system_prompts:${systemPrompt.id} (project:${projectId})`,
          systemPromptVersion: systemPrompt.version,
          systemPromptChars: fullSystem.length,
          systemPromptHash: shortHash(fullSystem),
          systemPromptPreview: previewText(fullSystem, 200, 100),
          // Si el proyecto es privado, llegar hasta acá YA implica que el gate
          // pasó (hasProjectGate cortó antes si no) — se loguea explícito para
          // no tener que inferirlo de "no hubo error".
          brainPasswordGated: projectContext.isPrivate,
          model: systemPrompt.model,
          messagesSent: messages.length, // incluye el turno actual
          imagesReceived,
          expectedOutput:
            binaryDeliveryIntent?.format ?? textDeliveryIntent?.format ?? null,
          fileGenerationAvailable,
          binaryDeliveryRequested: binaryDeliveryIntent != null,
          binaryDeliverySource: binaryDeliveryIntent?.source ?? null,
          binaryDeliveryReason: binaryDeliveryIntent?.reason ?? null,
          fileGenerationEnabled: fileGenEnabled,
          maxTokens: maxTokensFor(systemPrompt.model),
          ...(brainVerbose ? { fullSystemPrompt: fullSystem } : {}),
        });
      } catch (contextLogError) {
        logWarn("execute.context: no se pudo armar (no bloquea el execute)", {
          userId,
          projectId,
          err: contextLogError,
        });
      }

      // 3. Anthropic.
      // El modelo viene de DB (system_prompts.model del type='system').
      // El admin lo configura desde /admin/prompt; el SDK lo recibe en
      // cada call.
      // Streaming: si el caller pasó `onText`, los deltas se emiten a
      // medida que se generan (la respuesta no se corta por timeout aunque
      // el prompt sea grande). Igual acumulamos el texto completo.
      const callStartedAt = Date.now();
      let response = await streamClaude(
        fullSystem,
        messages,
        { model: systemPrompt.model, enableFileGeneration: fileGenEnabled },
        onText,
        onStatus,
      );
      const repairedTextDelivery = repairMalformedTextDelivery(
        response.text,
        textDeliveryIntent,
      );
      if (repairedTextDelivery.repaired) {
        response = { ...response, text: repairedTextDelivery.text };
        logWarn("execute.text_delivery_repaired", {
          userId,
          projectId,
          conversationId,
          expectedOutput: textDeliveryIntent?.format ?? null,
          source: repairedTextDelivery.source,
        });
      }
      const durationMs = Date.now() - callStartedAt;
      if (
        response.stopReason === "tool_use" &&
        response.toolUseDelivery?.detected &&
        !response.toolUseDelivery.recognized
      ) {
        logWarn("execute: tool_use no materializable", {
          userId,
          conversationId,
          toolName: response.toolUseDelivery.toolName ?? "unknown",
          reason: response.toolUseDelivery.failReason ?? "unknown_shape",
          stopReason: response.stopReason,
        });
      }

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

      // 4. Persistencia. Best-effort: si falla algo acá, igual devolvemos
      // la respuesta al user porque ya pagamos los tokens.
      let messageId = "";
      // Timestamp REAL del mensaje (para el horario en la UI). Si la
      // persistencia falla, queda null y el cliente cae a "ahora" (ver
      // useClaudeChat) — no hay un created_at real que mostrar en ese caso.
      let messageCreatedAt: string | null = null;
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
          .select("id, role, created_at");
        if (msgErr) throw msgErr;

        const assistantRow = inserted?.find((r) => r.role === "assistant");
        messageId = assistantRow?.id ?? "";
        messageCreatedAt = assistantRow?.created_at ?? null;
        // Parte 2.2: si NO recuperamos el id del mensaje del assistant, los
        // archivos de la etapa 2 quedarían con `message_id = null` (huérfanos).
        // No es fatal — al recargar, el reload los recupera asociándolos por
        // `created_at` al mensaje de SU turno (ya NO "al último assistant": eso
        // servía el archivo equivocado, ver archivo-equivocado-audit.md) — pero
        // lo logueamos fuerte para poder detectarlo.
        if (!messageId) {
          console.error(
            JSON.stringify({
              level: "error",
              msg: "claude.execute: assistant messageId vacío tras el insert (archivos quedarían huérfanos)",
              userId,
              conversationId,
            }),
          );
        }

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

      // Resumen ESTRUCTURADO de esta ejecución — compara casos que andan vs
      // los que fallan (prompt que no se muestra, imágenes que no llegan al
      // sandbox) sin loguear el contenido crudo (respuestas de 20k tokens →
      // logs gigantes + datos de usuarios). Detrás de DEBUG_EXECUTE_VERBOSE
      // (default off), contentBlocks trae además un recorte de hasta 500 chars
      // por bloque de texto — nunca el contenido entero (ver client.ts).
      const artifactAttempt = analyzeArtifactAttempt(response.text);
      const textDeliveryFailed =
        textDeliveryIntent != null && !hasDeliveredTextArtifact(response);
      logInfo("execute.summary", {
        requestId: response.anthropicMessageId ?? undefined,
        userId,
        conversationId,
        messageId,
        model: systemPrompt.model,
        stopReason: response.stopReason,
        tokensInput: response.tokensInput,
        tokensOutput: response.tokensOutput,
        // Prompt caching: >0 en cacheCreation la 1ª llamada de la conversación
        // (se escribe el cerebro al cache); >0 en cacheRead en los siguientes
        // (se lee barato). Sirve para confirmar en logs que el cache pega.
        cacheCreationTokens: response.cacheCreationTokens,
        cacheReadTokens: response.cacheReadTokens,
        contentBlocks: response.contentBlocks,
        artifactAttempted: artifactAttempt.attempted,
        artifactDetected: artifactAttempt.detected,
        artifactFailReason: artifactAttempt.reason,
        fileIds: response.generatedFiles?.length ?? 0,
        expectedOutput:
          binaryDeliveryIntent?.format ?? textDeliveryIntent?.format ?? null,
        attempts: 1,
        fileGenerationAvailable,
        binaryDeliveryRequested: binaryDeliveryIntent != null,
        binaryDeliverySource: binaryDeliveryIntent?.source ?? null,
        binaryDeliveryReason: binaryDeliveryIntent?.reason ?? null,
        fileGenerationEnabled: fileGenEnabled,
        toolUseDetected: response.toolUseDelivery?.detected ?? false,
        toolUseRecognized: response.toolUseDelivery?.recognized ?? false,
        toolUseFailReason: response.toolUseDelivery?.failReason ?? null,
        toolUseName: response.toolUseDelivery?.toolName ?? null,
        textDeliveryFailed,
        textDeliveryRepaired: repairedTextDelivery.repaired,
        imagesReceived,
        attachmentsSource: imagesReceived > 0 ? "url" : undefined,
        durationMs,
      });

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
                msg: "code exec: archivo GENERADO pero NO persistido (falló bajar/subir/registrar)",
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

      // Parte 3.2: cuántos archivos se capturaron pero NO se pudieron persistir.
      // Se propaga al cliente en el `done` para avisar (no quedar mudo) y así el
      // user sabe que puede reintentar en vez de creer que no se generó nada.
      const filesFailed =
        fileGenEnabled && fileIds.length > 0
          ? fileIds.length - (persistedFiles?.length ?? 0)
          : 0;
      if (filesFailed > 0) {
        console.error(
          JSON.stringify({
            level: "error",
            msg: "code exec: se generaron archivos que no se pudieron adjuntar",
            userId,
            conversationId,
            captured: fileIds.length,
            persisted: persistedFiles?.length ?? 0,
            filesFailed,
          }),
        );
      }

      // Capa 1 del archivo-equivocado-audit.md: SE PIDIÓ un binario y no vino.
      // Se informa aunque el modelo no haya llegado a invocar el sandbox: la
      // postcondición es que exista un file_id real, no que haya un tool call.
      //
      // Por qué importa: este turno quedaba MUDO — `filesFailed` es 0 porque no
      // había nada capturado que pudiera "fallar" —, y ese hueco sin señal era
      // justo el que el fallback de la card rellenaba con el archivo de un turno
      // ANTERIOR. Avisar acá es lo que evita que el silencio se vuelva engaño.
      const filesMissing = binaryDeliveryIntent != null && fileIds.length === 0;
      if (filesMissing) {
        console.error(
          JSON.stringify({
            level: "error",
            msg: "code exec: se pidió un binario y NO llegó ningún archivo",
            userId,
            conversationId,
            expectedFormat: binaryDeliveryIntent.format,
            fileGenerationEnabled: fileGenEnabled,
            contentBlockTypes: response.contentBlocks.map((b) => b.type),
          }),
        );
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
          createdAt: messageCreatedAt,
          stopReason: response.stopReason,
          // ETAPA 1: capturados, todavía sin bajar ni guardar (la etapa 2 los consume).
          generatedFiles: response.generatedFiles,
          // ETAPA 2: ya en Storage + claude_files (viajan en el `done` del NDJSON).
          files: persistedFiles,
          // Parte 3.2: archivos capturados que no se pudieron adjuntar (>0 → la
          // UI avisa). 0 en el caso normal.
          filesFailed,
          // Capa 1: se pidió un binario y no vino ningún file_id.
          filesMissing,
          // La única llamada no entregó el artifact textual: la UI ofrece el
          // texto visible como descarga sin fingir que fue un archivo generado.
          textFileFallback: textDeliveryFailed
            ? { filename: textDeliveryIntent.filename }
            : undefined,
          toolDeliveryFailed:
            response.stopReason === "tool_use" &&
            response.toolUseDelivery?.detected &&
            !response.toolUseDelivery.recognized
              ? {
                  toolName: response.toolUseDelivery.toolName ?? "unknown",
                }
              : undefined,
        },
      };
    } catch (error) {
      // Caso especial: saldo de la API de Anthropic agotado (400 no reintentable).
      // Lo marcamos como NO_CREDITS para encontrarlo fácil en los logs y devolvemos
      // un código propio; la ruta lo mapea a un mensaje claro (sin exponerle al
      // empleado el texto de billing ni el request_id — es info del admin).
      const noCredits = isNoCreditsError(error);
      console.error(
        JSON.stringify({
          level: "error",
          msg: noCredits
            ? "claude.execute failed: NO_CREDITS (saldo de la API agotado)"
            : "claude.execute failed",
          code: noCredits ? NO_CREDITS_CODE : undefined,
          userId,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      return {
        ok: false,
        error: new Error(
          noCredits
            ? NO_CREDITS_CODE
            : "no pudimos procesar tu pedido, intentá de nuevo",
        ),
      };
    }
  },
};
