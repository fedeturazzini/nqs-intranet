"use client";

/**
 * Card de un PDF que SUBIÓ el usuario (adjunto de un mensaje). Distinta de
 * `FileCard` (archivos que genera Claude, que viven en `claude_files` y bajan
 * por un endpoint con ownership): acá la signed URL ya viene resuelta (del
 * optimistic `URL.createObjectURL` o del re-firmado histórico), así que el
 * botón "ver" abre el visor compartido directo. Reusa las clases `artifact-card*`.
 */
import { useState } from "react";
import { PdfViewerModal } from "@/components/chat/PdfViewerModal";

export function UploadedPdfCard({
  url,
  name,
}: Readonly<{ url: string; name: string }>) {
  const [preview, setPreview] = useState(false);

  return (
    <>
      <div className="artifact-card">
        <div className="artifact-card-icon">
          <PdfIcon />
        </div>
        <div className="artifact-card-info">
          <div className="artifact-card-title">{name}</div>
          <div className="artifact-card-type">PDF</div>
        </div>
        <div className="artifact-card-actions">
          <button
            type="button"
            className="artifact-btn"
            onClick={() => setPreview(true)}
            title="Ver el PDF"
          >
            ⊙ ver
          </button>
        </div>
      </div>

      {preview && (
        <PdfViewerModal
          url={url}
          name={name}
          onClose={() => setPreview(false)}
        />
      )}
    </>
  );
}

function PdfIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="9" y1="13" x2="15" y2="13" />
      <line x1="9" y1="17" x2="15" y2="17" />
    </svg>
  );
}
