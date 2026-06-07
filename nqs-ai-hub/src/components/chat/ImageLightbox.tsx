"use client";

/**
 * Visor de imágenes (lightbox) del chat de Claude.
 *
 * FEEDBACK NQS v2.0 (Part 6): Chule pidió poder ver las imágenes en
 * grande, descargarlas y copiarlas.
 *
 * Features:
 *   - Modal centrado, imagen en grande (máx 90vh × 90vw), backdrop oscuro.
 *   - Cerrar: botón X, click fuera de la imagen, tecla Escape.
 *   - Descargar: fetch → blob → <a download> (sirve para data URLs y para
 *     las signed URLs de Supabase Storage).
 *   - Copiar: Clipboard API con ClipboardItem (convierte a PNG vía canvas
 *     para máxima compatibilidad). Fallback: copia la URL al portapapeles.
 *   - Navegación entre varias imágenes: flechas ‹ ›, contador "2 / 5" y
 *     teclas ←/→.
 *
 * Las `images` son URLs (data URLs locales del render optimista, o signed
 * download URLs para el historial).
 */
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { showToast } from "@/lib/store/toast";

type ImageLightboxProps = Readonly<{
  open: boolean;
  images: string[];
  initialIndex?: number;
  onClose: () => void;
}>;

export function ImageLightbox({
  open,
  images,
  initialIndex = 0,
  onClose,
}: ImageLightboxProps) {
  const [current, setCurrent] = useState(initialIndex);
  const [busy, setBusy] = useState<"download" | "copy" | null>(null);

  const count = images.length;
  const hasMultiple = count > 1;

  // Sincronizar el índice al abrir / cambiar de imagen inicial.
  useEffect(() => {
    if (open) setCurrent(Math.min(initialIndex, Math.max(count - 1, 0)));
  }, [open, initialIndex, count]);

  const goPrev = useCallback(() => {
    setCurrent((c) => (c - 1 + count) % count);
  }, [count]);
  const goNext = useCallback(() => {
    setCurrent((c) => (c + 1) % count);
  }, [count]);

  // Teclado: Escape cierra, flechas navegan.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && count > 1) goPrev();
      else if (e.key === "ArrowRight" && count > 1) goNext();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, goPrev, goNext, count]);

  if (!open || count === 0 || typeof document === "undefined") return null;

  const url = images[Math.min(current, count - 1)];
  const filename = `nqs-imagen-${current + 1}.png`;

  async function handleDownload() {
    setBusy("download");
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);
      showToast({
        title: "DESCARGANDO",
        msg: "La imagen se está descargando.",
        color: "var(--ok, #6DD58C)",
      });
    } catch {
      // Fallback: abrir en pestaña nueva para que el user la guarde a mano.
      window.open(url, "_blank", "noopener,noreferrer");
    } finally {
      setBusy(null);
    }
  }

  async function handleCopy() {
    setBusy("copy");
    try {
      const pngBlob = await urlToPngBlob(url);
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": pngBlob }),
      ]);
      showToast({
        title: "IMAGEN COPIADA",
        msg: "Pegala donde quieras (Ctrl/Cmd+V).",
        color: "var(--ok, #6DD58C)",
      });
    } catch {
      // Fallback: copiar la URL al portapapeles.
      try {
        await navigator.clipboard.writeText(url);
        showToast({
          title: "LINK COPIADO",
          msg: "Tu navegador no permite copiar la imagen; copié el link.",
          color: "var(--accent)",
        });
      } catch {
        showToast({
          title: "ERROR",
          msg: "No pude copiar la imagen.",
          color: "var(--danger, #ff5c5c)",
        });
      }
    } finally {
      setBusy(null);
    }
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="visor de imagen"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.85)",
        display: "grid",
        placeItems: "center",
        zIndex: 2000,
        padding: 24,
      }}
    >
      {/* Botón cerrar */}
      <button
        type="button"
        onClick={onClose}
        aria-label="cerrar"
        style={{
          position: "absolute",
          top: 16,
          right: 20,
          width: 40,
          height: 40,
          borderRadius: "50%",
          border: "1px solid rgba(255,255,255,0.25)",
          background: "rgba(0,0,0,0.4)",
          color: "#fff",
          cursor: "pointer",
          fontSize: 18,
          lineHeight: 1,
        }}
      >
        ✕
      </button>

      {/* Flecha anterior */}
      {hasMultiple && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            goPrev();
          }}
          aria-label="imagen anterior"
          style={arrowStyle("left")}
        >
          ‹
        </button>
      )}

      {/* Imagen + acciones (no cierra al click adentro) */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 14,
          maxWidth: "92vw",
          maxHeight: "92vh",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={`imagen ${current + 1} de ${count}`}
          style={{
            maxWidth: "90vw",
            maxHeight: "78vh",
            objectFit: "contain",
            borderRadius: 8,
            boxShadow: "0 12px 60px rgba(0,0,0,0.6)",
          }}
        />

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          <button
            type="button"
            className="btn sm"
            onClick={handleDownload}
            disabled={busy !== null}
          >
            {busy === "download" ? "descargando…" : "↓ descargar"}
          </button>
          <button
            type="button"
            className="btn sm secondary"
            onClick={handleCopy}
            disabled={busy !== null}
          >
            {busy === "copy" ? "copiando…" : "⧉ copiar"}
          </button>
          {hasMultiple && (
            <span
              className="t-meta"
              style={{
                color: "rgba(255,255,255,0.8)",
                fontFamily: "var(--mono)",
                fontSize: 12,
                letterSpacing: "0.1em",
                marginLeft: 6,
              }}
            >
              {current + 1} / {count}
            </span>
          )}
        </div>
      </div>

      {/* Flecha siguiente */}
      {hasMultiple && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            goNext();
          }}
          aria-label="imagen siguiente"
          style={arrowStyle("right")}
        >
          ›
        </button>
      )}
    </div>,
    document.body,
  );
}

function arrowStyle(side: "left" | "right"): React.CSSProperties {
  return {
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    [side]: 16,
    width: 48,
    height: 48,
    borderRadius: "50%",
    border: "1px solid rgba(255,255,255,0.25)",
    background: "rgba(0,0,0,0.4)",
    color: "#fff",
    cursor: "pointer",
    fontSize: 26,
    lineHeight: 1,
    display: "grid",
    placeItems: "center",
  };
}

/**
 * Convierte una URL de imagen a un Blob PNG vía canvas. Necesario porque
 * el Clipboard API (Chrome) solo acepta image/png; convertir asegura que
 * copiar funcione aunque la imagen original sea jpeg/webp/gif.
 *
 * `crossOrigin = "anonymous"` permite dibujar imágenes de otro origen
 * (las signed URLs de Supabase exponen CORS) sin "tainted canvas".
 */
function urlToPngBlob(url: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("no_canvas_context"));
        return;
      }
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("no_blob"))),
        "image/png",
      );
    };
    img.onerror = () => reject(new Error("img_load_failed"));
    img.src = url;
  });
}
