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
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PdfViewerModal } from "@/components/chat/PdfViewerModal";
import { showToast } from "@/lib/store/toast";
import type { ChatFile } from "@/lib/hooks/useClaudeChat";

export function FileCard({ file }: Readonly<{ file: ChatFile }>) {
  const [downloading, setDownloading] = useState(false);
  const [preview, setPreview] = useState(false);
  const [textPreview, setTextPreview] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copying, setCopying] = useState(false);
  const isPdf = file.mediaType === "application/pdf";
  // Los archivos de TEXTO (.txt/.md/csv/…) también se pueden ver inline y copiar,
  // no solo descargar — igual que las cards de artifacts de texto.
  const isText = isTextFile(file);

  // Cache del contenido de texto: lo bajamos UNA sola vez (el archivo es
  // inmutable) y lo reusamos para "ver" y "copiar". Sin esto, cada click repetía
  // los dos round-trips (API → signed URL → Storage) = 3-4s cada vez.
  const textCache = useRef<{
    value: string | null;
    promise: Promise<string | null> | null;
  }>({ value: null, promise: null });

  const loadText = useCallback((): Promise<string | null> => {
    const c = textCache.current;
    if (c.value != null) return Promise.resolve(c.value);
    if (c.promise) return c.promise;
    const p = fetchFileText(file.id).then((t) => {
      c.value = t;
      c.promise = null;
      return t;
    });
    c.promise = p;
    return p;
  }, [file.id]);

  // Prefetch al pasar el mouse por la card: cuando el user llega al botón, el
  // texto ya suele estar listo → "ver"/"copiar" se sienten instantáneos.
  const prefetchText = useCallback(() => {
    if (isText) void loadText();
  }, [isText, loadText]);

  async function handleDownload() {
    if (downloading) return;
    setDownloading(true);
    try {
      await triggerDownload(file.id);
    } finally {
      setDownloading(false);
    }
  }

  async function handleCopy() {
    if (copying) return;
    setCopying(true);
    try {
      const text = await loadText();
      if (text == null) {
        showToast({
          title: "ERROR",
          msg: "No pude leer el archivo para copiar.",
          color: "var(--danger, #ff5c5c)",
        });
        return;
      }
      if (await copyToClipboard(text)) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } finally {
      setCopying(false);
    }
  }

  return (
    <>
      <div className="artifact-card" onMouseEnter={prefetchText}>
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
          {isText && (
            <button
              type="button"
              className="artifact-btn"
              onClick={() => setTextPreview(true)}
              title="Ver el contenido sin descargar"
            >
              ⊙ ver
            </button>
          )}
          {isText && (
            <button
              type="button"
              className="artifact-btn"
              onClick={handleCopy}
              disabled={copying}
              title="Copiar el contenido"
            >
              {copied ? "✓ copiado" : "⧉ copiar"}
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

      {textPreview && isText && (
        <GeneratedTextPreview
          file={file}
          loadText={loadText}
          copied={copied}
          copying={copying}
          onCopy={handleCopy}
          onDownload={handleDownload}
          onClose={() => setTextPreview(false)}
        />
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
// Preview de un archivo de TEXTO generado (.txt/.md/…): baja el contenido por la
// signed URL inline (guard de ownership) y lo muestra en un modal, con copiar +
// descargar. Reusa las clases del modal de artifacts para verse igual.
// ============================================================
function GeneratedTextPreview({
  file,
  loadText,
  copied,
  copying,
  onCopy,
  onDownload,
  onClose,
}: Readonly<{
  file: ChatFile;
  loadText: () => Promise<string | null>;
  copied: boolean;
  copying: boolean;
  onCopy: () => void;
  onDownload: () => void;
  onClose: () => void;
}>) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    // Reusa el cache del FileCard: si ya se prefetcheó (hover) o se copió antes,
    // resuelve al instante; si no, baja una vez y queda cacheado.
    loadText().then((text) => {
      if (!alive) return;
      if (text == null) setError(true);
      else setContent(text);
    });
    return () => {
      alive = false;
    };
  }, [loadText]);

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
        className="modal artifact-preview-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-hd">
          <div style={{ minWidth: 0 }}>
            <div className="t-eyebrow">↳ ARCHIVO</div>
            <div className="artifact-preview-title">{file.name}</div>
          </div>
          <div className="row" style={{ gap: 6, flexShrink: 0 }}>
            <button
              type="button"
              className="artifact-btn"
              onClick={onCopy}
              disabled={copying}
            >
              {copied ? "✓ copiado" : "⧉ copiar"}
            </button>
            <button type="button" className="artifact-btn" onClick={onDownload}>
              ↓ descargar
            </button>
            <button type="button" className="btn ghost" onClick={onClose}>
              esc ✕
            </button>
          </div>
        </div>
        <div className="artifact-preview-body">
          {error ? (
            <div className="t-meta dim">No pude cargar el contenido.</div>
          ) : content == null ? (
            <div className="t-meta dim">Cargando…</div>
          ) : (
            <pre className="artifact-text-preview">{content}</pre>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ============================================================
// Helpers
// ============================================================

/** True si el archivo es de texto (se puede ver inline y copiar, no solo bajar). */
function isTextFile(file: ChatFile): boolean {
  if (file.mediaType.toLowerCase().startsWith("text/")) return true;
  return /\.(txt|md|markdown|csv|json|log|xml|ya?ml|html?)$/i.test(file.name);
}

/**
 * Baja el contenido de texto de un archivo generado: pide la signed URL inline
 * (valida ownership) y después el archivo. Devuelve el texto o null si falla.
 */
async function fetchFileText(fileId: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/tools/claude/files/${fileId}?inline=1`, {
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as { url?: string };
    if (!res.ok || !data.url) return null;
    const fileRes = await fetch(data.url, { cache: "no-store" });
    if (!fileRes.ok) return null;
    return await fileRes.text();
  } catch {
    return null;
  }
}

/** Copia texto al portapapeles; muestra toast si el browser lo bloquea. */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    showToast({
      title: "ERROR",
      msg: "No pude copiar al portapapeles.",
      color: "var(--danger, #ff5c5c)",
    });
    return false;
  }
}

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
