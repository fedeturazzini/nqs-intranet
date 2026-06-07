"use client";

/**
 * Card visual para los artifacts de Claude (estilo Claude.ai, diseño NQS).
 * Muestra ícono + título + tipo + botones Ver / Copiar / Descargar. "Ver" abre
 * un modal con el contenido formateado. El placeholder
 * `ArtifactGeneratingPlaceholder` se usa mientras el artifact llega por
 * streaming.
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { showToast } from "@/lib/store/toast";
import { MarkdownRenderer } from "@/components/chat/MarkdownRenderer";
import type { ParsedArtifact } from "@/lib/utils/parse-artifacts";

type ArtifactCardProps = Readonly<{
  artifact: ParsedArtifact;
  /** Artifact cortado por max_tokens: muestra un badge "incompleto". */
  incomplete?: boolean;
}>;

export function ArtifactCard({
  artifact,
  incomplete = false,
}: ArtifactCardProps) {
  const [copied, setCopied] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const displayType = getExtensionFromType(
    artifact.type,
    artifact.language,
  ).toUpperCase();

  async function handleCopy() {
    const ok = await copyText(artifact.content);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <>
      <div className="artifact-card">
        <div className="artifact-card-icon">
          <FileIcon />
        </div>
        <div className="artifact-card-info">
          <div className="artifact-card-title">{artifact.title}</div>
          <div className="artifact-card-type">
            {displayType}
            {incomplete && (
              <span className="artifact-incomplete-badge">⚠ incompleto</span>
            )}
          </div>
        </div>
        <div className="artifact-card-actions">
          <button
            type="button"
            className="artifact-btn"
            onClick={() => setShowPreview(true)}
            title="Ver contenido"
          >
            ⊙ ver
          </button>
          <button
            type="button"
            className="artifact-btn"
            onClick={handleCopy}
            title="Copiar contenido"
          >
            {copied ? "✓ copiado" : "⧉ copiar"}
          </button>
          <button
            type="button"
            className="artifact-btn"
            onClick={() => downloadArtifact(artifact)}
            title="Descargar archivo"
          >
            ↓ descargar
          </button>
        </div>
      </div>

      {showPreview && (
        <ArtifactPreviewModal
          artifact={artifact}
          onClose={() => setShowPreview(false)}
        />
      )}
    </>
  );
}

/** Placeholder mientras el artifact se está generando (streaming). */
export function ArtifactGeneratingPlaceholder() {
  return (
    <div className="artifact-card artifact-generating">
      <div className="artifact-card-icon">
        <div className="artifact-spinner" />
      </div>
      <div className="artifact-card-info">
        <div className="artifact-card-title">Generando archivo…</div>
        <div className="artifact-card-type">en curso</div>
      </div>
    </div>
  );
}

// ============================================================
// Modal de preview
// ============================================================

type ArtifactPreviewModalProps = Readonly<{
  artifact: ParsedArtifact;
  onClose: () => void;
}>;

function ArtifactPreviewModal({ artifact, onClose }: ArtifactPreviewModalProps) {
  const [copied, setCopied] = useState(false);

  // Escape cierra.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  async function handleCopy() {
    const ok = await copyText(artifact.content);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return createPortal(
    <div className="modal-bd" onClick={onClose}>
      <div
        className="modal artifact-preview-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-hd">
          <div style={{ minWidth: 0 }}>
            <div className="t-eyebrow">↳ ARTIFACT</div>
            <div className="artifact-preview-title">{artifact.title}</div>
          </div>
          <div className="row" style={{ gap: 6, flexShrink: 0 }}>
            <button type="button" className="artifact-btn" onClick={handleCopy}>
              {copied ? "✓ copiado" : "⧉ copiar"}
            </button>
            <button
              type="button"
              className="artifact-btn"
              onClick={() => downloadArtifact(artifact)}
            >
              ↓ descargar
            </button>
            <button type="button" className="btn ghost" onClick={onClose}>
              esc ✕
            </button>
          </div>
        </div>
        <div className="artifact-preview-body">
          {renderArtifactContent(artifact)}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function renderArtifactContent(artifact: ParsedArtifact) {
  if (artifact.type === "text/markdown") {
    return <MarkdownRenderer content={artifact.content} />;
  }
  if (artifact.type === "application/vnd.ant.code") {
    // Reusamos el render de markdown para tener el mismo highlight. Fence de 4
    // backticks por si el código contiene un bloque de 3 adentro.
    const fence = "````";
    return (
      <MarkdownRenderer
        content={`${fence}${artifact.language ?? ""}\n${artifact.content}\n${fence}`}
      />
    );
  }
  // text/plain, text/html y demás → monospace con wrap.
  return <pre className="artifact-text-preview">{artifact.content}</pre>;
}

// ============================================================
// Helpers
// ============================================================

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    showToast({
      title: "ERROR",
      msg: "No pude copiar el contenido.",
      color: "var(--danger, #ff5c5c)",
    });
    return false;
  }
}

function downloadArtifact(artifact: ParsedArtifact) {
  const ext = getExtensionFromType(artifact.type, artifact.language);
  const blob = new Blob([artifact.content], {
    type: `${artifact.type};charset=utf-8`,
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = downloadFilename(artifact.title, ext);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const CODE_LANG_EXT: Record<string, string> = {
  javascript: "js",
  typescript: "ts",
  jsx: "jsx",
  tsx: "tsx",
  python: "py",
  html: "html",
  css: "css",
  json: "json",
  bash: "sh",
  shell: "sh",
  sql: "sql",
  yaml: "yaml",
  markdown: "md",
};

function getExtensionFromType(type: string, language?: string): string {
  if (type === "text/markdown") return "md";
  if (type === "text/html") return "html";
  if (type === "application/vnd.ant.code") {
    return CODE_LANG_EXT[language ?? ""] ?? "txt";
  }
  return "txt";
}

/**
 * Sanitiza el título para un nombre de archivo seguro y evita doble extensión
 * (ej. "doc.md" + ext "md" → "doc.md", no "doc.md.md").
 */
function downloadFilename(title: string, ext: string): string {
  const safe =
    title
      .trim()
      .replace(/[^\w.\- ]+/g, "")
      .replace(/\s+/g, "_")
      .replace(/^[_.]+|[_.]+$/g, "") || "artifact";
  return safe.toLowerCase().endsWith(`.${ext}`) ? safe : `${safe}.${ext}`;
}

function FileIcon() {
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
