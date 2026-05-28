"use client";

/**
 * Toggle dark/light en la topbar.
 *
 * UX:
 *   - Arranca con el tema del SSR (lo que ya está en `<html data-theme>`).
 *   - Click invierte: actualiza `data-theme` del DOM al toque (sin
 *     recargar) + PATCH /api/me/preferences en background.
 *   - Si el PATCH falla, revertimos + toast rojo.
 */
import { useEffect, useState } from "react";
import { showToast } from "@/lib/store/toast";

type Theme = "light" | "dark";

type ThemeToggleProps = Readonly<{
  initial: Theme;
}>;

export function ThemeToggle({ initial }: ThemeToggleProps) {
  const [theme, setTheme] = useState<Theme>(initial);
  const [busy, setBusy] = useState(false);

  // Si el SSR vino con un theme y por cualquier motivo el DOM tiene otro,
  // sincronizar (raro pero defensivo).
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  async function toggle() {
    if (busy) return;
    const next: Theme = theme === "light" ? "dark" : "light";
    setBusy(true);
    setTheme(next);
    try {
      const res = await fetch("/api/me/preferences", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ theme: next }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
    } catch (err) {
      // Rollback.
      setTheme(theme);
      showToast({
        title: "ERROR",
        msg: `no pude guardar el tema (${err instanceof Error ? err.message : "network"})`,
        color: "var(--danger)",
      });
    } finally {
      setBusy(false);
    }
  }

  const label = theme === "light" ? "modo oscuro" : "modo claro";
  // Sun → modo light actual (clickeás para pasar a dark)
  // Moon → modo dark actual (clickeás para pasar a light)
  const icon = theme === "light" ? "☀" : "☾";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      disabled={busy}
      style={{
        background: "transparent",
        border: "1px solid var(--line)",
        borderRadius: 999,
        width: 30,
        height: 30,
        display: "grid",
        placeItems: "center",
        cursor: busy ? "wait" : "pointer",
        color: "var(--fg-mute)",
        fontSize: 14,
        transition: "color 0.15s, border-color 0.15s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = "var(--fg)";
        e.currentTarget.style.borderColor = "var(--line-strong)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = "var(--fg-mute)";
        e.currentTarget.style.borderColor = "var(--line)";
      }}
    >
      {icon}
    </button>
  );
}
