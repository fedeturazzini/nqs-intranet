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
 *   - Max 10 adjuntos por mensaje (= MAX_ATTACHMENTS). Imágenes o PDF.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import { showToast } from "@/lib/store/toast";
import {
  ACCEPTED_MEDIA_TYPES,
  MAX_ATTACHMENTS,
  fileToPreviewUrl,
  isPdfFile,
  uploadImages,
  validateAttachment,
} from "@/lib/utils/images";
import { compressImageIfNeeded } from "@/lib/utils/image-compression";
import type {
  PdfAttachment,
  PreparedAttachmentTurn,
} from "@/lib/hooks/useClaudeChat";

const TEXTAREA_MIN_ROWS = 1;
const TEXTAREA_MAX_ROWS = 8;
const LINE_HEIGHT_PX = 20;

type Attachment = {
  /** ID local para keys del React. */
  id: string;
  file: File;
  kind: "image" | "pdf";
  /** Imagen: data URL para el thumbnail. PDF: object URL para el iframe. */
  previewUrl: string;
};

type ChatInputProps = Readonly<{
  isSending: boolean;
  /** Conversación actual — para armar el path de Storage. null = nueva. */
  conversationId: string | null;
  /** `imagePaths` = paths de Storage ya subidos (imágenes + PDFs, mixtos);
   *  `previews` = data URLs de las imágenes; `pdfPreviews` = {url,name} de los
   *  PDFs — todo para el render optimista. */
  onSend: (
    prompt: string,
    imagePaths: string[],
    previews: string[],
    pdfPreviews: PdfAttachment[],
    preparedTurn?: PreparedAttachmentTurn,
  ) => void;
  onPrepareAttachments: (
    prompt: string,
    previews: string[],
    pdfPreviews: PdfAttachment[],
  ) => PreparedAttachmentTurn;
  onRollbackAttachments: (turn: PreparedAttachmentTurn) => void;
  /** Aborta la respuesta en curso (botón "Detener" mientras streamea). */
  onStop: () => void;
}>;

export function ChatInput({
  isSending,
  conversationId,
  onSend,
  onPrepareAttachments,
  onRollbackAttachments,
  onStop,
}: ChatInputProps) {
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [compressing, setCompressing] = useState(false);
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
      if (attachments.length + arr.length > MAX_ATTACHMENTS) {
        showToast({
          title: "DEMASIADOS ADJUNTOS",
          msg: `Máximo ${MAX_ATTACHMENTS} por mensaje.`,
          color: "var(--warn, #FFB800)",
        });
        return;
      }
      // Estado de "procesando" (compresión de imágenes en Web Worker). Los PDFs
      // no se comprimen — se suben tal cual.
      setCompressing(true);
      try {
        const newAtts: Attachment[] = [];
        for (const file of arr) {
          const validation = validateAttachment(file);
          if (!validation.ok) {
            showToast({
              title: "ADJUNTO INVÁLIDO",
              msg: validation.error,
              color: "var(--danger, #ff5c5c)",
            });
            continue;
          }
          try {
            if (isPdfFile(file)) {
              // PDF: sin compresión. Object URL para la preview/iframe.
              newAtts.push({
                id: crypto.randomUUID(),
                file,
                kind: "pdf",
                previewUrl: URL.createObjectURL(file),
              });
            } else {
              // Imagen: se comprime/reescala a ~4MB / ≤1568px antes de subir.
              const { file: processed, compressed, originalSizeMB, finalSizeMB } =
                await compressImageIfNeeded(file);
              if (compressed) {
                console.log(
                  `[img] ${file.name}: ${originalSizeMB.toFixed(1)}MB → ${finalSizeMB.toFixed(1)}MB`,
                );
              }
              const previewUrl = await fileToPreviewUrl(processed);
              newAtts.push({
                id: crypto.randomUUID(),
                file: processed,
                kind: "image",
                previewUrl,
              });
            }
          } catch (err) {
            // Mostramos el motivo REAL (ej. "no pude procesar la imagen (12.4MB).
            // Probá con una más liviana.") en vez de un genérico. Además `file.name`
            // viene vacío en las imágenes pegadas del portapapeles, así que el
            // fallback no puede depender solo de él.
            showToast({
              title: "ERROR",
              msg:
                err instanceof Error && err.message
                  ? err.message
                  : `No pude procesar ${file.name || "la imagen"}.`,
              color: "var(--danger, #ff5c5c)",
            });
          }
        }
        if (newAtts.length > 0) {
          setAttachments((prev) => [...prev, ...newAtts]);
        }
      } finally {
        setCompressing(false);
      }
    },
    [attachments.length],
  );

  function removeAttachment(id: string) {
    setAttachments((prev) => {
      const gone = prev.find((a) => a.id === id);
      // Liberar el object URL del PDF (las imágenes usan data URL, no hace falta).
      if (gone?.kind === "pdf") URL.revokeObjectURL(gone.previewUrl);
      return prev.filter((a) => a.id !== id);
    });
  }

  async function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || isSending || uploading || compressing) return;

    // Subimos los adjuntos a Storage ANTES de mandar el mensaje. El execute
    // recibe los paths (mixtos: imágenes + PDFs), no los bytes (esquiva el
    // límite de body de Vercel). Si la subida falla, no enviamos.
    let imagePaths: string[] = [];
    const imagePreviews = attachments
      .filter((a) => a.kind === "image")
      .map((a) => a.previewUrl);
    const pdfPreviews: PdfAttachment[] = attachments
      .filter((a) => a.kind === "pdf")
      .map((a) => ({ url: a.previewUrl, name: a.file.name }));
    let preparedTurn: PreparedAttachmentTurn | undefined;
    if (attachments.length > 0) {
      // Antes del primer await: el turno ya aparece en el hilo con sus previews.
      preparedTurn = onPrepareAttachments(
        trimmed,
        imagePreviews,
        pdfPreviews,
      );
      setUploading(true);
      try {
        imagePaths = await uploadImages(
          attachments.map((a) => a.file),
          conversationId,
        );
      } catch (err) {
        onRollbackAttachments(preparedTurn);
        showToast({
          title: "ERROR AL SUBIR",
          msg: err instanceof Error ? err.message : "no pude subir los adjuntos",
          color: "var(--danger, #ff5c5c)",
        });
        setUploading(false);
        return;
      }
      setUploading(false);
    }

    onSend(
      trimmed,
      imagePaths,
      imagePreviews,
      pdfPreviews,
      preparedTurn,
    );
    setText("");
    setAttachments([]);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void handleSend();
    }
  }

  // Pegar (Ctrl+V / Cmd+V): si el portapapeles trae archivos (una imagen copiada,
  // una captura), los adjuntamos por el MISMO camino que el drag-drop —addFiles
  // valida, comprime y capea dimensiones. Si es texto, no interceptamos → pega normal.
  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const files = e.clipboardData?.files;
    if (files && files.length > 0) {
      e.preventDefault();
      void addFiles(files);
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
      {attachments.length > 0 && uploading && (
        <div
          className="t-meta dim"
          style={{
            padding: "8px 10px 0",
            fontSize: 10,
            fontFamily: "var(--mono)",
          }}
        >
          ↑ subiendo {attachments.length}{" "}
          {attachments.length === 1 ? "adjunto" : "adjuntos"}…
        </div>
      )}

      {attachments.length > 0 && !uploading && (
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
                height: 60,
                width: a.kind === "pdf" ? "auto" : 60,
              }}
            >
              {a.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
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
              ) : (
                // Chip de PDF (no hay miniatura de imagen).
                <div
                  title={a.file.name}
                  style={{
                    height: 60,
                    maxWidth: 180,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "0 12px",
                    borderRadius: 8,
                    border: "1px solid var(--line-strong)",
                    background: "var(--bg-elev)",
                  }}
                >
                  <span style={{ fontSize: 18, flexShrink: 0 }}>📄</span>
                  <span
                    style={{
                      fontSize: 12,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {a.file.name}
                  </span>
                </div>
              )}
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

      {compressing && (
        <div
          className="t-meta dim"
          style={{
            padding: "6px 10px 0",
            fontSize: 11,
            fontFamily: "var(--mono)",
          }}
        >
          ⏳ procesando adjunto…
        </div>
      )}

      <div className="chat-input" style={{ alignItems: "flex-end" }}>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          // Imágenes (hasta 30MB, se comprimen) o PDF (hasta 32MB).
          title="Adjuntar imagen o PDF · Imágenes hasta 30MB (se comprimen); PDF hasta 32MB. Claude lee el PDF."
          aria-label="Adjuntar imagen o PDF. Imágenes hasta 30MB (se comprimen automáticamente); PDF hasta 32MB."
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
          onPaste={onPaste}
          placeholder={
            isDragging
              ? "soltá los archivos acá…"
              : "Escribí tu mensaje… (Enter para enviar, Shift+Enter para nueva línea)"
          }
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
        {isSending ? (
          // Mientras Claude responde, el botón pasa a "Detener" (aborta el
          // stream y conserva el texto que llegó).
          <button
            type="button"
            onClick={onStop}
            aria-label="detener generación"
            title="Detener la respuesta de Claude"
            className="btn sm danger"
          >
            ■ detener
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={uploading || compressing || !text.trim()}
            aria-label="enviar"
            className="btn sm"
            style={{
              opacity: uploading || compressing || !text.trim() ? 0.5 : 1,
              cursor:
                uploading || compressing || !text.trim()
                  ? "not-allowed"
                  : "pointer",
            }}
          >
            {compressing ? "⏳" : uploading ? "↑" : "→"}
          </button>
        )}
      </div>
    </div>
  );
}
