"use client";

/**
 * Card de un archivo REAL generado por Claude (PDF/Word/Excel/PPT) — etapa 3+4.
 *
 * Distinta de `ArtifactCard` (texto/código, que baja un Blob en memoria):
 * estos archivos viven en Storage privado, así que tanto la descarga como la
 * vista previa piden una signed URL al server (`GET /api/tools/claude/files/[id]`,
 * con `?inline=1` para preview). El endpoint valida ownership.
 *
 * - "Ver" (solo PDF): abre un modal con el PDF embebido (render nativo del
 *   navegador vía <iframe>). Word/Excel no tienen preview nativo → solo descarga.
 * - "Descargar": baja el archivo con su nombre real (Content-Disposition).
 *
 * Reusa las clases `artifact-card*` para verse igual que la card de artifacts.
 */
import { useEffect, useState } from "react";
import { PdfViewerModal } from "@/components/chat/PdfViewerModal";
import { showToast } from "@/lib/store/toast";
import type { ChatFile } from "@/lib/hooks/useClaudeChat";

export function FileCard({ file }: Readonly<{ file: ChatFile }>) {
  const [downloading, setDownloading] = useState(false);
  const [preview, setPreview] = useState(false);
  const isPdf = file.mediaType === "application/pdf";

  async function handleDownload() {
    if (downloading) return;
    setDownloading(true);
    try {
      await triggerDownload(file.id);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <>
      <div className="artifact-card">
        <div className="artifact-card-icon">
          <FileTypeIcon />
        </div>
        <div className="artifact-card-info">
          <div className="artifact-card-title">{file.name}</div>
          <div className="artifact-card-type">{labelForMediaType(file)}</div>
        </div>
        <div className="artifact-card-actions">
          {isPdf && (
            <button
              type="button"
              className="artifact-btn"
              onClick={() => setPreview(true)}
              title="Ver el PDF sin descargar"
            >
              ⊙ ver
            </button>
          )}
          <button
            type="button"
            className="artifact-btn"
            onClick={handleDownload}
            disabled={downloading}
            title="Descargar archivo"
          >
            {downloading ? "…" : "↓ descargar"}
          </button>
        </div>
      </div>

      {preview && isPdf && (
        <GeneratedPdfPreview file={file} onClose={() => setPreview(false)} />
      )}
    </>
  );
}

// ============================================================
// Preview de un PDF GENERADO: pide la signed URL inline y la pasa al visor
// compartido (PdfViewerModal). Los PDFs generados viven en `claude_files`, así
// que la URL sale del endpoint con guard de ownership.
// ============================================================
function GeneratedPdfPreview({
  file,
  onClose,
}: Readonly<{ file: ChatFile; onClose: () => void }>) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/tools/claude/files/${file.id}?inline=1`, {
          cache: "no-store",
        });
        const data = (await res.json().catch(() => ({}))) as { url?: string };
        if (!alive) return;
        if (!res.ok || !data.url) {
          setError(true);
          return;
        }
        setUrl(data.url);
      } catch {
        if (alive) setError(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [file.id]);

  return (
    <PdfViewerModal
      url={url}
      name={file.name}
      error={error}
      onClose={onClose}
      onDownload={() => triggerDownload(file.id)}
    />
  );
}

// ============================================================
// Helpers
// ============================================================

/**
 * Pide la signed URL de DESCARGA al endpoint (valida ownership) y dispara la
 * bajada. El nombre correcto lo fija el `Content-Disposition` de la signed URL.
 */
async function triggerDownload(fileId: string): Promise<void> {
  try {
    const res = await fetch(`/api/tools/claude/files/${fileId}`, {
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as {
      url?: string;
      error?: string;
    };
    if (!res.ok || !data.url) {
      showToast({
        title: "ERROR",
        msg:
          res.status === 403
            ? "No tenés acceso a este archivo."
            : "No pude generar la descarga.",
        color: "var(--danger, #ff5c5c)",
      });
      return;
    }
    const a = document.createElement("a");
    a.href = data.url;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch {
    showToast({
      title: "ERROR",
      msg: "Error de red al descargar.",
      color: "var(--danger, #ff5c5c)",
    });
  }
}

/** Etiqueta legible según el mime (fallback: extensión del nombre). */
function labelForMediaType(file: ChatFile): string {
  const m = file.mediaType.toLowerCase();
  if (m === "application/pdf") return "PDF";
  if (m.includes("wordprocessingml") || m === "application/msword")
    return "WORD";
  if (m.includes("spreadsheetml") || m === "application/vnd.ms-excel")
    return "EXCEL";
  if (m.includes("presentationml") || m === "application/vnd.ms-powerpoint")
    return "POWERPOINT";
  const ext = file.name.includes(".")
    ? file.name.split(".").pop()?.toUpperCase()
    : undefined;
  return ext ?? "ARCHIVO";
}

function FileTypeIcon() {
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
