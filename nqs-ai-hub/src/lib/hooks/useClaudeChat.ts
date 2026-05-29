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
import { useCallback, useState } from "react";

// ============================================================
// Tipos del chat (UI-side)
// ============================================================

/** Mensaje tal como lo renderea la UI. */
export type ChatMessage = {
  /** ID DB cuando existe, o "local-…" para optimistic. */
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Solo en mensajes del user que adjuntaron imágenes (data URLs para preview). */
  imagePreviews?: string[];
  tokensInput?: number;
  tokensOutput?: number;
  /** Cuando true, en lugar de content se muestra el "Claude está pensando…". */
  isPending?: boolean;
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
    /** Signed download URLs (1h) generadas por el endpoint. */
    imageUrls?: string[];
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
        },
        {
          id: pendingMsgId,
          role: "assistant",
          content: "",
          isPending: true,
        },
      ]);
      setIsSending(true);

      try {
        const res = await fetch("/api/tools/claude/execute", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            prompt,
            imagePaths: imagePaths.length > 0 ? imagePaths : undefined,
            conversationId: conversationId ?? undefined,
          }),
        });
        const data = (await res.json()) as ExecuteResponse;

        if (!res.ok || "error" in data) {
          const errMsg =
            ("error" in data && (data.message || data.error)) ||
            "no pudimos procesar tu pedido";
          setMessages((prev) =>
            prev.map((m) =>
              m.id === pendingMsgId
                ? { ...m, isPending: false, errorMsg: errMsg, content: "" }
                : m,
            ),
          );
          return { ok: false, error: errMsg };
        }

        // Éxito: reemplazamos el placeholder con la respuesta real.
        setConversationId(data.conversationId);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === pendingMsgId
              ? {
                  id: data.messageId,
                  role: "assistant",
                  content: data.text,
                  tokensInput: data.tokensInput,
                  tokensOutput: data.tokensOutput,
                }
              : m,
          ),
        );
        return { ok: true, conversationId: data.conversationId };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "error de red";
        setMessages((prev) =>
          prev.map((m) =>
            m.id === pendingMsgId
              ? { ...m, isPending: false, errorMsg: msg, content: "" }
              : m,
          ),
        );
        return { ok: false, error: msg };
      } finally {
        setIsSending(false);
      }
    },
    [conversationId],
  );

  return {
    messages,
    conversationId,
    isSending,
    loadError,
    sendMessage,
    loadConversation,
    newConversation,
  };
}
