"use client";

/**
 * Detalle de conversación en modo solo lectura (admin).
 * Reusa ChatMessages; sin ChatInput ni acciones de escritura.
 * focusMessageId: scroll + highlight al mensaje del gasto.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChatMessages } from "@/components/tool/ChatMessages";
import {
  mapConversationMessages,
  type ChatMessage,
  type ConversationDetailResponse,
} from "@/lib/hooks/useClaudeChat";

type AdminConversationDetailProps = Readonly<{
  userId: string;
  conversationId: string;
  focusMessageId?: string | null;
}>;

type AdminDetailResponse = ConversationDetailResponse & {
  conversation: ConversationDetailResponse["conversation"] & {
    userId: string;
    userName: string;
    projectId: string | null;
    projectName: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
  };
};

export function AdminConversationDetail({
  userId,
  conversationId,
  focusMessageId = null,
}: AdminConversationDetailProps) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [meta, setMeta] = useState<AdminDetailResponse["conversation"] | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/admin/conversations/${conversationId}`,
          { cache: "no-store" },
        );
        if (res.status === 403) {
          router.refresh();
          return;
        }
        if (!res.ok) {
          if (!cancelled) setError("no pude cargar la conversación");
          return;
        }
        const data = (await res.json()) as AdminDetailResponse;
        if (cancelled) return;
        setMeta(data.conversation);
        setMessages(mapConversationMessages(data));
      } catch {
        if (!cancelled) setError("error de red");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [conversationId, router]);

  const initials = meta
    ? meta.userName
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0]?.toUpperCase() ?? "")
        .join("") || "?"
    : "?";
  const firstName = meta?.userName.split(" ")[0] ?? "Usuario";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
      }}
    >
      <div style={{ padding: "20px 32px 12px", flexShrink: 0 }}>
        <Link
          href={`/admin/logs/${userId}/conversations`}
          className="t-meta"
          style={{ color: "var(--accent)" }}
        >
          ← volver a conversaciones
        </Link>
        <div className="t-eyebrow" style={{ margin: "12px 0 6px" }}>
          ↳ ADMIN · CONVERSACIÓN · SOLO LECTURA
        </div>
        <h1 className="page-title" style={{ fontSize: 22, margin: 0 }}>
          <em style={{ fontFamily: "var(--serif)" }}>
            {meta?.title?.trim() || "(sin título)"}
          </em>
        </h1>
        <p className="t-meta dim" style={{ marginTop: 6 }}>
          {meta
            ? `${meta.userName} · ${meta.projectName ?? "Sin proyecto"}`
            : "…"}
          {focusMessageId ? " · mensaje del gasto resaltado" : ""}
        </p>
      </div>

      {error && (
        <div
          className="t-meta"
          style={{ color: "var(--danger)", padding: "0 32px" }}
        >
          ↳ {error}
        </div>
      )}

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          padding: "0 32px 32px",
          borderTop: "1px solid var(--line)",
          background: "var(--bg)",
        }}
      >
        <div
          className="t-meta"
          style={{
            margin: "12px 0",
            padding: "8px 12px",
            border: "1px dashed var(--line-strong)",
            borderRadius: 6,
            color: "var(--fg-mute)",
            fontSize: 11,
          }}
        >
          Vista de admin — no se puede enviar mensajes ni editar.
        </div>
        <ChatMessages
          messages={messages}
          isLoadingConversation={loading}
          userInitials={initials}
          userFirstName={firstName}
          focusMessageId={focusMessageId}
        />
      </div>
    </div>
  );
}
