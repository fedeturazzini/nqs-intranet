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
import { MarkdownRenderer } from "@/components/chat/MarkdownRenderer";
import type { ChatMessage } from "@/lib/hooks/useClaudeChat";

type ChatMessagesProps = Readonly<{
  messages: ChatMessage[];
  userInitials: string;
  userFirstName: string;
}>;

/** Busca el ancestro scrolleable (overflow-y auto/scroll) más cercano. */
function getScrollParent(node: HTMLElement | null): HTMLElement | null {
  let el = node?.parentElement ?? null;
  while (el) {
    const oy = getComputedStyle(el).overflowY;
    if (oy === "auto" || oy === "scroll") return el;
    el = el.parentElement;
  }
  return null;
}

export function ChatMessages({
  messages,
  userInitials,
  userFirstName,
}: ChatMessagesProps) {
  const endRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  // ¿El user está pegado al fondo? Si scrolleó arriba para leer mensajes
  // anteriores, NO autoscrolleamos (no lo interrumpimos mientras Claude
  // sigue streameando).
  const stickRef = useRef(true);
  const prevLenRef = useRef(messages.length);

  // Detectar scroll manual sobre el contenedor scrolleable (vive en
  // ClaudeView). Si el user se aleja del fondo, dejamos de pegarlo abajo.
  useEffect(() => {
    const scroller = getScrollParent(listRef.current);
    if (!scroller) return;
    const onScroll = () => {
      const dist =
        scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
      stickRef.current = dist < 80;
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => scroller.removeEventListener("scroll", onScroll);
  }, []);

  // Autoscroll: instantáneo en cada chunk de streaming, suave al entrar un
  // mensaje nuevo. Si el user acaba de mandar un mensaje, forzamos ir al fondo.
  useEffect(() => {
    const grew = messages.length > prevLenRef.current;
    prevLenRef.current = messages.length;
    const last = messages[messages.length - 1];
    if (grew && last?.role === "user") stickRef.current = true;
    if (stickRef.current) {
      endRef.current?.scrollIntoView({
        behavior: grew ? "smooth" : "auto",
        block: "end",
      });
    }
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
      ref={listRef}
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
          <ThinkingIndicator />
        ) : msg.errorMsg ? (
          <div className="chat-block">
            <strong>ERROR</strong>
            {msg.errorMsg}
          </div>
        ) : isAi ? (
          // Respuestas de Claude: markdown renderizado (headers, listas,
          // bold, código con highlight, tablas).
          <MarkdownRenderer content={msg.content} />
        ) : (
          // Mensajes del user: texto plano (no es markdown).
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

/**
 * Indicador "Claude está pensando…" con un contador de segundos que sube,
 * como el Claude original. Cuenta desde que se monta (mientras el mensaje
 * está pending) hasta que llega el primer fragmento de texto (se desmonta).
 */
function ThinkingIndicator() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const t = setInterval(() => {
      setSeconds(Math.floor((Date.now() - start) / 1000));
    }, 250);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="pulse" style={{ opacity: 0.7 }}>
      Claude está pensando…{seconds > 0 ? ` ${seconds}s` : ""}
    </span>
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
