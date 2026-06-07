"use client";

/**
 * Card visual para los artifacts de Claude (estilo Claude.ai, diseño NQS).
 * Muestra ícono + título + tipo + botones copiar/descargar. El placeholder
 * `ArtifactGeneratingPlaceholder` se usa mientras el artifact todavía llega
 * por streaming.
 */
import { useState } from "react";
import { showToast } from "@/lib/store/toast";
import type { ParsedArtifact } from "@/lib/utils/parse-artifacts";

type ArtifactCardProps = Readonly<{ artifact: ParsedArtifact }>;

export function ArtifactCard({ artifact }: ArtifactCardProps) {
  const [copied, setCopied] = useState(false);

  const extension = getExtensionFromType(artifact.type, artifact.language);
  const displayType = extension.toUpperCase();

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(artifact.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast({
        title: "ERROR",
        msg: "No pude copiar el contenido.",
        color: "var(--danger, #ff5c5c)",
      });
    }
  }

  function handleDownload() {
    const blob = new Blob([artifact.content], {
      type: `${artifact.type};charset=utf-8`,
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = downloadFilename(artifact.title, extension);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="artifact-card">
      <div className="artifact-card-icon">
        <FileIcon />
      </div>
      <div className="artifact-card-info">
        <div className="artifact-card-title">{artifact.title}</div>
        <div className="artifact-card-type">{displayType}</div>
      </div>
      <div className="artifact-card-actions">
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
          onClick={handleDownload}
          title="Descargar archivo"
        >
          ↓ descargar
        </button>
      </div>
    </div>
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
// Helpers
// ============================================================

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
