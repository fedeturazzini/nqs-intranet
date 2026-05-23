"use client";

/**
 * Input del chat de Claude: textarea autoresize + drop de imágenes +
 * preview de thumbnails + botón enviar.
 *
 * Atajos:
 *   - Enter        → enviar
 *   - Shift+Enter  → nueva línea
 *
 * Imágenes:
 *   - Drag-and-drop sobre cualquier parte del componente.
 *   - Click en 📎 abre el file picker.
 *   - Validación local antes de subir (tipo + tamaño).
 *   - Max 5 por mensaje (= MAX_IMAGES_PER_MESSAGE).
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import { showToast } from "@/lib/store/toast";
import {
  ACCEPTED_MEDIA_TYPES,
  MAX_IMAGES_PER_MESSAGE,
  fileToBase64,
  fileToPreviewUrl,
  validateImage,
  type ImagePayload,
} from "@/lib/utils/images";

const TEXTAREA_MIN_ROWS = 1;
const TEXTAREA_MAX_ROWS = 8;
const LINE_HEIGHT_PX = 20;

type Attachment = {
  /** ID local para keys del React. */
  id: string;
  file: File;
  previewUrl: string;
};

type ChatInputProps = Readonly<{
  isSending: boolean;
  onSend: (prompt: string, images: ImagePayload[], previews: string[]) => void;
}>;

export function ChatInput({ isSending, onSend }: ChatInputProps) {
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Foco automático al montar.
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Autoresize.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const lines = Math.min(
      Math.max(
        Math.ceil(el.scrollHeight / LINE_HEIGHT_PX),
        TEXTAREA_MIN_ROWS,
      ),
      TEXTAREA_MAX_ROWS,
    );
    el.style.height = `${lines * LINE_HEIGHT_PX + 12}px`;
  }, [text]);

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      const arr = Array.from(files);
      if (attachments.length + arr.length > MAX_IMAGES_PER_MESSAGE) {
        showToast({
          title: "DEMASIADAS IMÁGENES",
          msg: `Máximo ${MAX_IMAGES_PER_MESSAGE} por mensaje.`,
          color: "var(--warn, #FFB800)",
        });
        return;
      }
      const newAtts: Attachment[] = [];
      for (const file of arr) {
        const validation = validateImage(file);
        if (!validation.ok) {
          showToast({
            title: "IMAGEN INVÁLIDA",
            msg: validation.error,
            color: "var(--danger, #ff5c5c)",
          });
          continue;
        }
        try {
          const previewUrl = await fileToPreviewUrl(file);
          newAtts.push({
            id: crypto.randomUUID(),
            file,
            previewUrl,
          });
        } catch {
          showToast({
            title: "ERROR",
            msg: `No pude leer ${file.name}.`,
            color: "var(--danger, #ff5c5c)",
          });
        }
      }
      if (newAtts.length > 0) {
        setAttachments((prev) => [...prev, ...newAtts]);
      }
    },
    [attachments.length],
  );

  function removeAttachment(id: string) {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }

  async function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;

    let images: ImagePayload[] = [];
    try {
      images = await Promise.all(
        attachments.map((a) => fileToBase64(a.file)),
      );
    } catch (err) {
      showToast({
        title: "ERROR",
        msg: err instanceof Error ? err.message : "no pude leer las imágenes",
        color: "var(--danger, #ff5c5c)",
      });
      return;
    }

    const previews = attachments.map((a) => a.previewUrl);
    onSend(trimmed, images, previews);
    setText("");
    setAttachments([]);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void handleSend();
    }
  }

  function onFileInputChange(e: ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (files && files.length > 0) {
      void addFiles(files);
    }
    // Reset para poder volver a elegir el mismo archivo.
    e.target.value = "";
  }

  function onDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (!isDragging) setIsDragging(true);
    e.dataTransfer.dropEffect = "copy";
  }
  function onDragLeave(e: DragEvent<HTMLDivElement>) {
    // dragleave dispara al pasar por children; chequeamos relatedTarget.
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  }
  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      void addFiles(files);
    }
  }

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      style={{
        position: "relative",
        marginTop: 12,
        border: isDragging
          ? "2px dashed var(--accent)"
          : "2px dashed transparent",
        borderRadius: 12,
        padding: 2,
        transition: "border-color 0.15s",
      }}
    >
      {attachments.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            padding: "8px 10px 0",
          }}
        >
          {attachments.map((a) => (
            <div
              key={a.id}
              style={{
                position: "relative",
                width: 60,
                height: 60,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={a.previewUrl}
                alt={a.file.name}
                style={{
                  width: 60,
                  height: 60,
                  objectFit: "cover",
                  borderRadius: 8,
                  border: "1px solid var(--line-strong)",
                }}
              />
              <button
                type="button"
                onClick={() => removeAttachment(a.id)}
                aria-label={`quitar ${a.file.name}`}
                style={{
                  position: "absolute",
                  top: -6,
                  right: -6,
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  border: "1px solid var(--line-strong)",
                  background: "var(--bg-elev)",
                  color: "var(--fg)",
                  cursor: "pointer",
                  fontSize: 11,
                  lineHeight: 1,
                  padding: 0,
                  display: "grid",
                  placeItems: "center",
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="chat-input" style={{ alignItems: "flex-end" }}>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          title="adjuntar imagen"
          aria-label="adjuntar imagen"
          style={{
            background: "transparent",
            border: 0,
            color: "var(--fg-mute)",
            cursor: "pointer",
            fontSize: 16,
            padding: 4,
          }}
        >
          📎
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPTED_MEDIA_TYPES.join(",")}
          onChange={onFileInputChange}
          style={{ display: "none" }}
        />
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={
            isDragging
              ? "soltá las imágenes acá…"
              : "Escribí tu mensaje… (Enter para enviar, Shift+Enter para nueva línea)"
          }
          disabled={isSending}
          rows={1}
          style={{
            flex: 1,
            background: "transparent",
            border: 0,
            color: "inherit",
            outline: 0,
            fontFamily: "var(--sans)",
            fontSize: 13,
            resize: "none",
            lineHeight: `${LINE_HEIGHT_PX}px`,
            padding: "4px 0",
          }}
        />
        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={isSending || !text.trim()}
          aria-label="enviar"
          className="btn sm"
          style={{
            opacity: isSending || !text.trim() ? 0.5 : 1,
            cursor: isSending || !text.trim() ? "not-allowed" : "pointer",
          }}
        >
          {isSending ? "…" : "→"}
        </button>
      </div>
    </div>
  );
}
