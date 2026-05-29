"use client";

/**
 * Vista del wrapper de Claude.
 *
 * Estructura:
 *   ┌────────────────────────────────────────────────────────────┐
 *   │ Header (back · título · status)                            │
 *   ├──────────────┬─────────────────────────────────────────────┤
 *   │ Conversa-    │ Mensajes (scroll independiente)             │
 *   │ ciones       │                                             │
 *   │ (sidebar)    ├─────────────────────────────────────────────┤
 *   │              │ Input (sticky bottom de la columna)         │
 *   └──────────────┴─────────────────────────────────────────────┘
 *
 * El system prompt nunca llega acá — vive en el backend.
 */
import { useCallback, useState } from "react";
import Link from "next/link";
import { showToast } from "@/lib/store/toast";
import { useClaudeChat } from "@/lib/hooks/useClaudeChat";
import { ChatInput } from "@/components/tool/ChatInput";
// (ImagePayload ya no se usa — las imágenes viajan como paths de Storage)
import { ChatMessages } from "@/components/tool/ChatMessages";
import { ConversationsSidebar } from "@/components/tool/ConversationsSidebar";

type ClaudeViewProps = Readonly<{
  user: {
    name: string;
    initials: string;
  };
}>;

export function ClaudeView({ user }: ClaudeViewProps) {
  const chat = useClaudeChat();
  // Bumpeamos este número cuando creamos una conv nueva, para que el
  // sidebar haga refetch y muestre la nueva entrada arriba.
  const [sidebarRefresh, setSidebarRefresh] = useState(0);

  const firstName = user.name.split(" ")[0] ?? user.name;

  const onSend = useCallback(
    async (
      prompt: string,
      imagePaths: string[],
      previews: string[],
    ) => {
      const wasNew = chat.conversationId === null;
      const result = await chat.sendMessage(prompt, imagePaths, previews);
      if (!result.ok) {
        showToast({
          title: "ERROR",
          msg: result.error,
          color: "var(--danger, #ff5c5c)",
        });
        return;
      }
      if (wasNew) {
        // Trigger refetch del sidebar.
        setSidebarRefresh((n) => n + 1);
      }
    },
    [chat],
  );

  const onSelectConversation = useCallback(
    (id: string) => {
      void chat.loadConversation(id);
    },
    [chat],
  );

  const onNew = useCallback(() => {
    chat.newConversation();
  }, [chat]);

  return (
    <div
      className="page"
      style={{
        padding: 0,
        height: "calc(100vh - 60px - 38px)", // topbar + marquee aprox
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* ─── Header ─── */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 32px",
          borderBottom: "1px solid var(--line)",
        }}
      >
        <div className="row" style={{ gap: 18 }}>
          <Link
            href="/hub"
            prefetch={false}
            className="t-meta"
            style={{
              color: "var(--fg-mute)",
              textDecoration: "none",
              fontFamily: "var(--mono)",
              fontSize: 11,
              letterSpacing: "0.12em",
            }}
          >
            ← VOLVER AL HUB
          </Link>
          <div
            style={{
              width: 1,
              height: 16,
              background: "var(--line)",
            }}
          />
          <div className="brand" style={{ gap: 10 }}>
            <span
              className="brand-mark"
              style={{ background: "#D97757", color: "#fff" }}
              title="Claude · Anthropic"
            >
              C
            </span>
            <span>CLAUDE</span>
            <span className="brand-pip" title="conectado" />
          </div>
        </div>
        <div className="t-meta dim" style={{ fontSize: 10 }}>
          ↳ {chat.conversationId ? "CONVERSACIÓN ACTIVA" : "CONVERSACIÓN NUEVA"}
        </div>
      </header>

      {/* ─── Body ─── */}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <ConversationsSidebar
          activeId={chat.conversationId}
          refreshSignal={sidebarRefresh}
          onSelect={onSelectConversation}
          onNew={onNew}
        />

        <main
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
            padding: "20px 32px 24px",
          }}
        >
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              paddingRight: 8,
            }}
          >
            {chat.loadError && (
              <div className="chat-block" style={{ marginBottom: 12 }}>
                <strong>ERROR</strong>
                {chat.loadError}
              </div>
            )}
            <ChatMessages
              messages={chat.messages}
              userInitials={user.initials}
              userFirstName={firstName}
            />
          </div>

          <ChatInput
            isSending={chat.isSending}
            conversationId={chat.conversationId}
            onSend={onSend}
          />
        </main>
      </div>
    </div>
  );
}
