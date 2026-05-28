"use client";

/**
 * Tabs entre System Prompt y Memoria del workspace para el panel admin.
 *
 * Cada tab es un `<PromptManager />` independiente con su propio state,
 * sus propias versiones, y su propio "activar". El selector de modelo
 * solo aparece en la tab de System Prompt — la memoria comparte el
 * modelo del system prompt activo en cada call.
 */
import { useState } from "react";
import { PromptManager } from "./PromptManager";

type VersionRow = {
  id: string;
  name: string;
  model: string;
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
};

type PromptTabsProps = Readonly<{
  systemState: TabState;
  memoryState: TabState;
}>;

type Tab = "system" | "memory";

export function PromptTabs({ systemState, memoryState }: PromptTabsProps) {
  const [tab, setTab] = useState<Tab>("system");

  return (
    <>
      <div
        style={{
          display: "flex",
          gap: 4,
          borderBottom: "1px solid var(--line)",
          marginTop: 8,
        }}
      >
        <TabBtn
          label="system prompt"
          desc="instrucciones del asistente"
          active={tab === "system"}
          onClick={() => setTab("system")}
        />
        <TabBtn
          label="memoria del workspace"
          desc="contexto compartido"
          active={tab === "memory"}
          onClick={() => setTab("memory")}
        />
      </div>

      {/* Render ambos pero ocultamos el inactivo con `display:none`. Así
          el state local de cada PromptManager no se resetea al cambiar
          de tab (no se desmontan). */}
      <div style={{ display: tab === "system" ? "block" : "none" }}>
        <PromptManager
          type="system"
          versions={systemState.versions}
          activeId={systemState.activeId}
          activeContent={systemState.activeContent}
          activeModel={systemState.activeModel}
        />
      </div>
      <div style={{ display: tab === "memory" ? "block" : "none" }}>
        <PromptManager
          type="memory"
          versions={memoryState.versions}
          activeId={memoryState.activeId}
          activeContent={memoryState.activeContent}
          activeModel={memoryState.activeModel}
        />
      </div>
    </>
  );
}

type TabBtnProps = Readonly<{
  label: string;
  desc: string;
  active: boolean;
  onClick: () => void;
}>;

function TabBtn({ label, desc, active, onClick }: TabBtnProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "10px 16px",
        background: "transparent",
        border: 0,
        borderBottom: active
          ? "2px solid var(--accent)"
          : "2px solid transparent",
        color: active ? "var(--fg)" : "var(--fg-mute)",
        cursor: "pointer",
        textAlign: "left",
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      <span
        style={{
          fontFamily: "var(--mono)",
          fontSize: 11,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        ↳ {label}
      </span>
      <span
        className="t-meta dim"
        style={{ fontSize: 10, textTransform: "none" }}
      >
        {desc}
      </span>
    </button>
  );
}
