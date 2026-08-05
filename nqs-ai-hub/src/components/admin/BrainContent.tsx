"use client";

/**
 * Contenido del System Brain (post-gate). Selector de proyecto + botón
 * "cambiar contraseña del Brain" + las tabs de System Prompt / Memoria del
 * proyecto seleccionado.
 *
 * El selector navega a /admin/brain?project=<id> (el Server Component
 * recarga los prompts del proyecto elegido).
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PromptTabs } from "./PromptTabs";
import { showToast } from "@/lib/store/toast";

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

type TabState = {
  versions: VersionRow[];
  activeId: string | null;
  activeContent: string | null;
  activeModel: string;
  activeThinkingMode?: string;
};

type BrainContentProps = Readonly<{
  projects: { id: string; name: string; icon: string | null }[];
  selectedProjectId: string;
  systemState: TabState;
  memoryState: TabState;
}>;

export function BrainContent({
  projects,
  selectedProjectId,
  systemState,
  memoryState,
}: BrainContentProps) {
  const router = useRouter();
  const [changeOpen, setChangeOpen] = useState(false);

  return (
    <div style={{ padding: 32, height: "100%", overflow: "auto" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div className="t-eyebrow" style={{ marginBottom: 14 }}>
            ↳ ADMIN · SYSTEM BRAIN
          </div>
          <h1
            className="page-title"
            style={{ fontSize: 28, margin: 0, letterSpacing: "-0.01em" }}
          >
            Cerebro de <em style={{ fontFamily: "var(--serif)" }}>Claude</em>
          </h1>
          <p className="muted" style={{ marginTop: 6, marginBottom: 0 }}>
            El system prompt + la memoria que recibe Claude en cada llamada,
            <strong> por proyecto</strong>.
          </p>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="t-eyebrow" style={{ fontSize: 10 }}>
              editando
            </span>
            <select
              value={selectedProjectId}
              onChange={(e) =>
                router.push(`/admin/brain?project=${e.target.value}`)
              }
              style={{
                background: "var(--bg)",
                border: "1px solid var(--line-strong)",
                borderRadius: 6,
                color: "var(--fg)",
                fontFamily: "var(--sans)",
                fontSize: 13,
                padding: "8px 10px",
                outline: "none",
              }}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.icon ? `${p.icon} ` : ""}
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn sm secondary"
            onClick={() => setChangeOpen(true)}
          >
            🔑 cambiar contraseña
          </button>
        </div>
      </div>

      {/* key fuerza remount al cambiar de proyecto → el state local de los
          PromptManager se reinicia con los datos del proyecto nuevo. */}
      <PromptTabs
        key={selectedProjectId}
        projectId={selectedProjectId}
        systemState={systemState}
        memoryState={memoryState}
      />

      {changeOpen && (
        <ChangePasswordModal onClose={() => setChangeOpen(false)} />
      )}
    </div>
  );
}

function ChangePasswordModal({ onClose }: Readonly<{ onClose: () => void }>) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (next.length < 6) {
      setError("la nueva contraseña debe tener al menos 6 caracteres");
      return;
    }
    if (next !== confirm) {
      setError("las contraseñas nuevas no coinciden");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/brain/change-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          current_password: current,
          new_password: next,
        }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        message?: string;
      };
      if (!res.ok || !data.success) {
        setError(data.message ?? "no se pudo cambiar la contraseña");
        setBusy(false);
        return;
      }
      showToast({
        title: "CONTRASEÑA ACTUALIZADA",
        msg: "El Brain usa la nueva contraseña.",
        color: "var(--ok)",
      });
      onClose();
    } catch {
      setError("error de red");
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "grid",
        placeItems: "center",
        zIndex: 1000,
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-elev)",
          border: "1px solid var(--line-strong)",
          borderRadius: 12,
          padding: 24,
          width: "100%",
          maxWidth: 400,
        }}
      >
        <div className="t-eyebrow" style={{ marginBottom: 14 }}>
          ↳ CAMBIAR CONTRASEÑA DEL BRAIN
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <PwInput label="ACTUAL" value={current} onChange={setCurrent} />
          <PwInput label="NUEVA" value={next} onChange={setNext} />
          <PwInput label="CONFIRMAR NUEVA" value={confirm} onChange={setConfirm} />
        </div>
        {error && (
          <div className="t-meta" style={{ color: "var(--danger)", marginTop: 10 }}>
            ↳ {error}
          </div>
        )}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
            marginTop: 18,
          }}
        >
          <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>
            cancelar
          </button>
          <button
            type="button"
            className="btn"
            onClick={submit}
            disabled={busy || !current || !next || !confirm}
          >
            {busy ? "guardando…" : "guardar →"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PwInput({
  label,
  value,
  onChange,
}: Readonly<{ label: string; value: string; onChange: (v: string) => void }>) {
  return (
    <label style={{ display: "block" }}>
      <span className="t-eyebrow" style={{ display: "block", marginBottom: 4 }}>
        {label}
      </span>
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%",
          background: "var(--bg)",
          border: "1px solid var(--line-strong)",
          borderRadius: 6,
          color: "var(--fg)",
          fontFamily: "var(--mono)",
          fontSize: 13,
          padding: "8px 10px",
          outline: "none",
        }}
      />
    </label>
  );
}
