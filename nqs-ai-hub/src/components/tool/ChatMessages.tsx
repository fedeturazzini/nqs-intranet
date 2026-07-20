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
import {
  ArtifactCard,
  ArtifactGeneratingPlaceholder,
} from "@/components/chat/ArtifactCard";
import { FileCard } from "@/components/chat/FileCard";
import { UploadedPdfCard } from "@/components/chat/UploadedPdfCard";
import {
  parseMessageWithArtifacts,
  hasIncompleteArtifact,
  hasIncompleteThinking,
  extractPartialArtifact,
} from "@/lib/utils/parse-artifacts";
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
  // PDFs adjuntos del user → cards (no <img>).
  const pdfs = msg.pdfAttachments ?? [];
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
          // Respuestas de Claude: separamos el texto (markdown) de los
          // artifacts (cards descargables).
          <AssistantContent
            content={msg.content}
            streaming={msg.streaming ?? false}
          />
        ) : (
          // Mensajes del user: texto plano (no es markdown).
          <div style={{ whiteSpace: "pre-wrap" }}>{msg.content}</div>
        )}

        {/* Mientras Claude genera el archivo en el sandbox (espera silenciosa
            del code execution): indicador "generando archivo…". Desaparece
            cuando llega la card (o si falló). */}
        {isAi &&
          msg.generatingFile &&
          !msg.errorMsg &&
          (!msg.files || msg.files.length === 0) && (
            <div style={{ marginTop: 10 }}>
              <ArtifactGeneratingPlaceholder />
            </div>
          )}

        {/* Archivos REALES generados por Claude (PDF/Word/Excel/PPT): una card
            por archivo, con descarga por signed URL. */}
        {isAi && msg.files && msg.files.length > 0 && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              marginTop: 10,
            }}
          >
            {msg.files.map((f) => (
              <FileCard key={f.id} file={f} />
            ))}
          </div>
        )}

        {isAi && msg.stopReason === "max_tokens" && (
          <div className="message-truncated-warning">
            ⚠ Respuesta cortada por el límite de longitud. Pedile a Claude que
            continúe (escribí &quot;continuá&quot;).
          </div>
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

        {pdfs.length > 0 && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              marginTop: 10,
            }}
          >
            {pdfs.map((p, i) => (
              <UploadedPdfCard key={i} url={p.url} name={p.name} />
            ))}
          </div>
        )}

        {isAi && !msg.isPending && !msg.errorMsg && msg.content && (
          <MessageActions content={msg.content} />
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

/**
 * Contenido de un mensaje del asistente: separa texto (markdown) de artifacts
 * (cards). Durante el streaming, si hay un artifact a medio llegar, oculta su
 * XML parcial y muestra un placeholder "generando…".
 */
function AssistantContent({
  content,
  streaming,
}: {
  content: string;
  streaming: boolean;
}) {
  const incompleteThinking = hasIncompleteThinking(content);
  const incompleteArtifact = hasIncompleteArtifact(content);

  // Mientras un <thinking> o un <function_calls> está a medio llegar por
  // streaming, ocultamos todo lo que sigue al tag abierto (no mostramos el
  // XML/razonamiento parcial). El <thinking> ya completo lo borra el parser.
  let visible = content;
  if (incompleteThinking) {
    visible = visible.slice(0, visible.toLowerCase().lastIndexOf("<thinking>"));
  } else if (incompleteArtifact) {
    visible = visible.slice(0, visible.lastIndexOf("<function_calls>"));
  }

  const { segments } = parseMessageWithArtifacts(visible);

  // Artifact incompleto: si todavía streamea → placeholder "generando…"; si el
  // stream ya terminó (cortado por max_tokens) → card parcial con badge, así no
  // queda el placeholder colgado para siempre.
  const partial =
    incompleteArtifact && !streaming ? extractPartialArtifact(content) : null;

  return (
    <>
      {segments.map((seg, i) =>
        seg.kind === "text" ? (
          <MarkdownRenderer key={i} content={seg.content} />
        ) : (
          <ArtifactCard key={i} artifact={seg.artifact} />
        ),
      )}
      {incompleteThinking && streaming && <ThinkingIndicator />}
      {incompleteArtifact && streaming && <ArtifactGeneratingPlaceholder />}
      {partial && <ArtifactCard artifact={partial} incomplete />}
    </>
  );
}

/**
 * Barra al pie de los mensajes de Claude (se revela al hover). "Copiar" copia
 * el contenido limpio: texto + el contenido de cada artifact (sin el XML).
 */
function MessageActions({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const { segments } = parseMessageWithArtifacts(content);
    const clean = segments
      .map((s) =>
        s.kind === "text"
          ? s.content
          : `\n--- ${s.artifact.title} ---\n${s.artifact.content}\n`,
      )
      .join("\n")
      .trim();
    try {
      await navigator.clipboard.writeText(clean);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast({
        title: "ERROR",
        msg: "No pude copiar al portapapeles.",
        color: "var(--danger, #ff5c5c)",
      });
    }
  }

  return (
    <div className="message-actions">
      <button
        type="button"
        className="message-action-btn"
        onClick={handleCopy}
        title="Copiar respuesta"
      >
        {copied ? "✓ copiado" : "⧉ copiar"}
      </button>
    </div>
  );
}
