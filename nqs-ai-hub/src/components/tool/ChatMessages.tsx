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
import { memo, useEffect, useRef, useState } from "react";
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
  messageToPlainText,
} from "@/lib/utils/parse-artifacts";
import { normalizeAssistantTextForDisplay } from "@/lib/adapters/claude-text-delivery";
import { TOOL_DELIVERY_WARNING } from "@/lib/utils/tool-use-artifacts";
import type { ChatMessage } from "@/lib/hooks/useClaudeChat";
import {
  areMessageBubblePropsEqual,
  type MessageBubbleProps,
} from "@/components/tool/chat-message-memo";
import {
  shouldAttachChatScrollListeners,
  shouldFollowChatScroll,
} from "@/components/tool/chat-scroll-follow";

type ChatMessagesProps = Readonly<{
  messages: ChatMessage[];
  isLoadingConversation: boolean;
  userInitials: string;
  userFirstName: string;
  /** Si viene, scrollea a ese mensaje y lo resalta un momento (admin gasto). */
  focusMessageId?: string | null;
}>;

// Forzamos hora Argentina: sin timeZone explícito, SSR en Vercel = UTC = +3hs
// (mismo patrón que PromptManager.tsx / LogsBoard.tsx / etc.). Acá el render es
// client-side, pero forzarlo igual evita que dependa del reloj/TZ del navegador.
const TIME_FMT = new Intl.DateTimeFormat("es-AR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Argentina/Buenos_Aires",
});

/** "14:32", o null si no hay horario (mensajes viejos sin migrar, por ej.). */
function formatTime(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : TIME_FMT.format(d);
}

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
  isLoadingConversation,
  userInitials,
  userFirstName,
  focusMessageId = null,
}: ChatMessagesProps) {
  const endRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const scrollParentRef = useRef<HTMLElement | null>(null);
  // ¿El user está pegado al fondo? Si scrolleó arriba para leer mensajes
  // anteriores, NO autoscrolleamos (no lo interrumpimos mientras Claude
  // sigue streameando).
  const stickRef = useRef(true);
  const prevLenRef = useRef(messages.length);
  const previousScrollTopRef = useRef(0);
  const previousTouchYRef = useRef<number | null>(null);
  const focusDoneRef = useRef<string | null>(null);
  const shouldAttachScrollListeners = shouldAttachChatScrollListeners(
    messages.length,
  );
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const [jumpPosition, setJumpPosition] = useState<{
    left: number;
    bottom: number;
  } | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  // Detectar scroll manual sobre el contenedor scrolleable (vive en
  // ClaudeView). Si el user se aleja del fondo, dejamos de pegarlo abajo.
  useEffect(() => {
    if (!shouldAttachScrollListeners) return;
    const scroller = getScrollParent(listRef.current);
    if (!scroller) return;
    scrollParentRef.current = scroller;
    previousScrollTopRef.current = scroller.scrollTop;

    const updateJumpPosition = () => {
      const rect = scroller.getBoundingClientRect();
      setJumpPosition({
        left: rect.left + rect.width / 2,
        bottom: Math.max(16, window.innerHeight - rect.bottom + 16),
      });
    };

    const applyFollowState = (manualUp = false) => {
      const distanceFromBottom =
        scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
      const follows =
        scroller.scrollHeight <= scroller.clientHeight + 1
          ? true
          : shouldFollowChatScroll({
              isFollowing: stickRef.current,
              previousScrollTop: previousScrollTopRef.current,
              scrollTop: scroller.scrollTop,
              distanceFromBottom,
              manualUp,
            });
      stickRef.current = follows;
      setShowJumpToBottom(!follows);
      if (!follows) updateJumpPosition();
    };

    const onScroll = () => {
      applyFollowState();
      previousScrollTopRef.current = scroller.scrollTop;
    };
    const onWheel = (event: WheelEvent) => {
      if (event.deltaY < 0) applyFollowState(true);
    };
    const onTouchStart = (event: TouchEvent) => {
      previousTouchYRef.current = event.touches[0]?.clientY ?? null;
    };
    const onTouchMove = (event: TouchEvent) => {
      const currentY = event.touches[0]?.clientY;
      const previousY = previousTouchYRef.current;
      if (currentY != null && previousY != null && currentY > previousY + 1) {
        applyFollowState(true);
      }
      previousTouchYRef.current = currentY ?? null;
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    scroller.addEventListener("wheel", onWheel, { passive: true });
    scroller.addEventListener("touchstart", onTouchStart, { passive: true });
    scroller.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("resize", updateJumpPosition);
    const resizeObserver = new ResizeObserver(updateJumpPosition);
    resizeObserver.observe(scroller);
    onScroll();
    updateJumpPosition();
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      scroller.removeEventListener("wheel", onWheel);
      scroller.removeEventListener("touchstart", onTouchStart);
      scroller.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("resize", updateJumpPosition);
      resizeObserver.disconnect();
      if (scrollParentRef.current === scroller) scrollParentRef.current = null;
    };
  }, [shouldAttachScrollListeners]);

  // Autoscroll: instantáneo en cada chunk de streaming, suave al entrar un
  // mensaje nuevo. Si el user acaba de mandar un mensaje, forzamos ir al fondo.
  // Con focusMessageId pendiente, no pegamos al fondo (el focus effect scrollea).
  useEffect(() => {
    const grew = messages.length > prevLenRef.current;
    prevLenRef.current = messages.length;
    const last = messages[messages.length - 1];
    if (grew && last?.role === "user") {
      stickRef.current = true;
      setShowJumpToBottom(false);
    }
    const awaitingFocus =
      focusMessageId != null && focusDoneRef.current !== focusMessageId;
    if (awaitingFocus) return;
    if (stickRef.current) {
      endRef.current?.scrollIntoView({
        behavior: grew ? "smooth" : "auto",
        block: "end",
      });
    }
  }, [messages, focusMessageId]);

  // Deep-link: scroll al mensaje + highlight temporal (~2.5s).
  useEffect(() => {
    if (!focusMessageId || isLoadingConversation || messages.length === 0) {
      return;
    }
    if (focusDoneRef.current === focusMessageId) return;
    const exists = messages.some((m) => m.id === focusMessageId);
    if (!exists) {
      focusDoneRef.current = focusMessageId;
      return;
    }

    stickRef.current = false;
    setShowJumpToBottom(true);

    // Esperar un frame para que el DOM pinte los id=chat-msg-…
    const t0 = window.setTimeout(() => {
      const el = document.getElementById(`chat-msg-${focusMessageId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        setHighlightedId(focusMessageId);
        focusDoneRef.current = focusMessageId;
      }
    }, 50);

    const t1 = window.setTimeout(() => {
      setHighlightedId((cur) => (cur === focusMessageId ? null : cur));
    }, 2800);

    return () => {
      window.clearTimeout(t0);
      window.clearTimeout(t1);
    };
  }, [focusMessageId, isLoadingConversation, messages]);

  const jumpToBottom = () => {
    stickRef.current = true;
    setShowJumpToBottom(false);
    const scroller = scrollParentRef.current;
    if (scroller) previousScrollTopRef.current = scroller.scrollTop;
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  };

  if (messages.length === 0 && isLoadingConversation) {
    return <ConversationSkeleton />;
  }

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
          highlighted={highlightedId === m.id}
        />
      ))}
      <div ref={endRef} />
      {showJumpToBottom && jumpPosition && (
        <button
          type="button"
          className="btn secondary sm"
          aria-label="Ir al final de la conversación"
          onClick={jumpToBottom}
          style={{
            position: "fixed",
            left: jumpPosition.left,
            bottom: jumpPosition.bottom,
            transform: "translateX(-50%)",
            zIndex: 20,
            boxShadow: "0 8px 24px rgba(0, 0, 0, 0.24)",
          }}
        >
          ↓ IR AL FINAL
        </button>
      )}
    </div>
  );
}

function ConversationSkeleton() {
  return (
    <div
      className="claude-mock"
      role="status"
      aria-label="Cargando conversación"
      style={{ maxWidth: "none", margin: 0, gap: 12 }}
    >
      {[72, 46, 64].map((width, index) => (
        <div
          key={width}
          className={`chat-msg ${index === 1 ? "user" : "ai"}`}
          aria-hidden="true"
        >
          <div
            className={`av pulse ${index === 1 ? "" : "ai"}`}
            style={{ opacity: 0.28 }}
          />
          <div className="body" style={{ paddingTop: 2 }}>
            <div
              className="pulse"
              style={{
                width: index === 1 ? 90 : 64,
                height: 8,
                borderRadius: 4,
                background: "var(--line-strong)",
                marginBottom: 12,
                opacity: 0.45,
              }}
            />
            <div
              className="pulse"
              style={{
                width: `${width}%`,
                height: 12,
                borderRadius: 5,
                background: "var(--line-strong)",
                opacity: 0.32,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

const MessageBubble = memo(function MessageBubble({
  msg,
  userInitials,
  userFirstName,
  highlighted = false,
}: MessageBubbleProps) {
  const isAi = msg.role === "assistant";
  const whoLabel = isAi ? "CLAUDE" : userFirstName.toUpperCase();
  const avatarText = isAi ? "C" : userInitials;
  const cssClass = `chat-msg ${isAi ? "ai" : "user"}`;
  const timeLabel = formatTime(msg.createdAt);

  // FEEDBACK NQS v2.0 (Part 6): visor de imágenes en grande.
  const images = msg.imagePreviews ?? [];
  // PDFs adjuntos del user → cards (no <img>).
  const pdfs = msg.pdfAttachments ?? [];
  const [lightbox, setLightbox] = useState<{ open: boolean; index: number }>({
    open: false,
    index: 0,
  });

  return (
    <div
      id={`chat-msg-${msg.id}`}
      className={cssClass}
      style={
        highlighted
          ? {
              outline: "2px solid var(--accent)",
              outlineOffset: 4,
              borderRadius: 8,
              background: "color-mix(in srgb, var(--accent) 14%, transparent)",
              transition: "outline-color 0.4s ease, background 0.4s ease",
            }
          : {
              outline: "2px solid transparent",
              outlineOffset: 4,
              borderRadius: 8,
              transition: "outline-color 0.6s ease, background 0.6s ease",
            }
      }
    >
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
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {isAi && msg.tokensInput != null && msg.tokensOutput != null && (
              <span
                className="t-meta dim"
                style={{ fontSize: 9, letterSpacing: "0.08em" }}
              >
                in {msg.tokensInput} · out {msg.tokensOutput}
              </span>
            )}
            {timeLabel && (
              <span
                className="t-meta dim"
                style={{ fontSize: 9, letterSpacing: "0.08em" }}
              >
                {timeLabel}
              </span>
            )}
          </div>
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

        {!isAi && msg.uploadingAttachments && (
          <div
            className="t-meta dim pulse"
            style={{ marginTop: 8, fontSize: 10 }}
          >
            ↑ subiendo adjuntos…
          </div>
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

        {/* Se esperaba un archivo y el user no lo va a ver. Cubre dos casos con
            el mismo aviso (la acción es la misma: pedirlo de nuevo): se generó y
            no se pudo adjuntar, o el sandbox corrió y no salió ningún archivo.
            Este aviso es el que evita que un turno sin archivo quede MUDO — el
            silencio era lo que antes se rellenaba con el archivo de otro mensaje
            (ver archivo-equivocado-audit.md). */}
        {isAi &&
          msg.filesPartialError &&
          !msg.toolDeliveryFailed &&
          (!msg.files || msg.files.length === 0) && (
            <div className="message-truncated-warning">
              ⚠ Claude intentó generar un archivo y no llegó ninguno. Pedile que
              lo genere de nuevo.
            </div>
          )}

        {isAi &&
          msg.toolDeliveryFailed &&
          !msg.content.includes(TOOL_DELIVERY_WARNING) &&
          (!msg.files || msg.files.length === 0) && (
            <div className="message-truncated-warning">
              ⚠ Claude usó un formato de entrega que no pudimos procesar (
              {msg.toolDeliveryFailed.toolName}). No se descartó un archivo de
              otro turno: pedile que vuelva a entregar el contenido.
            </div>
          )}

        {isAi &&
          msg.textFileFallback &&
          msg.content &&
          (!msg.files || msg.files.length === 0) && (
            <div className="message-truncated-warning">
              No llegó una card descargable. Podés bajar exactamente el texto
              recibido, sin ejecutar un segundo intento.
              <div style={{ marginTop: 8 }}>
                <button
                  type="button"
                  className="message-action-btn"
                  onClick={() =>
                    downloadTextFallback(
                      msg.content,
                      msg.textFileFallback?.filename ?? "respuesta-claude.txt",
                    )
                  }
                >
                  ↓ descargar como {msg.textFileFallback.filename}
                </button>
              </div>
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
}, areMessageBubblePropsEqual);

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
const AssistantContent = memo(function AssistantContent({
  content,
  streaming,
}: {
  content: string;
  streaming: boolean;
}) {
  // Repair client-side: mensajes aplanados (`create text/plain nombre.txt …`)
  // o viejos en DB sin pasar por el repair del server igual se ven como card.
  const normalized = normalizeAssistantTextForDisplay(content);
  const incompleteThinking = hasIncompleteThinking(normalized);
  const incompleteArtifact = hasIncompleteArtifact(normalized);

  // Mientras un <thinking> o un <function_calls> está a medio llegar por
  // streaming, ocultamos todo lo que sigue al tag abierto (no mostramos el
  // XML/razonamiento parcial). El <thinking> ya completo lo borra el parser.
  let visible = normalized;
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
    incompleteArtifact && !streaming
      ? extractPartialArtifact(normalized)
      : null;

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
});

/**
 * Barra al pie de los mensajes de Claude (se revela al hover). "Copiar" copia
 * el contenido limpio: texto + el contenido de cada artifact (sin el XML).
 */
function MessageActions({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const clean = messageToPlainText(normalizeAssistantTextForDisplay(content));
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

function downloadTextFallback(content: string, filename: string) {
  const text = messageToPlainText(normalizeAssistantTextForDisplay(content));
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
