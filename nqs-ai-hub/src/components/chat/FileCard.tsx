"use client";

/**
 * Card de un archivo REAL generado por Claude (PDF/Word/Excel/PPT) — etapa 3.
 *
 * Distinta de `ArtifactCard` (texto/código, que baja un Blob en memoria):
 * estos archivos viven en Storage privado, así que la descarga pide una signed
 * URL al server (`GET /api/tools/claude/files/[id]`) y baja por esa URL (el
 * nombre correcto lo fija el `Content-Disposition` de la signed URL).
 *
 * Reusa las clases `artifact-card*` para verse igual que la card de artifacts.
 */
import { useState } from "react";
import { showToast } from "@/lib/store/toast";
import type { ChatFile } from "@/lib/hooks/useClaudeChat";

export function FileCard({ file }: Readonly<{ file: ChatFile }>) {
  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    if (downloading) return;
    setDownloading(true);
    try {
      const res = await fetch(`/api/tools/claude/files/${file.id}`, {
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
      // La signed URL ya trae ?download=<name> → baja con el nombre correcto.
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
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="artifact-card">
      <div className="artifact-card-icon">
        <FileTypeIcon />
      </div>
      <div className="artifact-card-info">
        <div className="artifact-card-title">{file.name}</div>
        <div className="artifact-card-type">{labelForMediaType(file)}</div>
      </div>
      <div className="artifact-card-actions">
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
  );
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
