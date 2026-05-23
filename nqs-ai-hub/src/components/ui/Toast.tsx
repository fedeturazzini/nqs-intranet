"use client";

/**
 * Renderer del toast global. Se monta UNA vez en el layout del dashboard.
 *
 * Adaptado de design/components.jsx líneas 170-181. Usa las clases
 * `.toast`, `.toast-glyph`, `.toast-msg` definidas en screens.css.
 */
import { useToastStore } from "@/lib/store/toast";

export function Toast() {
  const toast = useToastStore((s) => s.toast);
  const hideToast = useToastStore((s) => s.hideToast);
  if (!toast) return null;

  return (
    <div
      className="toast fade-in"
      role="status"
      aria-live="polite"
      onClick={hideToast}
      style={{ cursor: "pointer" }}
    >
      <span
        className="toast-glyph"
        style={{ color: toast.color ?? "var(--accent)" }}
      >
        ✦
      </span>
      <div className="grow">
        <div className="t-eyebrow">{toast.title}</div>
        <div className="toast-msg">{toast.msg}</div>
      </div>
    </div>
  );
}
