"use client";

/**
 * Render de la lista de mensajes del chat de Claude.
 *
 * Adaptado de design/screens.jsx ClaudeMock (líneas 435-461).
 * Cada mensaje: avatar + who + content + imágenes opcionales + botón copy
 * (solo en assistant).
 *
 * Auto-scroll al último mensaje cada vez que cambia la lista o entra un
 * mensaje en estado pending.
 */
import { useEffect, useRef, useState } from "react";
import { showToast } from "@/lib/store/toast";
import { ImageLightbox } from "@/components/chat/ImageLightbox";
import type { ChatMessage } from "@/lib/hooks/useClaudeChat";

type ChatMessagesProps = Readonly<{
  messages: ChatMessage[];
  userInitials: string;
  userFirstName: string;
}>;

export function ChatMessages({
  messages,
  userInitials,
  userFirstName,
}: ChatMessagesProps) {
  const endRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll cada vez que entran o cambian mensajes.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div
        className="t-meta dim"
        style={{ textAlign: "center", padding: "80px 16px" }}
      >
        ↳ escribí abajo para arrancar una conversación
      </div>
    );
  }

  return (
    <div
      className="claude-mock"
      style={{ maxWidth: "none", margin: 0, gap: 12 }}
    >
      {messages.map((m) => (
        <MessageBubble
          key={m.id}
          msg={m}
          userInitials={userInitials}
          userFirstName={userFirstName}
        />
      ))}
      <div ref={endRef} />
    </div>
  );
}

type MessageBubbleProps = Readonly<{
  msg: ChatMessage;
  userInitials: string;
  userFirstName: string;
}>;

function MessageBubble({
  msg,
  userInitials,
  userFirstName,
}: MessageBubbleProps) {
  const isAi = msg.role === "assistant";
  const whoLabel = isAi ? "CLAUDE" : userFirstName.toUpperCase();
  const avatarText = isAi ? "C" : userInitials;
  const cssClass = `chat-msg ${isAi ? "ai" : "user"}`;

  // FEEDBACK NQS v2.0 (Part 6): visor de imágenes en grande.
  const images = msg.imagePreviews ?? [];
  const [lightbox, setLightbox] = useState<{ open: boolean; index: number }>({
    open: false,
    index: 0,
  });

  return (
    <div className={cssClass}>
      <div className={`av ${isAi ? "ai" : ""}`}>{avatarText}</div>
      <div className="body">
        <div
          className="who"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <span>{whoLabel}</span>
          {isAi && !msg.isPending && !msg.errorMsg && msg.content && (
            <CopyButton text={msg.content} />
          )}
          {isAi && msg.tokensInput != null && msg.tokensOutput != null && (
            <span
              className="t-meta dim"
              style={{ fontSize: 9, letterSpacing: "0.08em" }}
            >
              in {msg.tokensInput} · out {msg.tokensOutput}
            </span>
          )}
        </div>

        {msg.isPending ? (
          <span className="pulse" style={{ opacity: 0.7 }}>
            Claude está pensando…
          </span>
        ) : msg.errorMsg ? (
          <div className="chat-block">
            <strong>ERROR</strong>
            {msg.errorMsg}
          </div>
        ) : (
          <div style={{ whiteSpace: "pre-wrap" }}>{msg.content}</div>
        )}

        {images.length > 0 && (
          <div
            style={{
              display: "flex",
              gap: 8,
              marginTop: 10,
              flexWrap: "wrap",
            }}
          >
            {images.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={src}
                alt=""
                onClick={() => setLightbox({ open: true, index: i })}
                title="ver en grande"
                style={{
                  width: 100,
                  height: 100,
                  objectFit: "cover",
                  borderRadius: 8,
                  border: "1px solid var(--line)",
                  cursor: "zoom-in",
                }}
              />
            ))}
          </div>
        )}
      </div>

      <ImageLightbox
        open={lightbox.open}
        images={images}
        initialIndex={lightbox.index}
        onClose={() => setLightbox({ open: false, index: 0 })}
      />
    </div>
  );
}

type CopyButtonProps = Readonly<{ text: string }>;

function CopyButton({ text }: CopyButtonProps) {
  async function handleClick() {
    try {
      await navigator.clipboard.writeText(text);
      showToast({
        title: "COPIADO",
        msg: "Respuesta copiada al portapapeles.",
        color: "var(--ok, #6DD58C)",
      });
    } catch {
      showToast({
        title: "ERROR",
        msg: "No pude copiar al portapapeles.",
        color: "var(--danger, #ff5c5c)",
      });
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="t-meta"
      title="copiar respuesta"
      style={{
        background: "transparent",
        border: "1px solid var(--line)",
        borderRadius: 6,
        padding: "2px 8px",
        cursor: "pointer",
        fontSize: 10,
        letterSpacing: "0.12em",
        color: "var(--fg-mute)",
        textTransform: "uppercase",
        fontFamily: "var(--mono)",
      }}
    >
      ⧉ copiar
    </button>
  );
}
