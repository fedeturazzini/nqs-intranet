"use client";

/**
 * Manager del prompt padre de Claude.
 *
 * Layout:
 *   ┌───────────────────────────────────┬──────────────┐
 *   │ ModelSelector                     │ Versions     │
 *   │                                   │ sidebar      │
 *   │ PromptEditor (textarea + counter) │              │
 *   │                                   │              │
 *   │ Botones: guardar nueva / activar  │              │
 *   └───────────────────────────────────┴──────────────┘
 *
 * Acciones:
 *   - Cambiar modelo (PATCH /[id]/model) — solo si tocó el dropdown.
 *   - "Guardar como nueva versión" (POST /system-prompts) — crea row
 *     inactiva; activate=true si el toggle "y activar" estaba ON.
 *   - "Activar esta versión" (POST /[id]/activate) — cuando el admin
 *     selecciona una versión vieja del sidebar.
 *   - "Borrar" (DELETE /[id]) — solo versiones inactivas; no deja el
 *     historial vacío ni toca la activa.
 */
import { useCallback, useEffect, useState } from "react";
import { showToast } from "@/lib/store/toast";
import {
  defaultThinkingModeFor,
  isThinkingMode,
  type ThinkingMode,
} from "@/lib/anthropic/thinking-mode";
import { ModelSelector, type ClaudeModel } from "./ModelSelector";
import { ThinkingModeSelector } from "./ThinkingModeSelector";

const ALLOWED_MODELS: readonly ClaudeModel[] = [
  "claude-haiku-4-5",
  "claude-sonnet-4-6",
  "claude-sonnet-5",
  "claude-opus-4-6",
  "claude-opus-4-7",
  "claude-opus-4-8",
  "claude-opus-5",
] as const;

type VersionRow = {
  id: string;
  name: string;
  model: string;
  thinking_mode?: string | null;
  is_active: boolean | null;
  version: number | null;
  created_at: string | null;
  created_by: string | null;
  users: { name: string } | null;
};

export type PromptKind = "system" | "memory";

type PromptManagerProps = Readonly<{
  versions: VersionRow[];
  activeId: string | null;
  activeContent: string | null;
  activeModel: string;
  activeThinkingMode?: string;
  /** Si es "memory", oculta el ModelSelector y permite content vacío. */
  type?: PromptKind;
  /** Proyecto al que pertenecen estas versiones (migration 0008). */
  projectId: string;
}>;

const DT = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  // Forzamos hora Argentina (si no, SSR en Vercel = UTC = +3hs).
  timeZone: "America/Argentina/Buenos_Aires",
});

function isClaudeModel(s: string): s is ClaudeModel {
  return (ALLOWED_MODELS as readonly string[]).includes(s);
}

function resolveThinkingMode(
  model: string,
  raw: string | null | undefined,
): ThinkingMode {
  return isThinkingMode(raw) ? raw : defaultThinkingModeFor(model);
}

export function PromptManager({
  versions: initialVersions,
  activeId,
  activeContent,
  activeModel,
  activeThinkingMode,
  type = "system",
  projectId,
}: PromptManagerProps) {
  const isMemory = type === "memory";
  const minContentLen = isMemory ? 0 : 20;
  const namePrefix = isMemory ? "Memoria Claude" : "Brain Claude";
  const [versions, setVersions] = useState(initialVersions);
  const [selectedId, setSelectedId] = useState<string | null>(activeId);
  const [content, setContent] = useState(activeContent ?? "");
  const [savedContent, setSavedContent] = useState(activeContent ?? "");
  const initialModel: ClaudeModel = isClaudeModel(activeModel)
    ? activeModel
    : "claude-sonnet-4-6";
  const initialThinking = resolveThinkingMode(
    initialModel,
    activeThinkingMode,
  );
  const [model, setModel] = useState<ClaudeModel>(initialModel);
  const [savedModel, setSavedModel] = useState<ClaudeModel>(initialModel);
  const [thinkingMode, setThinkingMode] =
    useState<ThinkingMode>(initialThinking);
  const [savedThinkingMode, setSavedThinkingMode] =
    useState<ThinkingMode>(initialThinking);
  const [activateOnSave, setActivateOnSave] = useState(true);
  const [busy, setBusy] = useState(false);

  const selectedVersion = versions.find((v) => v.id === selectedId) ?? null;
  const isViewingActive = selectedVersion?.is_active === true;
  const contentDirty = content !== savedContent;
  const modelDirty = model !== savedModel;
  const thinkingDirty = thinkingMode !== savedThinkingMode;
  const settingsDirty = modelDirty || thinkingDirty;

  function handleModelChange(next: ClaudeModel) {
    setModel(next);
    // Al pasar a Sonnet 5 sugerimos off (el default seguro). Si sale de
    // Sonnet 5 y estaba en off, volvemos a auto.
    if (next === "claude-sonnet-5" && thinkingMode === "auto") {
      setThinkingMode("off");
    } else if (
      model === "claude-sonnet-5" &&
      next !== "claude-sonnet-5" &&
      thinkingMode === "off"
    ) {
      setThinkingMode("auto");
    }
  }

  // Cargar contenido cuando el admin selecciona una version distinta.
  const loadVersion = useCallback(async (id: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/system-prompts/${id}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        showToast({
          title: "ERROR",
          msg: "no pude cargar la versión",
          color: "var(--danger)",
        });
        return;
      }
      const data = (await res.json()) as {
        prompt: {
          id: string;
          content: string;
          model: string;
          thinkingMode?: string;
        };
      };
      setSelectedId(data.prompt.id);
      setContent(data.prompt.content);
      setSavedContent(data.prompt.content);
      const m = isClaudeModel(data.prompt.model)
        ? data.prompt.model
        : "claude-sonnet-4-6";
      const t = resolveThinkingMode(m, data.prompt.thinkingMode);
      setModel(m);
      setSavedModel(m);
      setThinkingMode(t);
      setSavedThinkingMode(t);
    } finally {
      setBusy(false);
    }
  }, []);

  const refreshVersions = useCallback(async () => {
    const res = await fetch(
      `/api/admin/system-prompts?toolId=claude&type=${type}&projectId=${projectId}`,
      { cache: "no-store" },
    );
    if (!res.ok) return;
    const data = (await res.json()) as { prompts: VersionRow[] };
    setVersions(data.prompts);
  }, [type, projectId]);

  async function saveAsNewVersion() {
    if (content.length < minContentLen) {
      showToast({
        title: "MUY CORTO",
        msg: `El ${isMemory ? "contexto" : "prompt"} necesita al menos ${minContentLen} caracteres.`,
        color: "var(--warn)",
      });
      return;
    }
    if (activateOnSave) {
      const ok = confirm(
        isMemory
          ? "Vas a CREAR una versión nueva de la MEMORIA y ACTIVARLA inmediatamente. Esto cambia el contexto que recibe Claude en cada llamada. ¿Continuar?"
          : "Vas a CREAR una versión nueva del SYSTEM PROMPT y ACTIVARLA inmediatamente. Esto afecta a TODOS los usuarios que usen Claude. ¿Continuar?",
      );
      if (!ok) return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/system-prompts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          toolId: "claude",
          type,
          projectId,
          name: `${namePrefix} v${(versions[0]?.version ?? 0) + 1}`,
          content,
          model,
          thinkingMode,
          activate: activateOnSave,
        }),
      });
      const data = (await res.json()) as
        | { prompt: { id: string } }
        | { error: string; message?: string };
      if (!res.ok || "error" in data) {
        showToast({
          title: "ERROR",
          msg: "message" in data && data.message ? data.message : "save_failed",
          color: "var(--danger)",
        });
        setBusy(false);
        return;
      }
      showToast({
        title: activateOnSave ? "VERSIÓN ACTIVA" : "VERSIÓN GUARDADA",
        msg: `v${(versions[0]?.version ?? 0) + 1} ${activateOnSave ? "ya está corriendo" : "guardada como borrador"}.`,
        color: "var(--ok)",
      });
      setSavedContent(content);
      setSavedModel(model);
      setSavedThinkingMode(thinkingMode);
      setSelectedId(data.prompt.id);
      await refreshVersions();
    } finally {
      setBusy(false);
    }
  }

  async function activateSelected() {
    if (!selectedId) return;
    const ok = confirm(
      "Activar esta versión la pone en uso INMEDIATO para todos los usuarios. ¿Continuar?",
    );
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/admin/system-prompts/${selectedId}/activate`,
        { method: "POST" },
      );
      if (!res.ok) {
        showToast({
          title: "ERROR",
          msg: "no pude activar",
          color: "var(--danger)",
        });
        setBusy(false);
        return;
      }
      showToast({
        title: "ACTIVADA",
        msg: "Esta versión ahora corre para todos.",
        color: "var(--ok)",
      });
      await refreshVersions();
    } finally {
      setBusy(false);
    }
  }

  async function deleteVersion(v: VersionRow) {
    if (v.is_active === true) return;
    const ok = confirm(
      `¿Borrar definitivamente la versión v${v.version}? Esta acción no se puede deshacer.`,
    );
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/system-prompts/${v.id}`, {
        method: "DELETE",
      });
      const data = (await res.json().catch(() => null)) as
        | { ok: true; version: number }
        | { error: string; message?: string }
        | null;
      if (!res.ok) {
        showToast({
          title: "ERROR",
          msg:
            data != null && "message" in data && data.message
              ? data.message
              : "no pude borrar",
          color: "var(--danger)",
        });
        setBusy(false);
        return;
      }
      showToast({
        title: "BORRADA",
        msg: `v${v.version} eliminada del historial.`,
        color: "var(--ok)",
      });
      // Si estábamos mirando la que borramos, volvemos a la activa.
      if (selectedId === v.id) {
        const fallback =
          versions.find((x) => x.is_active === true && x.id !== v.id)?.id ??
          activeId;
        if (fallback) await loadVersion(fallback);
      }
      await refreshVersions();
    } finally {
      setBusy(false);
    }
  }

  async function saveSettingsOnly() {
    if (!selectedId) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/admin/system-prompts/${selectedId}/model`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ model, thinkingMode }),
        },
      );
      const data = (await res.json().catch(() => null)) as
        | { ok: true }
        | { error: string; message?: string }
        | null;
      if (!res.ok || (data != null && "error" in data)) {
        // Mostramos el mensaje REAL del server (ej. violación del CHECK
        // constraint si el modelo no está permitido en la DB) en vez de un
        // texto genérico. Antes el error se veía como un "revirtió al modelo
        // anterior" sin explicación.
        const msg =
          data != null && "message" in data && data.message
            ? data.message
            : "no pude guardar modelo/thinking";
        showToast({ title: "ERROR", msg, color: "var(--danger)" });
        setBusy(false);
        return;
      }
      showToast({
        title: "CONFIG ACTUALIZADA",
        msg: `Próximas llamadas: ${model} · thinking ${thinkingMode}.`,
        color: "var(--ok)",
      });
      setSavedModel(model);
      setSavedThinkingMode(thinkingMode);
      await refreshVersions();
    } finally {
      setBusy(false);
    }
  }

  // Estimación liviana de tokens (1 token ≈ 4 chars en inglés/spanish).
  const estTokens = Math.ceil(content.length / 4);
  const tokenColor = estTokens > 8000 ? "var(--warn)" : "var(--fg-mute)";

  useEffect(() => {
    // Si seleccionan la activa y estamos viendo otra, sincronizar.
    if (selectedId !== activeId && selectedId !== null) return;
  }, [selectedId, activeId]);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 280px",
        gap: 24,
        marginTop: 24,
      }}
    >
      <div>
        {!isMemory && (
          <div style={{ marginBottom: 18 }}>
            <ModelSelector
              value={model}
              currentlyActive={savedModel}
              onChange={handleModelChange}
            />
            <ThinkingModeSelector
              value={thinkingMode}
              currentlyActive={savedThinkingMode}
              onChange={setThinkingMode}
            />
            {settingsDirty && !contentDirty && selectedId && (
              <button
                type="button"
                className="btn sm"
                onClick={saveSettingsOnly}
                disabled={busy}
                style={{ marginTop: 10 }}
              >
                guardar modelo / thinking →
              </button>
            )}
          </div>
        )}

        <div className="t-eyebrow" style={{ marginBottom: 8 }}>
          ↳ {isMemory ? "CONTENIDO DE LA MEMORIA" : "CONTENIDO DEL PROMPT"}
        </div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          disabled={busy || (selectedVersion != null && !isViewingActive)}
          placeholder={
            isMemory
              ? "Contexto compartido del workspace: proyectos activos, clientes, glosario interno, decisiones tomadas. Se concatena al system prompt en cada llamada a Claude."
              : "Sos el asistente creativo interno de NQS. Tu rol es…"
          }
          style={{
            width: "100%",
            minHeight: 360,
            background: "var(--bg-elev)",
            border: "1px solid var(--line-strong)",
            borderRadius: 8,
            color: "var(--fg)",
            fontFamily: "var(--mono)",
            fontSize: 13,
            lineHeight: 1.55,
            padding: "12px 14px",
            outline: "none",
            resize: "vertical",
          }}
        />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 6,
            fontSize: 11,
            fontFamily: "var(--mono)",
            color: "var(--fg-mute)",
          }}
        >
          <span>{content.length} chars</span>
          <span style={{ color: tokenColor }}>
            ≈ {estTokens.toLocaleString("es-AR")} tokens
          </span>
        </div>

        {selectedVersion && !isViewingActive && (
          <div
            style={{
              marginTop: 14,
              padding: 12,
              borderRadius: 8,
              border: "1px dashed var(--line-strong)",
              background: "var(--bg-elev)",
              color: "var(--fg-mute)",
              fontSize: 12,
            }}
          >
            ↳ Estás viendo la versión <strong>v{selectedVersion.version}</strong>{" "}
            (inactiva, read-only). Para editar, copiá el contenido y guardalo
            como versión nueva, o activá esta versión.
          </div>
        )}

        <div
          style={{
            marginTop: 18,
            display: "flex",
            gap: 10,
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
          }}
        >
          {selectedVersion && !isViewingActive ? (
            <>
              <button
                type="button"
                className="btn secondary"
                onClick={() => {
                  if (activeId) void loadVersion(activeId);
                }}
                disabled={busy}
              >
                ← volver a la activa
              </button>
              <button
                type="button"
                className="btn"
                onClick={activateSelected}
                disabled={busy}
              >
                activar esta versión →
              </button>
            </>
          ) : (
            <>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  cursor: "pointer",
                  fontFamily: "var(--mono)",
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "var(--fg-mute)",
                }}
              >
                <input
                  type="checkbox"
                  checked={activateOnSave}
                  onChange={(e) => setActivateOnSave(e.target.checked)}
                />
                activar al guardar
              </label>
              <button
                type="button"
                className="btn"
                onClick={saveAsNewVersion}
                disabled={busy || !contentDirty}
              >
                {busy ? "guardando…" : "guardar nueva versión →"}
              </button>
            </>
          )}
        </div>
      </div>

      <aside
        style={{
          border: "1px solid var(--line)",
          borderRadius: 10,
          padding: 14,
          background: "var(--bg-elev)",
          alignSelf: "start",
          maxHeight: "70vh",
          overflowY: "auto",
        }}
      >
        <div className="t-eyebrow" style={{ marginBottom: 10 }}>
          ↳ HISTORIAL ({versions.length})
        </div>
        {versions.length === 0 && (
          <div className="t-meta dim">↳ todavía no hay versiones</div>
        )}
        {versions.map((v) => {
          const active = v.is_active === true;
          const selected = v.id === selectedId;
          return (
            <div
              key={v.id}
              style={{
                display: "flex",
                alignItems: "stretch",
                borderBottom: "1px solid var(--line)",
                borderLeft: selected
                  ? "2px solid var(--accent)"
                  : "2px solid transparent",
                background: selected
                  ? "var(--bg-elev-2, rgba(255,255,255,0.04))"
                  : "transparent",
              }}
            >
              <button
                type="button"
                onClick={() => loadVersion(v.id)}
                disabled={busy}
                style={{
                  flex: 1,
                  textAlign: "left",
                  padding: "10px 10px",
                  border: 0,
                  background: "transparent",
                  color: "var(--fg)",
                  cursor: "pointer",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    marginBottom: 4,
                  }}
                >
                  <strong style={{ fontSize: 13 }}>v{v.version}</strong>
                  {active && (
                    <span
                      className="tag ok"
                      style={{ padding: "1px 6px", fontSize: 9 }}
                    >
                      activa
                    </span>
                  )}
                </div>
                <div className="t-meta dim" style={{ fontSize: 10 }}>
                  {v.model.replace("claude-", "")}
                </div>
                <div
                  className="t-meta dim"
                  style={{ fontSize: 10, marginTop: 2 }}
                >
                  {v.created_at ? DT.format(new Date(v.created_at)) : "—"}
                  {v.users?.name ? ` · ${v.users.name}` : ""}
                </div>
              </button>
              {!active && (
                <button
                  type="button"
                  title={`borrar v${v.version}`}
                  aria-label={`borrar v${v.version}`}
                  onClick={() => void deleteVersion(v)}
                  disabled={busy}
                  style={{
                    border: 0,
                    background: "transparent",
                    color: "var(--fg-mute)",
                    cursor: "pointer",
                    padding: "0 10px",
                    fontFamily: "var(--mono)",
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    alignSelf: "center",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = "var(--danger)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = "var(--fg-mute)";
                  }}
                >
                  ×
                </button>
              )}
            </div>
          );
        })}
      </aside>
    </div>
  );
}
