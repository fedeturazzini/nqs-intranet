"use client";

/**
 * Hook de estado para el chat de Claude.
 *
 * Responsabilidades:
 *   - Mantener la lista de mensajes de la conversación actual.
 *   - Trackear `conversationId` (puede arrancar null para conversación nueva).
 *   - `sendMessage(prompt, images)` → POST a /api/tools/claude/execute.
 *     Hace update optimista del mensaje del user antes de la respuesta.
 *   - `loadConversation(id)` → GET a /api/me/conversations/[id] y reemplaza
 *     el estado.
 *   - `newConversation()` → resetea todo a vacío.
 *   - Estados de loading + error para que la UI los renderee.
 *
 * No es global (no Zustand) — cada `<ClaudeView />` tiene su propia
 * instancia. Si en el futuro hace falta compartir entre múltiples
 * componentes (ej. notif global de "Claude está pensando"), se mueve
 * al store.
 */
import { useCallback, useRef, useState } from "react";
import { NO_CREDITS_CODE } from "@/lib/anthropic/errors";

/** Mensaje al usuario cuando la API se quedó sin saldo (NO_CREDITS). NO le
 *  mostramos el texto de billing ni el request_id de Anthropic — es info del
 *  admin; el empleado no puede recargar, solo avisar. */
const NO_CREDITS_MESSAGE =
  "El servicio de IA no está disponible en este momento. Avisá al administrador.";

// ============================================================
// Tipos del chat (UI-side)
// ============================================================

/**
 * Un archivo REAL (PDF/Word/Excel/PPT) generado por Claude, adjunto a un mensaje
 * del assistant. La descarga la resuelve `FileCard` por signed URL (el binario
 * vive en Storage privado). Distinto del artifact de texto (Blob en memoria).
 */
export type ChatFile = {
  id: string;
  name: string;
  mediaType: string;
};

/** PDF adjunto por el user a un mensaje (signed URL ya resuelta + nombre). */
export type PdfAttachment = {
  url: string;
  name: string;
};

/** Mensaje tal como lo renderea la UI. */
export type ChatMessage = {
  /** ID DB cuando existe, o "local-…" para optimistic. */
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Solo en mensajes del user que adjuntaron imágenes (data URLs para preview). */
  imagePreviews?: string[];
  /** PDFs que adjuntó el user a este mensaje (se muestran como card). */
  pdfAttachments?: PdfAttachment[];
  /** Archivos generados por Claude adjuntos a este mensaje (assistant). */
  files?: ChatFile[];
  /** True si Claude generó un archivo que NO se pudo adjuntar (falló la etapa 2
   *  de persistencia). La UI muestra un aviso para que el user pueda reintentar
   *  en vez de creer que no se generó nada. */
  filesPartialError?: boolean;
  tokensInput?: number;
  tokensOutput?: number;
  /** Cuando true, en lugar de content se muestra el "Claude está pensando…". */
  isPending?: boolean;
  /** True mientras la respuesta se está streameando (entre el 1er chunk y el
   *  "done"). La UI lo usa para distinguir un artifact "generándose" de uno
   *  que quedó cortado. */
  streaming?: boolean;
  /** True mientras Claude genera un archivo en el sandbox (entre el evento
   *  "generating_file" y el "done"). La UI muestra un indicador "generando
   *  archivo…" durante la espera silenciosa del code execution. */
  generatingFile?: boolean;
  /** Por qué terminó la respuesta ("end_turn", "max_tokens", …). Si es
   *  "max_tokens" la UI muestra un aviso de respuesta cortada. */
  stopReason?: string | null;
  /** Mensaje crudo de error (solo si la respuesta falló). */
  errorMsg?: string;
};

// ============================================================
// Shape del response del endpoint
// ============================================================

type ExecuteResponse =
  | {
      text: string;
      tokensInput: number;
      tokensOutput: number;
      conversationId: string;
      messageId: string;
    }
  | { error: string; message?: string };

type ConversationDetailResponse = {
  conversation: { id: string; title: string | null };
  messages: Array<{
    id: string;
    role: "user" | "assistant";
    content: string;
    tokens_input: number | null;
    tokens_output: number | null;
    /** Signed download URLs (1h) de las IMÁGENES del mensaje. */
    imageUrls?: string[];
    /** PDFs adjuntos del mensaje (signed URL + nombre), re-firmados. */
    pdfAttachments?: PdfAttachment[];
    /** Archivos generados (claude_files) asociados a este mensaje. */
    files?: ChatFile[];
  }>;
};

// ============================================================
// Hook
// ============================================================

export type UseClaudeChat = ReturnType<typeof useClaudeChat>;

export function useClaudeChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  // AbortController de la request en curso (para el botón "Detener").
  const abortRef = useRef<AbortController | null>(null);

  const newConversation = useCallback(() => {
    setMessages([]);
    setConversationId(null);
    setLoadError(null);
  }, []);

  const loadConversation = useCallback(async (id: string) => {
    setLoadError(null);
    try {
      const res = await fetch(`/api/me/conversations/${id}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        setLoadError(`no pude cargar la conversación (${res.status})`);
        return;
      }
      const data = (await res.json()) as ConversationDetailResponse;
      setConversationId(data.conversation.id);
      setMessages(
        data.messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          tokensInput: m.tokens_input ?? undefined,
          tokensOutput: m.tokens_output ?? undefined,
          imagePreviews:
            m.imageUrls && m.imageUrls.length > 0 ? m.imageUrls : undefined,
          pdfAttachments:
            m.pdfAttachments && m.pdfAttachments.length > 0
              ? m.pdfAttachments
              : undefined,
          files: m.files && m.files.length > 0 ? m.files : undefined,
        })),
      );
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "error desconocido");
    }
  }, []);

  /**
   * Envía un mensaje. Las imágenes ya fueron subidas a Storage por el
   * caller (ChatInput) — acá solo recibimos los `imagePaths` y los
   * `imagePreviews` (data URLs locales para el optimistic render).
   * Devuelve el nuevo conversationId si era una conv nueva, o el error.
   */
  const sendMessage = useCallback(
    async (
      prompt: string,
      imagePaths: string[],
      imagePreviews: string[],
      pdfPreviews: PdfAttachment[] = [],
    ): Promise<{ ok: true; conversationId: string } | { ok: false; error: string }> => {
      const userMsgId = `local-${crypto.randomUUID()}`;
      const pendingMsgId = `local-${crypto.randomUUID()}`;

      // Optimistic: agregamos user + placeholder "pensando…" al toque.
      setMessages((prev) => [
        ...prev,
        {
          id: userMsgId,
          role: "user",
          content: prompt,
          imagePreviews: imagePreviews.length > 0 ? imagePreviews : undefined,
          pdfAttachments: pdfPreviews.length > 0 ? pdfPreviews : undefined,
        },
        {
          id: pendingMsgId,
          role: "assistant",
          content: "",
          isPending: true,
        },
      ]);
      setIsSending(true);

      const setErrorOnPending = (errMsg: string) =>
        setMessages((prev) =>
          prev.map((m) =>
            m.id === pendingMsgId
              ? { ...m, isPending: false, streaming: false, errorMsg: errMsg, content: "" }
              : m,
          ),
        );

      // Red de seguridad. Si el mensaje del assistant quedó SIN archivos (el
      // `done` no trajo `files`, o el stream se cortó antes del `done`),
      // re-fetcheamos los claude_files de la conversación y los reconciliamos
      // contra el mensaje. Idempotente y silenciosa: nunca rompe el flujo.
      //
      // REGLA DURA (fix del "archivo equivocado", ver archivo-equivocado-audit.md):
      // un mensaje muestra EXCLUSIVAMENTE su propio archivo. La versión anterior
      // caía a "el último mensaje del assistant con archivos" cuando no encontraba
      // nada, y en una conversación con varias generaciones eso pegaba el archivo
      // de un turno ANTERIOR al mensaje nuevo (el user pedía los reframes y le
      // llegaba el .txt del edit anterior). "Este mensaje no tiene archivo" es un
      // resultado VÁLIDO, no una señal para ir a buscar el de otro.
      const reconcileFilesFromServer = async (
        convId: string,
        stateMsgId: string,
        serverMsgId: string | null,
      ): Promise<void> => {
        if (!convId) return;
        try {
          const res = await fetch(`/api/me/conversations/${convId}`, {
            cache: "no-store",
          });
          if (!res.ok) return;
          const data = (await res.json()) as ConversationDetailResponse;

          // La selección va DENTRO del setMessages para poder mirar el estado
          // actual (`prev`) y no adoptar archivos que ya se muestran en otro
          // mensaje.
          setMessages((prev) => {
            const target = prev.find((m) => m.id === stateMsgId);
            // Idempotente: si el `done` ya trajo los archivos, no tocamos nada.
            if (!target || (target.files && target.files.length > 0)) return prev;

            let found: ChatFile[] | undefined;
            if (serverMsgId) {
              // Tenemos el id REAL → match exacto y punto. Si ese mensaje no
              // tiene archivos, no hay nada que adjuntar.
              found = data.messages.find((m) => m.id === serverMsgId)?.files;
            } else {
              // No tenemos el id real (el stream se cortó antes del `done`). El
              // mensaje de ESTE turno es el único assistant que el server ya
              // tiene y el cliente todavía no conoce. Miramos ese y solo ese:
              // cortamos en el primer assistant desconocido, así nunca caminamos
              // hacia atrás hasta un turno anterior.
              const knownIds = new Set(prev.map((m) => m.id));
              for (let i = data.messages.length - 1; i >= 0; i--) {
                const m = data.messages[i];
                if (m.role !== "assistant" || knownIds.has(m.id)) continue;
                if (m.files && m.files.length > 0) found = m.files;
                break;
              }
            }

            if (!found || found.length === 0) return prev;
            const files = found;
            return prev.map((m) =>
              m.id === stateMsgId ? { ...m, files } : m,
            );
          });
        } catch {
          // Silencioso: red de seguridad, no interrumpe la respuesta.
        }
      };

      // Declarados afuera del try para que el handler de AbortError (botón
      // "Detener") conserve el texto que llegó hasta ese momento.
      let acc = "";
      let started = false;
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        // El POST al execute, envuelto para poder reintentarlo UNA vez tras
        // refrescar la sesión (el JWT dura ~1h; en chats largos se vence).
        const callExecute = () =>
          fetch("/api/tools/claude/execute", {
            method: "POST",
            headers: { "content-type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
              prompt,
              imagePaths: imagePaths.length > 0 ? imagePaths : undefined,
              conversationId: conversationId ?? undefined,
            }),
          });

        let res = await callExecute();

        // 401 = sesión vencida (NO 403 de permisos, que el refresh no arregla).
        // Refrescamos en silencio y reintentamos UNA sola vez; el placeholder
        // "pensando…" sigue visible, así que el usuario no lo nota.
        if (res.status === 401) {
          const refreshed = await fetch("/api/auth/refresh", {
            method: "POST",
            signal: controller.signal,
          });
          if (refreshed.ok) {
            res = await callExecute();
          } else {
            // El refresh token también murió → sesión perdida, a re-loguear.
            setErrorOnPending("Tu sesión expiró. Te llevamos al login…");
            window.location.href = "/login";
            return { ok: false, error: "session_expired" };
          }
        }

        // Errores tempranos (auth / permiso / validación) → JSON con status
        // distinto de 2xx, NO stream.
        if (!res.ok || !res.body) {
          // Si sigue 401 tras refrescar + reintentar, la sesión no se salvó.
          if (res.status === 401) {
            setErrorOnPending("Tu sesión expiró. Te llevamos al login…");
            window.location.href = "/login";
            return { ok: false, error: "session_expired" };
          }
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
            message?: string;
          };
          const errMsg =
            data.message || data.error || "no pudimos procesar tu pedido";
          setErrorOnPending(errMsg);
          return { ok: false, error: errMsg };
        }

        // Stream NDJSON: parseamos línea por línea y vamos pintando el texto.
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            if (!line) continue;
            let ev: {
              type: string;
              text?: string;
              status?: string;
              conversationId?: string;
              messageId?: string;
              tokensInput?: number;
              tokensOutput?: number;
              stopReason?: string | null;
              message?: string;
              code?: string;
              files?: ChatFile[];
              filesFailed?: number;
              filesMissing?: boolean;
            };
            try {
              ev = JSON.parse(line);
            } catch {
              continue;
            }

            if (ev.type === "delta" && ev.text) {
              started = true;
              acc += ev.text;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === pendingMsgId
                    ? { ...m, isPending: false, streaming: true, content: acc }
                    : m,
                ),
              );
            } else if (
              ev.type === "status" &&
              ev.status === "generating_file"
            ) {
              // Claude arrancó a generar un archivo → indicador "generando…".
              started = true;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === pendingMsgId
                    ? {
                        ...m,
                        isPending: false,
                        streaming: true,
                        generatingFile: true,
                      }
                    : m,
                ),
              );
            } else if (ev.type === "error") {
              const msg =
                ev.code === NO_CREDITS_CODE
                  ? NO_CREDITS_MESSAGE
                  : ev.message || "no pudimos procesar tu pedido";
              setErrorOnPending(msg);
              return { ok: false, error: ev.code ?? msg };
            } else if (ev.type === "done") {
              const convId = ev.conversationId ?? "";
              setConversationId(convId);
              const finalText = acc || ev.text || "";
              // messageId "" (la persistencia del mensaje falló) se trata como
              // AUSENTE: `??` no atrapa el string vacío, así que no pisamos el id
              // local con "".
              const serverMsgId =
                ev.messageId && ev.messageId.length > 0 ? ev.messageId : null;
              const stateMsgId = serverMsgId ?? pendingMsgId;
              const doneFiles =
                ev.files && ev.files.length > 0 ? ev.files : undefined;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === pendingMsgId
                    ? {
                        id: stateMsgId,
                        role: "assistant",
                        content: finalText,
                        tokensInput: ev.tokensInput,
                        tokensOutput: ev.tokensOutput,
                        streaming: false,
                        stopReason: ev.stopReason ?? null,
                        files: doneFiles,
                        // Se esperaba un archivo y el user no lo va a ver. Dos
                        // causas, mismo aviso (la acción del user es la misma:
                        // pedirlo de nuevo): `filesFailed` = se capturó pero no
                        // se pudo persistir; `filesMissing` = corrió el sandbox y
                        // no salió ningún archivo (antes este caso quedaba mudo).
                        filesPartialError:
                          (ev.filesFailed != null && ev.filesFailed > 0) ||
                          ev.filesMissing === true
                            ? true
                            : undefined,
                      }
                    : m,
                ),
              );
              // Parte 1: si el `done` NO trajo archivos, reconciliamos desde el
              // server (cubre "se persistió pero el done se cortó/vino sin files").
              if (!doneFiles) {
                await reconcileFilesFromServer(convId, stateMsgId, serverMsgId);
              }
              return { ok: true, conversationId: convId };
            }
          }
        }

        // Stream terminó sin 'done' explícito.
        if (started) {
          // Parte 1: red de seguridad para el corte de stream. Si teníamos
          // conversationId (conv existente), reconciliamos por si se generó un
          // archivo que nunca llegó a la UI. (Conv NUEVA sin `done` todavía no
          // tiene conversationId → gap conocido, baja frecuencia.)
          const convId = conversationId ?? "";
          if (convId) {
            await reconcileFilesFromServer(convId, pendingMsgId, null);
          }
          return { ok: true, conversationId: convId };
        }
        setErrorOnPending("respuesta incompleta, probá de nuevo");
        return { ok: false, error: "respuesta incompleta" };
      } catch (err) {
        // "Detener generación": no es un error — conservamos lo que llegó.
        if (err instanceof DOMException && err.name === "AbortError") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === pendingMsgId
                ? {
                    ...m,
                    isPending: false,
                    streaming: false,
                    content: acc || "_(generación detenida)_",
                  }
                : m,
            ),
          );
          return { ok: true, conversationId: conversationId ?? "" };
        }
        const msg = err instanceof Error ? err.message : "error de red";
        setMessages((prev) =>
          prev.map((m) =>
            m.id === pendingMsgId
              ? { ...m, isPending: false, streaming: false, errorMsg: msg, content: "" }
              : m,
          ),
        );
        return { ok: false, error: msg };
      } finally {
        abortRef.current = null;
        setIsSending(false);
      }
    },
    [conversationId],
  );

  /** Aborta la generación en curso (botón "Detener"). */
  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return {
    messages,
    conversationId,
    isSending,
    loadError,
    stop,
    sendMessage,
    loadConversation,
    newConversation,
  };
}
