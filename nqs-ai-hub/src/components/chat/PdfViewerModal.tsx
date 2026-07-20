"use client";

/**
 * Visor de PDF embebido (modal con <iframe>, render nativo del navegador).
 * Presentacional: recibe la URL ya resuelta — no sabe de dónde viene.
 *
 * Lo reusan:
 *   - `FileCard` (archivos que GENERA Claude): pide la signed URL inline por
 *     `/api/tools/claude/files/[id]?inline=1` y la pasa acá.
 *   - `UploadedPdfCard` (PDFs que SUBE el user): pasa la signed URL de Storage
 *     directo (ya renderiza inline, sin `?inline`).
 *
 * `url === null && !error` → estado "cargando". `onDownload` opcional: si viene,
 * muestra el botón de descarga.
 */
import { useEffect } from "react";
import { createPortal } from "react-dom";

type PdfViewerModalProps = Readonly<{
  url: string | null;
  name: string;
  error?: boolean;
  onClose: () => void;
  onDownload?: () => void;
}>;

export function PdfViewerModal({
  url,
  name,
  error = false,
  onClose,
  onDownload,
}: PdfViewerModalProps) {
  // Escape cierra.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="modal-bd" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(940px, 94vw)",
          maxWidth: "94vw",
          height: "88vh",
          display: "flex",
          flexDirection: "column",
          padding: 0,
          overflow: "hidden",
        }}
      >
        <div className="modal-hd" style={{ padding: "12px 16px" }}>
          <div style={{ minWidth: 0 }}>
            <div className="t-eyebrow">↳ VISTA PREVIA</div>
            <div
              className="artifact-preview-title"
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {name}
            </div>
          </div>
          <div className="row" style={{ gap: 6, flexShrink: 0 }}>
            {onDownload && (
              <button type="button" className="artifact-btn" onClick={onDownload}>
                ↓ descargar
              </button>
            )}
            <button type="button" className="btn ghost" onClick={onClose}>
              esc ✕
            </button>
          </div>
        </div>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            background: "var(--bg, #f4f1ea)",
            display: "flex",
          }}
        >
          {error ? (
            <div
              className="t-meta dim"
              style={{ margin: "auto", padding: 24, textAlign: "center" }}
            >
              No pude cargar la vista previa. Descargá el archivo para verlo.
            </div>
          ) : url ? (
            <iframe
              src={url}
              title={name}
              style={{ width: "100%", height: "100%", border: "none" }}
            />
          ) : (
            <div
              className="t-meta dim pulse"
              style={{ margin: "auto", padding: 24, textAlign: "center" }}
            >
              Cargando vista previa…
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
