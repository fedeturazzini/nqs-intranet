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
 * Las sesiones en curso viven en un store efímero de este módulo para
 * sobrevivir mounts de `<ClaudeView />` dentro de la SPA. No se persisten al
 * cerrar/recargar la pestaña: esa durabilidad requiere diseño server-side.
 */
import { useCallback, useEffect, useRef, useState } from "react";
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
  /** Une el user optimista + placeholder de una ejecución cliente. No se
   * persiste; permite conservarlos en su conversación al navegar. */
  clientExecutionId?: string;
  role: "user" | "assistant";
  content: string;
  /** Horario del mensaje (ISO). Real (`created_at` de la DB) en el historial y en
   *  el mensaje del assistant recién llegado; aproximado (momento del envío) en
   *  el mensaje optimista del user y como fallback si la persistencia falló. */
  createdAt?: string;
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
  /** La única llamada no entregó el artifact `.txt`/`.md` solicitado. */
  textFileFallback?: {
    filename: string;
  };
  /** Claude terminó en un tool_use que el server no pudo materializar. */
  toolDeliveryFailed?: {
    toolName: string;
  };
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
    created_at: string | null;
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

type ChatSessionState = {
  key: string;
  projectId: string | null;
  conversationId: string | null;
  messages: ChatMessage[];
  isSending: boolean;
  loadError: string | null;
  loadRequest: number;
  syncRequest: number;
};

type SessionLoad = {
  key: string;
  request: number;
  syncRequest: number;
  selection: number;
};

type SessionSync = {
  key: string;
  request: number;
};

/**
 * Estado efímero compartido entre mounts de ClaudeView.
 *
 * Vive solo mientras la SPA está abierta: conserva conversaciones/generaciones
 * al navegar hub ↔ Claude, pero deliberadamente NO intenta sobrevivir un cierre
 * de pestaña o una recarga completa (ese alcance requiere persistencia server).
 */
export function createClaudeChatSessionStore() {
  const sessions = new Map<string, ChatSessionState>();
  const listeners = new Set<(session: ChatSessionState) => void>();
  let activeKey: string | null = null;
  let sequence = 0;
  let selection = 0;

  const newKey = () => `draft-${Date.now()}-${++sequence}`;
  const conversationKey = (id: string) => `conversation-${id}`;

  function createSession(
    projectId: string | null,
    conversationId: string | null = null,
  ): ChatSessionState {
    return {
      key: conversationId ? conversationKey(conversationId) : newKey(),
      projectId,
      conversationId,
      messages: [],
      isSending: false,
      loadError: null,
      loadRequest: 0,
      syncRequest: 0,
    };
  }

  function active(): ChatSessionState {
    const found = activeKey ? sessions.get(activeKey) : null;
    if (found) return found;
    const created = createSession(null);
    sessions.set(created.key, created);
    activeKey = created.key;
    return created;
  }

  function emit(): void {
    const current = active();
    for (const listener of listeners) listener(current);
  }

  function activate(session: ChatSessionState): ChatSessionState {
    sessions.set(session.key, session);
    activeKey = session.key;
    selection += 1;
    emit();
    return session;
  }

  function ensureProject(projectId: string | null): ChatSessionState {
    const current = active();
    if (current.projectId === projectId) return current;
    return activate(createSession(projectId));
  }

  function startNew(projectId: string | null): ChatSessionState {
    return activate(createSession(projectId));
  }

  function selectConversation(
    projectId: string | null,
    conversationId: string,
  ): ChatSessionState {
    const key = conversationKey(conversationId);
    const existing = sessions.get(key);
    return activate(
      existing?.projectId === projectId
        ? existing
        : createSession(projectId, conversationId),
    );
  }

  function update(
    key: string,
    updater: (session: ChatSessionState) => ChatSessionState,
  ): ChatSessionState | null {
    const current = sessions.get(key);
    if (!current) return null;
    const next = updater(current);
    sessions.set(key, next);
    if (activeKey === key) emit();
    return next;
  }

  function migrateToConversation(key: string, conversationId: string): string {
    const current = sessions.get(key);
    if (!current || current.conversationId === conversationId) return key;
    const nextKey = conversationKey(conversationId);
    const migrated = { ...current, key: nextKey, conversationId };
    sessions.delete(key);
    sessions.set(nextKey, migrated);
    if (activeKey === key) {
      activeKey = nextKey;
      emit();
    }
    return nextKey;
  }

  function beginLoad(
    projectId: string | null,
    conversationId: string,
  ): SessionLoad {
    const selected = selectConversation(projectId, conversationId);
    const request = selected.loadRequest + 1;
    const syncRequest = selected.syncRequest + 1;
    sessions.set(selected.key, {
      ...selected,
      loadRequest: request,
      syncRequest,
      loadError: null,
    });
    emit();
    return { key: selected.key, request, syncRequest, selection };
  }

  function isCurrentLoad(load: SessionLoad): boolean {
    return (
      activeKey === load.key &&
      selection === load.selection &&
      sessions.get(load.key)?.loadRequest === load.request &&
      sessions.get(load.key)?.syncRequest === load.syncRequest
    );
  }

  function applyLoad(load: SessionLoad, messages: ChatMessage[]): boolean {
    if (!isCurrentLoad(load)) return false;
    update(load.key, (session) => ({
      ...session,
      messages: reconcileMessages(messages, session.messages),
      loadError: null,
    }));
    return true;
  }

  function failLoad(load: SessionLoad, message: string): boolean {
    if (!isCurrentLoad(load)) return false;
    update(load.key, (session) => ({
      ...session,
      loadError: message,
    }));
    return true;
  }

  function beginReconcile(key: string): SessionSync | null {
    const current = sessions.get(key);
    if (!current) return null;
    const request = current.syncRequest + 1;
    sessions.set(key, { ...current, syncRequest: request });
    return { key, request };
  }

  function applyReconcile(
    sync: SessionSync,
    messages: ChatMessage[],
  ): boolean {
    const current = sessions.get(sync.key);
    if (!current || current.syncRequest !== sync.request) return false;
    update(sync.key, (session) => ({
      ...session,
      messages: reconcileMessages(messages, session.messages),
    }));
    return true;
  }

  return {
    subscribe(listener: (session: ChatSessionState) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    active,
    ensureProject,
    startNew,
    beginLoad,
    applyLoad,
    failLoad,
    isCurrentLoad,
    update,
    migrateToConversation,
    beginReconcile,
    applyReconcile,
  };
}

/**
 * El server es autoritativo para mensajes persistidos y files por message_id.
 * Solo conservamos grupos optimistas que todavía tengan un assistant en vuelo.
 * Nunca buscamos "el último assistant con archivos" (regresión 73e2153).
 */
export function reconcileMessages(
  serverMessages: ChatMessage[],
  localMessages: ChatMessage[],
): ChatMessage[] {
  const pendingExecutions = new Set(
    localMessages
      .filter(
        (message) =>
          message.role === "assistant" &&
          message.clientExecutionId &&
          (message.isPending || message.streaming || message.generatingFile),
      )
      .map((message) => message.clientExecutionId as string),
  );
  const pendingLocal = localMessages.filter(
    (message) =>
      message.clientExecutionId &&
      pendingExecutions.has(message.clientExecutionId),
  );
  const localById = new Map(
    localMessages.map((message) => [message.id, message]),
  );
  const reconciledServer = serverMessages.map((serverMessage) => {
    const local = localById.get(serverMessage.id);
    if (!local) return serverMessage;
    return {
      ...serverMessage,
      // `done.files` ya es autoritativo. Un GET iniciado inmediatamente puede
      // observar un snapshot atrasado sin esos files; solo preservamos los del
      // mismo message_id, nunca los trasladamos a otro assistant.
      ...(local.files?.length && !serverMessage.files?.length
        ? { files: local.files }
        : {}),
      // Metadatos efímeros de entrega no viven en DB. Los preservamos solo por
      // id exacto; nunca se trasladan al "último mensaje".
      ...(local.filesPartialError !== undefined
        ? { filesPartialError: local.filesPartialError }
        : {}),
      ...(local.textFileFallback !== undefined
        ? { textFileFallback: local.textFileFallback }
        : {}),
      ...(local.toolDeliveryFailed !== undefined
        ? { toolDeliveryFailed: local.toolDeliveryFailed }
        : {}),
      ...(local.stopReason !== undefined
        ? { stopReason: local.stopReason }
        : {}),
    };
  });
  const serverIds = new Set(serverMessages.map((message) => message.id));
  return [
    ...reconciledServer,
    ...pendingLocal.filter((message) => !serverIds.has(message.id)),
  ];
}

/**
 * El `done.text` viene del resultado final normalizado/persistido por el server
 * (puede incluir un artifact reparado al terminar). Los deltas son solo una
 * vista progresiva y nunca deben pisar esa versión autoritativa.
 */
export function resolveFinalResponseText(
  streamedText: string,
  doneText: string | undefined,
): string {
  return doneText ?? streamedText;
}

const chatSessions = createClaudeChatSessionStore();
const executionControllers = new Map<string, AbortController>();

function mapConversationMessages(
  data: ConversationDetailResponse,
): ChatMessage[] {
  return data.messages.map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt: message.created_at ?? undefined,
    tokensInput: message.tokens_input ?? undefined,
    tokensOutput: message.tokens_output ?? undefined,
    imagePreviews:
      message.imageUrls && message.imageUrls.length > 0
        ? message.imageUrls
        : undefined,
    pdfAttachments:
      message.pdfAttachments && message.pdfAttachments.length > 0
        ? message.pdfAttachments
        : undefined,
    // Asociación exacta resuelta por el endpoint según message_id. No usamos
    // ningún fallback de "último archivo de la conversación".
    files:
      message.files && message.files.length > 0 ? message.files : undefined,
  }));
}

async function fetchConversation(
  conversationId: string,
): Promise<ConversationDetailResponse | null> {
  const res = await fetch(`/api/me/conversations/${conversationId}`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  return (await res.json()) as ConversationDetailResponse;
}

// ============================================================
// Hook
// ============================================================

export type UseClaudeChat = ReturnType<typeof useClaudeChat>;

export function useClaudeChat(projectId: string | null = null) {
  const [session, setSession] = useState<ChatSessionState>(() =>
    chatSessions.ensureProject(projectId),
  );
  const mountedProjectRef = useRef(projectId);

  const loadConversation = useCallback(
    async (id: string) => {
      const load = chatSessions.beginLoad(projectId, id);
      try {
        const data = await fetchConversation(id);
        if (!data) {
          chatSessions.failLoad(load, "no pude cargar la conversación");
          return;
        }
        chatSessions.applyLoad(load, mapConversationMessages(data));
      } catch (err) {
        chatSessions.failLoad(
          load,
          err instanceof Error ? err.message : "error desconocido",
        );
      }
    },
    [projectId],
  );

  useEffect(() => chatSessions.subscribe(setSession), []);

  useEffect(() => {
    // Primer mount con el mismo proyecto: restaurar la sesión en memoria y
    // re-fetchear la DB. Cambio de proyecto dentro de Claude: empezar limpio,
    // igual que el comportamiento previo.
    const projectChanged = mountedProjectRef.current !== projectId;
    mountedProjectRef.current = projectId;
    const current = projectChanged
      ? chatSessions.startNew(projectId)
      : chatSessions.ensureProject(projectId);
    setSession(current);
    if (current.conversationId) {
      void loadConversation(current.conversationId);
    }
  }, [projectId, loadConversation]);

  const newConversation = useCallback(() => {
    chatSessions.startNew(projectId);
  }, [projectId]);

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
    ): Promise<
      { ok: true; conversationId: string } | { ok: false; error: string }
    > => {
      const source = chatSessions.ensureProject(projectId);
      let sessionKey = source.key;
      const sourceConversationId = source.conversationId;
      const executionId = crypto.randomUUID();
      const userMsgId = `local-${crypto.randomUUID()}`;
      const pendingMsgId = `local-${crypto.randomUUID()}`;

      // Optimistic: agregamos user + placeholder "pensando…" al toque.
      chatSessions.update(sessionKey, (current) => ({
        ...current,
        isSending: true,
        messages: [
          ...current.messages,
          {
            id: userMsgId,
            clientExecutionId: executionId,
            role: "user",
            content: prompt,
            // Aproximado (no hay round-trip al server todavía): es el propio envío
            // del user, pasando AHORA, así que la diferencia es milisegundos.
            createdAt: new Date().toISOString(),
            imagePreviews: imagePreviews.length > 0 ? imagePreviews : undefined,
            pdfAttachments: pdfPreviews.length > 0 ? pdfPreviews : undefined,
          },
          {
            id: pendingMsgId,
            clientExecutionId: executionId,
            role: "assistant",
            content: "",
            isPending: true,
          },
        ],
      }));

      const setErrorOnPending = (errMsg: string) =>
        chatSessions.update(sessionKey, (current) => ({
          ...current,
          messages: current.messages.map((message) =>
            message.clientExecutionId === executionId &&
            message.role === "assistant"
              ? {
                  ...message,
                  isPending: false,
                  streaming: false,
                  errorMsg: errMsg,
                  content: "",
                }
              : message,
          ),
        }));

      // Generaliza la red de seguridad de 73e2153: re-fetchea la conversación
      // completa y reconcilia mensajes + files por el message_id que ya resolvió
      // el endpoint. Nunca adopta archivos de "otro/último" turno.
      const reconcileFromServer = async (
        convId: string,
        key: string,
      ): Promise<void> => {
        if (!convId) return;
        const sync = chatSessions.beginReconcile(key);
        if (!sync) return;
        try {
          const data = await fetchConversation(convId);
          if (data) {
            chatSessions.applyReconcile(sync, mapConversationMessages(data));
          }
        } catch {
          // Silencioso: red de seguridad, no interrumpe la respuesta.
        }
      };

      // Declarados afuera del try para que el handler de AbortError (botón
      // "Detener") conserve el texto que llegó hasta ese momento.
      let acc = "";
      let started = false;
      const controller = new AbortController();
      executionControllers.set(executionId, controller);

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
              conversationId: sourceConversationId ?? undefined,
              projectId: projectId ?? undefined,
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
              createdAt?: string | null;
              tokensInput?: number;
              tokensOutput?: number;
              stopReason?: string | null;
              message?: string;
              code?: string;
              files?: ChatFile[];
              filesFailed?: number;
              filesMissing?: boolean;
              textFileFallback?: {
                filename: string;
              };
              toolDeliveryFailed?: {
                toolName: string;
              };
            };
            try {
              ev = JSON.parse(line);
            } catch {
              continue;
            }

            if (ev.type === "delta" && ev.text) {
              started = true;
              acc += ev.text;
              chatSessions.update(sessionKey, (current) => ({
                ...current,
                messages: current.messages.map((message) =>
                  message.clientExecutionId === executionId &&
                  message.role === "assistant"
                    ? {
                        ...message,
                        isPending: false,
                        streaming: true,
                        content: acc,
                      }
                    : message,
                ),
              }));
            } else if (
              ev.type === "status" &&
              (ev.status === "generating_file" ||
                ev.status === "generating_artifact")
            ) {
              // Claude arrancó a generar un archivo → indicador "generando…".
              started = true;
              chatSessions.update(sessionKey, (current) => ({
                ...current,
                messages: current.messages.map((message) =>
                  message.clientExecutionId === executionId &&
                  message.role === "assistant"
                    ? {
                        ...message,
                        isPending: false,
                        streaming: true,
                        generatingFile: true,
                      }
                    : message,
                ),
              }));
            } else if (ev.type === "error") {
              const msg =
                ev.code === NO_CREDITS_CODE
                  ? NO_CREDITS_MESSAGE
                  : ev.message || "no pudimos procesar tu pedido";
              setErrorOnPending(msg);
              return { ok: false, error: ev.code ?? msg };
            } else if (ev.type === "done") {
              const convId = ev.conversationId ?? "";
              const finalText = resolveFinalResponseText(acc, ev.text);
              // messageId "" (la persistencia del mensaje falló) se trata como
              // AUSENTE: `??` no atrapa el string vacío, así que no pisamos el id
              // local con "".
              const serverMsgId =
                ev.messageId && ev.messageId.length > 0 ? ev.messageId : null;
              const stateMsgId = serverMsgId ?? pendingMsgId;
              const doneFiles =
                ev.files && ev.files.length > 0 ? ev.files : undefined;
              chatSessions.update(sessionKey, (current) => ({
                ...current,
                messages: current.messages.map((message) =>
                  message.clientExecutionId === executionId &&
                  message.role === "assistant"
                    ? {
                        id: stateMsgId,
                        role: "assistant",
                        content: finalText,
                        // Real si la persistencia dejó un created_at; si no
                        // (falló, o el done nunca trajo el campo), "ahora" —
                        // más preciso que dejarlo sin horario.
                        createdAt: ev.createdAt ?? new Date().toISOString(),
                        tokensInput: ev.tokensInput,
                        tokensOutput: ev.tokensOutput,
                        streaming: false,
                        stopReason: ev.stopReason ?? null,
                        files: doneFiles,
                        textFileFallback: ev.textFileFallback,
                        toolDeliveryFailed: ev.toolDeliveryFailed,
                        // Se esperaba un archivo y el user no lo va a ver. Dos
                        // causas, mismo aviso (la acción del user es la misma:
                        // pedirlo de nuevo): `filesFailed` = se capturó pero no
                        // se pudo persistir; `filesMissing` = se pidió un binario
                        // y no llegó ningún file_id (antes quedaba mudo).
                        filesPartialError:
                          (ev.filesFailed != null && ev.filesFailed > 0) ||
                          (ev.filesMissing === true && !ev.textFileFallback) ||
                          ev.toolDeliveryFailed != null
                            ? true
                            : undefined,
                      }
                    : message,
                ),
              }));
              if (convId && !sourceConversationId) {
                // Migra el draft a su id real. Solo cambia la selección visible
                // si este draft sigue activo; un done viejo jamás roba el foco.
                sessionKey = chatSessions.migrateToConversation(
                  sessionKey,
                  convId,
                );
              }
              if (convId) {
                // Siempre reconciliamos el mensaje final, no solo files: cubre
                // placeholder desmontado/done tardío y mantiene files exactos.
                void reconcileFromServer(convId, sessionKey);
              }
              return { ok: true, conversationId: convId };
            }
          }
        }

        // Stream terminó sin 'done' explícito.
        if (started) {
          // Red de seguridad para el corte del canal: si la conversación ya
          // existía, traemos la verdad persistida sin tocar otra selección.
          const convId = sourceConversationId ?? "";
          if (convId) {
            await reconcileFromServer(convId, sessionKey);
          }
          return { ok: true, conversationId: convId };
        }
        setErrorOnPending("respuesta incompleta, probá de nuevo");
        return { ok: false, error: "respuesta incompleta" };
      } catch (err) {
        // "Detener generación": no es un error — conservamos lo que llegó.
        if (err instanceof DOMException && err.name === "AbortError") {
          chatSessions.update(sessionKey, (current) => ({
            ...current,
            messages: current.messages.map((message) =>
              message.clientExecutionId === executionId &&
              message.role === "assistant"
                ? {
                    ...message,
                    isPending: false,
                    streaming: false,
                    content: acc || "_(generación detenida)_",
                  }
                : message,
            ),
          }));
          return { ok: true, conversationId: sourceConversationId ?? "" };
        }
        const msg = err instanceof Error ? err.message : "error de red";
        setErrorOnPending(msg);
        return { ok: false, error: msg };
      } finally {
        executionControllers.delete(executionId);
        chatSessions.update(sessionKey, (current) => ({
          ...current,
          isSending: false,
        }));
      }
    },
    [projectId],
  );

  /** Aborta la generación en curso (botón "Detener"). */
  const stop = useCallback(() => {
    const active = chatSessions.active();
    const executionId = [...active.messages]
      .reverse()
      .find(
        (message) =>
          message.role === "assistant" &&
          message.clientExecutionId &&
          (message.isPending || message.streaming),
      )?.clientExecutionId;
    if (executionId) executionControllers.get(executionId)?.abort();
  }, []);

  return {
    messages: session.messages,
    conversationId: session.conversationId,
    isSending: session.isSending,
    loadError: session.loadError,
    stop,
    sendMessage,
    loadConversation,
    newConversation,
  };
}
