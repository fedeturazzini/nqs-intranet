"use client";

/**
 * Card por tool en la página de accesos. Combina:
 *   - Toggle status (active/locked)
 *   - Estado efectivo permanente / temporal / vencido
 *   - Editor de schedule con guardado explícito
 */
import { useEffect, useMemo, useState } from "react";
import { ScheduleEditor, defaultSchedule } from "./ScheduleEditor";
import { getAccessExpiryMeta } from "@/lib/access/effective-status";
import type { ToolSchedule } from "@/types/db-aliases";

type ToolAccessCardProps = Readonly<{
  tool: {
    id: string;
    name: string;
    vendor: string;
    color: string | null;
    glyph: string | null;
    is_active: boolean | null;
  };
  access: {
    status: "active" | "pending" | "locked" | "expired";
    schedule: unknown;
    expires_at: string | null;
  } | null;
  onStatusToggle: (next: "active" | "locked") => Promise<void> | void;
  onMakePermanent: () => Promise<void> | void;
  onScheduleSave: (schedule: ToolSchedule | null) => Promise<void> | void;
}>;

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

function schedulesEqual(
  a: ToolSchedule | null,
  b: ToolSchedule | null,
): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function ToolAccessCard({
  tool,
  access,
  onStatusToggle,
  onMakePermanent,
  onScheduleSave,
}: ToolAccessCardProps) {
  const status = access?.status ?? "locked";
  const savedSchedule = (access?.schedule as ToolSchedule | null) ?? null;
  const expiry = useMemo(
    () => getAccessExpiryMeta(status, access?.expires_at ?? null),
    [status, access?.expires_at],
  );
  const isActive = status === "active" || expiry.kind === "expired";
  const toggleOn = status === "active" && expiry.kind !== "expired";

  const [busy, setBusy] = useState(false);
  const [makingPermanent, setMakingPermanent] = useState(false);
  const [showSchedule, setShowSchedule] = useState(savedSchedule != null);
  const [draftSchedule, setDraftSchedule] = useState<ToolSchedule | null>(
    savedSchedule,
  );
  const [saveState, setSaveState] = useState<SaveState>("idle");

  useEffect(() => {
    setDraftSchedule(savedSchedule);
    setShowSchedule(savedSchedule != null);
    setSaveState("idle");
  }, [savedSchedule]);

  const dirty = !schedulesEqual(draftSchedule, savedSchedule);

  async function toggle() {
    setBusy(true);
    try {
      await onStatusToggle(toggleOn ? "locked" : "active");
    } catch {
      // El estado local no se toca si el PATCH falla.
    } finally {
      setBusy(false);
    }
  }

  async function makePermanent() {
    setMakingPermanent(true);
    try {
      await onMakePermanent();
    } catch {
      // El estado local no se toca si el PATCH falla.
    } finally {
      setMakingPermanent(false);
    }
  }

  function openScheduleEditor() {
    setShowSchedule(true);
    if (draftSchedule == null) {
      const next = defaultSchedule();
      setDraftSchedule(next);
      setSaveState("dirty");
    }
  }

  function clearScheduleRestriction() {
    setShowSchedule(false);
    setDraftSchedule(null);
    setSaveState(schedulesEqual(null, savedSchedule) ? "idle" : "dirty");
  }

  function discardSchedule() {
    setDraftSchedule(savedSchedule);
    setShowSchedule(savedSchedule != null);
    setSaveState("idle");
  }

  async function saveSchedule() {
    if (!dirty || saveState === "saving") return;
    setSaveState("saving");
    try {
      await onScheduleSave(draftSchedule);
      setSaveState("saved");
      window.setTimeout(() => {
        setSaveState((current) => (current === "saved" ? "idle" : current));
      }, 2000);
    } catch {
      setSaveState("error");
    }
  }

  const expiryColor =
    expiry.kind === "expired"
      ? "var(--danger, #ff5c5c)"
      : expiry.kind === "temporary"
        ? "var(--accent)"
        : "var(--fg-mute)";

  return (
    <div
      style={{
        border: "1px solid var(--line)",
        borderRadius: 10,
        padding: 16,
        background: "var(--bg-elev)",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        opacity: tool.is_active ? 1 : 0.55,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              color: tool.color ?? "var(--fg)",
              fontFamily: "var(--serif)",
              fontStyle: "italic",
              fontSize: 22,
            }}
          >
            {tool.glyph ?? "◇"}
          </span>
          <div>
            <div
              style={{
                fontFamily: "var(--serif)",
                fontStyle: "italic",
                fontSize: 18,
                letterSpacing: "-0.01em",
              }}
            >
              {tool.name}
            </div>
            <div className="t-meta dim" style={{ fontSize: 10 }}>
              {tool.vendor}
            </div>
          </div>
        </div>

        <Toggle on={toggleOn} busy={busy} onClick={toggle} />
      </div>

      {!tool.is_active && (
        <div className="t-meta dim" style={{ fontStyle: "italic" }}>
          ↳ esta tool todavía no está habilitada en la plataforma
        </div>
      )}

      {isActive && tool.is_active && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
            borderTop: "1px solid var(--line)",
            paddingTop: 10,
          }}
        >
          <div className="t-meta" style={{ color: expiryColor, fontSize: 11 }}>
            ↳ {expiry.label.toUpperCase()}
            {expiry.expiresAtLabel
              ? ` · ${expiry.kind === "expired" ? "venció" : "vence"} ${expiry.expiresAtLabel}`
              : ""}
          </div>
          {(expiry.kind === "temporary" || expiry.kind === "expired") && (
            <button
              type="button"
              className="t-meta"
              onClick={() => void makePermanent()}
              disabled={makingPermanent || busy}
              style={{
                background: "transparent",
                border: 0,
                color: "var(--accent)",
                cursor: makingPermanent ? "wait" : "pointer",
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                flexShrink: 0,
              }}
            >
              {makingPermanent ? "guardando…" : "hacer permanente"}
            </button>
          )}
        </div>
      )}

      {toggleOn && tool.is_active && (
        <div className="t-meta dim" style={{ fontSize: 10, marginTop: -4 }}>
          ↳ el horario limita cuándo se usa; no extiende el vencimiento
        </div>
      )}

      {toggleOn && tool.is_active && tool.id === "tutoriales" && (
        <div
          className="t-meta dim"
          style={{
            borderTop: "1px solid var(--line)",
            paddingTop: 12,
            fontSize: 11,
          }}
        >
          ↳ acceso 24/7 · sin horarios (contenido educativo)
        </div>
      )}

      {toggleOn && tool.is_active && tool.id !== "tutoriales" && (
        <div style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div className="t-eyebrow" style={{ color: "var(--fg-mute)" }}>
              ↳ HORARIO
            </div>
            <button
              type="button"
              className="t-meta"
              onClick={() => {
                if (showSchedule) clearScheduleRestriction();
                else openScheduleEditor();
              }}
              style={{
                background: "transparent",
                border: 0,
                color: "var(--accent)",
                cursor: "pointer",
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              {showSchedule ? "sin restricción ←" : "+ configurar horarios"}
            </button>
          </div>

          {showSchedule && draftSchedule && (
            <ScheduleEditor
              value={draftSchedule}
              onChange={(next) => {
                setDraftSchedule(next);
                setSaveState(
                  schedulesEqual(next, savedSchedule) ? "idle" : "dirty",
                );
              }}
            />
          )}
          {!showSchedule && (
            <div className="t-meta dim" style={{ marginTop: 6, fontSize: 11 }}>
              acceso 24/7
            </div>
          )}

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 10,
              marginTop: 12,
            }}
          >
            <div
              className="t-meta"
              style={{
                fontSize: 10,
                color:
                  saveState === "error"
                    ? "var(--danger, #ff5c5c)"
                    : saveState === "saved"
                      ? "var(--ok, #3ecf8e)"
                      : "var(--fg-mute)",
              }}
            >
              {saveState === "saving"
                ? "↳ guardando…"
                : saveState === "saved"
                  ? "↳ guardado"
                  : saveState === "error"
                    ? "↳ error al guardar"
                    : dirty
                      ? "↳ cambios sin guardar"
                      : "↳ sin cambios"}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                className="btn sm secondary"
                onClick={discardSchedule}
                disabled={!dirty || saveState === "saving"}
              >
                descartar
              </button>
              <button
                type="button"
                className="btn sm"
                onClick={() => void saveSchedule()}
                disabled={!dirty || saveState === "saving"}
              >
                {saveState === "saving" ? "guardando…" : "guardar horarios"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Toggle({
  on,
  busy,
  onClick,
}: Readonly<{ on: boolean; busy: boolean; onClick: () => void }>) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label={on ? "desactivar" : "activar"}
      aria-pressed={on}
      style={{
        width: 44,
        height: 24,
        borderRadius: 12,
        border: 0,
        background: on ? "var(--accent)" : "var(--line-strong)",
        position: "relative",
        cursor: busy ? "wait" : "pointer",
        transition: "background 0.15s",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: on ? 22 : 2,
          width: 20,
          height: 20,
          borderRadius: "50%",
          background: on ? "var(--accent-fg)" : "var(--bg-elev)",
          transition: "left 0.15s",
        }}
      />
    </button>
  );
}
