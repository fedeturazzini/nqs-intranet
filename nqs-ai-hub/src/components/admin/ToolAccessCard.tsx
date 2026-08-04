"use client";

/**
 * Card por tool en la página de accesos. Combina:
 *   - Toggle status (active/locked)
 *   - Estado efectivo permanente / temporal / vencido
 *   - Editor de schedule con guardado explícito
 */
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { ScheduleEditor, defaultSchedule } from "./ScheduleEditor";
import {
  getAccessExpiryMeta,
  type AccessExpiryKind,
} from "@/lib/access/effective-status";
import {
  describeScheduleSaveError,
  describeZeroLengthScheduleError,
  zeroLengthScheduleDays,
} from "@/lib/utils/schedule";
import type { ToolSchedule } from "@/types/db-aliases";

export type AccessDurationOpts = {
  durationMinutes?: number;
  customExpiresAt?: string | null;
};

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
  onSetDuration: (opts: AccessDurationOpts) => Promise<void> | void;
  onScheduleSave: (schedule: ToolSchedule | null) => Promise<void> | void;
}>;

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

type DurationValue = "1d" | "3d" | "1w" | "1m" | "permanent" | "custom" | "";

const DURATION_PRESETS: ReadonlyArray<{
  value: Exclude<DurationValue, "custom" | "permanent" | "">;
  label: string;
  durationMinutes: number;
}> = [
  { value: "1d", label: "1 día", durationMinutes: 1440 },
  { value: "3d", label: "3 días", durationMinutes: 4320 },
  { value: "1w", label: "1 semana", durationMinutes: 10080 },
  { value: "1m", label: "1 mes", durationMinutes: 43200 },
];

function schedulesEqual(
  a: ToolSchedule | null,
  b: ToolSchedule | null,
): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Valor mostrado en el select según el acceso actual. */
function currentDurationValue(
  expiryKind: AccessExpiryKind,
  expiresAt: string | null,
): DurationValue {
  if (expiryKind === "none") return "";
  if (expiryKind === "permanent" || !expiresAt) return "permanent";
  return "custom";
}

function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const selectStyle: CSSProperties = {
  background: "var(--bg)",
  border: "1px solid var(--line-strong)",
  borderRadius: 6,
  color: "var(--fg)",
  fontFamily: "var(--mono)",
  fontSize: 12,
  padding: "6px 8px",
  outline: "none",
  minWidth: 180,
  cursor: "pointer",
};

export function ToolAccessCard({
  tool,
  access,
  onStatusToggle,
  onSetDuration,
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
  const [durationBusy, setDurationBusy] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customValue, setCustomValue] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);
  const [showSchedule, setShowSchedule] = useState(savedSchedule != null);
  const [draftSchedule, setDraftSchedule] = useState<ToolSchedule | null>(
    savedSchedule,
  );
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  const durationValue = currentDurationValue(
    expiry.kind,
    access?.expires_at ?? null,
  );
  const customOptionLabel = expiry.expiresAtLabel
    ? `custom · ${expiry.kind === "expired" ? "venció" : "vence"} ${expiry.expiresAtLabel}`
    : "custom…";

  useEffect(() => {
    setDraftSchedule(savedSchedule);
    setShowSchedule(savedSchedule != null);
    setSaveState("idle");
    setSaveError(null);
  }, [savedSchedule]);

  useEffect(() => {
    // Si el acceso dejó de ser custom (ej. pasó a permanente), cerrar el picker.
    if (durationValue !== "custom") {
      setCustomOpen(false);
      setCustomValue("");
      setCustomError(null);
    }
  }, [durationValue]);

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

  async function applyDuration(opts: AccessDurationOpts) {
    setDurationBusy(true);
    setCustomError(null);
    try {
      await onSetDuration(opts);
    } catch {
      setCustomError("no se pudo guardar la duración");
    } finally {
      setDurationBusy(false);
    }
  }

  function handleDurationSelect(value: DurationValue) {
    setCustomError(null);
    if (value === "") return;
    if (value === "permanent") {
      setCustomOpen(false);
      void applyDuration({ customExpiresAt: null });
      return;
    }
    if (value === "custom") {
      setCustomOpen(true);
      setCustomValue(
        access?.expires_at ? toDatetimeLocalValue(access.expires_at) : "",
      );
      return;
    }
    const preset = DURATION_PRESETS.find((p) => p.value === value);
    if (!preset) return;
    setCustomOpen(false);
    void applyDuration({ durationMinutes: preset.durationMinutes });
  }

  function confirmCustomDuration() {
    setCustomError(null);
    if (!customValue) {
      setCustomError("elegí una fecha y hora");
      return;
    }
    const dt = new Date(customValue);
    if (Number.isNaN(dt.getTime())) {
      setCustomError("fecha inválida");
      return;
    }
    if (dt.getTime() <= Date.now()) {
      setCustomError("tiene que ser a futuro");
      return;
    }
    void applyDuration({ customExpiresAt: dt.toISOString() });
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
    setSaveError(null);
    setSaveState(schedulesEqual(null, savedSchedule) ? "idle" : "dirty");
  }

  function discardSchedule() {
    setDraftSchedule(savedSchedule);
    setShowSchedule(savedSchedule != null);
    setSaveError(null);
    setSaveState("idle");
  }

  async function saveSchedule() {
    if (!dirty || saveState === "saving") return;

    const zeroLength = zeroLengthScheduleDays(draftSchedule);
    if (zeroLength.length > 0) {
      setSaveError(describeZeroLengthScheduleError(zeroLength));
      setSaveState("error");
      return;
    }

    setSaveState("saving");
    setSaveError(null);
    try {
      await onScheduleSave(draftSchedule);
      setSaveState("saved");
      setSaveError(null);
      window.setTimeout(() => {
        setSaveState((current) => (current === "saved" ? "idle" : current));
      }, 2000);
    } catch (err) {
      const raw = err instanceof Error ? err.message : null;
      setSaveError(describeScheduleSaveError(raw));
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

      {tool.is_active && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            borderTop: "1px solid var(--line)",
            paddingTop: 10,
          }}
        >
          {isActive ? (
            <div className="t-meta" style={{ color: expiryColor, fontSize: 11 }}>
              ↳ {expiry.label.toUpperCase()}
              {expiry.expiresAtLabel
                ? ` · ${expiry.kind === "expired" ? "venció" : "vence"} ${expiry.expiresAtLabel}`
                : ""}
            </div>
          ) : (
            <div className="t-meta dim" style={{ fontSize: 11 }}>
              ↳ sin acceso · elegí duración para habilitar
            </div>
          )}

          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <span className="t-meta dim" style={{ fontSize: 10 }}>
              {isActive ? "↳ duración:" : "↳ habilitar:"}
            </span>
            <select
              aria-label="Duración del acceso"
              value={customOpen && durationValue !== "custom" ? "custom" : durationValue}
              disabled={durationBusy || busy}
              onChange={(e) =>
                handleDurationSelect(e.target.value as DurationValue)
              }
              style={{
                ...selectStyle,
                cursor: durationBusy || busy ? "wait" : "pointer",
                opacity: durationBusy || busy ? 0.7 : 1,
              }}
            >
              {durationValue === "" && (
                <option value="" disabled>
                  elegí duración…
                </option>
              )}
              <option value="permanent">permanente</option>
              {DURATION_PRESETS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
              <option value="custom">{customOptionLabel}</option>
            </select>
            {durationValue === "custom" && !customOpen && (
              <button
                type="button"
                className="t-meta"
                disabled={durationBusy || busy}
                onClick={() => handleDurationSelect("custom")}
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
                editar fecha
              </button>
            )}
            {durationBusy && (
              <span className="t-meta dim" style={{ fontSize: 10 }}>
                guardando…
              </span>
            )}
          </div>

          {customOpen && (
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <span className="t-eyebrow">↳ VENCE EL</span>
              <input
                type="datetime-local"
                value={customValue}
                onChange={(e) => setCustomValue(e.target.value)}
                disabled={durationBusy || busy}
                style={{
                  background: "var(--bg)",
                  border: "1px solid var(--line-strong)",
                  borderRadius: 6,
                  color: "var(--fg)",
                  fontFamily: "var(--mono)",
                  fontSize: 12,
                  padding: "6px 8px",
                  outline: "none",
                }}
              />
              {customError && (
                <span className="t-meta" style={{ color: "var(--danger)" }}>
                  {customError}
                </span>
              )}
              <button
                type="button"
                className="btn sm"
                disabled={durationBusy || busy}
                onClick={confirmCustomDuration}
              >
                {durationBusy ? "guardando…" : "aplicar →"}
              </button>
            </div>
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
                setSaveError(null);
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
              alignItems: "flex-start",
              gap: 10,
              marginTop: 12,
            }}
          >
            <div
              className="t-meta"
              style={{
                fontSize: 10,
                lineHeight: 1.4,
                flex: 1,
                minWidth: 0,
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
                    ? `↳ ${saveError ?? "No se pudo guardar el horario."}`
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
