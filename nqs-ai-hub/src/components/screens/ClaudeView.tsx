"use client";

/**
 * Vista del wrapper de Claude.
 *
 * FIX 17.5: la selección de proyecto vive ACÁ (no al login). Si el user no
 * tiene proyecto activo, se muestra un picker intermedio; si tiene, entra
 * al chat con un selector de proyecto siempre visible en el header. El
 * historial del sidebar está filtrado por el proyecto activo.
 *
 * El system prompt nunca llega acá — vive en el backend.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { showToast } from "@/lib/store/toast";
import { useClaudeChat } from "@/lib/hooks/useClaudeChat";
import type { PdfAttachment } from "@/lib/hooks/useClaudeChat";
import { ChatInput } from "@/components/tool/ChatInput";
import { ChatMessages } from "@/components/tool/ChatMessages";
import { ConversationsSidebar } from "@/components/tool/ConversationsSidebar";
import { ProjectPasswordGate } from "@/components/screens/ProjectPasswordGate";
import type { ConversationListRow } from "@/lib/db/queries/conversations";

type ProjectLite = {
  id: string;
  name: string;
  icon: string | null;
  /** migration 0016: proyecto privado (candado). */
  isPrivate: boolean;
  /** privado y sin cookie de gate válida (calculado en el SSR). */
  locked: boolean;
};

type ClaudeViewProps = Readonly<{
  user: { name: string; initials: string };
  projects: ProjectLite[];
  activeProject: ProjectLite | null;
  /** null = el preload SSR falló; el sidebar reintenta por su endpoint. */
  initialConversations: ConversationListRow[] | null;
}>;

export function ClaudeView({
  user,
  projects,
  activeProject: initialProject,
  initialConversations,
}: ClaudeViewProps) {
  const [activeProject, setActiveProject] = useState<ProjectLite | null>(
    initialProject,
  );
  const chat = useClaudeChat(activeProject?.id ?? null);
  const [sidebarRefresh, setSidebarRefresh] = useState(0);
  const [switching, setSwitching] = useState(false);
  // migration 0016: proyecto privado esperando contraseña al entrar.
  // Se pide en cada switch hacia un privado (la cookie se limpia al salir).
  const [gateProject, setGateProject] = useState<ProjectLite | null>(null);

  const firstName = user.name.split(" ")[0] ?? user.name;

  // Cambio efectivo de proyecto (una vez pasado el gate, si hacía falta).
  const doSwitch = useCallback(
    async (project: ProjectLite) => {
      const isChange = activeProject !== null && activeProject.id !== project.id;
      setSwitching(true);
      try {
        const res = await fetch("/api/me/active-project", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ project_id: project.id }),
        });
        if (!res.ok) {
          showToast({
            title: "ERROR",
            msg: "no pude cambiar de proyecto",
            color: "var(--danger)",
          });
          return;
        }
        setActiveProject(project);
        // Reset del chat abierto: si era de otro proyecto, lo limpiamos
        // (la conv pertenece al proyecto viejo). El sidebar refetcha el
        // historial del proyecto nuevo.
        chat.newConversation();
        setSidebarRefresh((n) => n + 1);
        if (isChange) {
          showToast({
            title: "PROYECTO CAMBIADO",
            msg: `Ahora estás en ${project.name}.`,
            color: "var(--ok)",
          });
        }
      } finally {
        setSwitching(false);
      }
    },
    [activeProject, chat],
  );

  // Entrada al cambio de proyecto: destino privado → siempre pide contraseña.
  const switchProject = useCallback(
    (project: ProjectLite) => {
      if (switching) return;
      if (activeProject?.id === project.id) return; // ya activo
      if (project.isPrivate) {
        setGateProject(project);
        return;
      }
      void doSwitch(project);
    },
    [activeProject, switching, doSwitch],
  );

  const onSend = useCallback(
    async (
      prompt: string,
      imagePaths: string[],
      previews: string[],
      pdfPreviews: PdfAttachment[],
    ) => {
      const result = await chat.sendMessage(
        prompt,
        imagePaths,
        previews,
        pdfPreviews,
      );
      if (!result.ok) {
        showToast({
          title: "ERROR",
          msg: result.error,
          color: "var(--danger, #ff5c5c)",
        });
        return;
      }
    },
    [chat],
  );

  const previousConversationIdRef = useRef(chat.conversationId);
  useEffect(() => {
    const previous = previousConversationIdRef.current;
    previousConversationIdRef.current = chat.conversationId;
    // Cubre también el caso donde el send empezó en un mount anterior: cuando
    // el draft recibe su id real, el sidebar nuevo debe listar la conversación.
    if (!previous && chat.conversationId) {
      setSidebarRefresh((n) => n + 1);
    }
  }, [chat.conversationId]);

  const onSelectConversation = useCallback(
    (id: string) => void chat.loadConversation(id),
    [chat],
  );
  const onNew = useCallback(() => chat.newConversation(), [chat]);

  // Modal de contraseña al elegir un proyecto privado bloqueado (0016). Se
  // renderiza en ambas vistas (picker y chat) porque las dos usan switchProject.
  const gateModal = gateProject ? (
    <ProjectPasswordGate
      variant="modal"
      projectId={gateProject.id}
      projectName={gateProject.name}
      onUnlocked={() => {
        const p = gateProject;
        setGateProject(null);
        void doSwitch(p);
      }}
      onCancel={() => setGateProject(null)}
    />
  ) : null;

  // Sin proyecto activo → pantalla intermedia de selección.
  if (!activeProject) {
    return (
      <>
        {gateModal}
        <ClaudeProjectPicker
          projects={projects}
          busy={switching}
          onPick={switchProject}
        />
      </>
    );
  }

  return (
    <div
      className="page"
      style={{
        padding: 0,
        height: "calc(100vh - 60px - 38px)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {gateModal}
      {/* ─── Header ─── */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 32px",
          borderBottom: "1px solid var(--line)",
          gap: 16,
        }}
      >
        <div className="row" style={{ gap: 16, alignItems: "center" }}>
          <Link
            href="/hub"
            prefetch={false}
            className="t-meta"
            style={{
              color: "var(--fg-mute)",
              textDecoration: "none",
              fontFamily: "var(--mono)",
              fontSize: 11,
              letterSpacing: "0.12em",
            }}
          >
            ← VOLVER AL HUB
          </Link>
          <div style={{ width: 1, height: 16, background: "var(--line)" }} />
          <div className="brand" style={{ gap: 10 }}>
            <span
              className="brand-mark"
              style={{ background: "#D97757", color: "#fff" }}
              title="Claude · Anthropic"
            >
              C
            </span>
            <span>CLAUDE</span>
          </div>
          {/* Selector de proyecto SIEMPRE visible */}
          <ProjectSelector
            projects={projects}
            active={activeProject}
            busy={switching}
            onSelect={switchProject}
          />
        </div>
        <div className="t-meta dim" style={{ fontSize: 10 }}>
          ↳ {chat.conversationId ? "CONVERSACIÓN ACTIVA" : "CONVERSACIÓN NUEVA"}
        </div>
      </header>

      {/* ─── Body ─── */}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <ConversationsSidebar
          activeId={chat.conversationId}
          refreshSignal={sidebarRefresh}
          projectName={activeProject.name}
          initialConversations={initialConversations}
          onSelect={onSelectConversation}
          onNew={onNew}
        />

        <main
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
            padding: "20px 32px 24px",
          }}
        >
          <div style={{ flex: 1, overflowY: "auto", paddingRight: 8 }}>
            {chat.loadError && (
              <div className="chat-block" style={{ marginBottom: 12 }}>
                <strong>ERROR</strong>
                {chat.loadError}
              </div>
            )}
            <ChatMessages
              messages={chat.messages}
              userInitials={user.initials}
              userFirstName={firstName}
            />
          </div>

          <ChatInput
            isSending={chat.isSending}
            conversationId={chat.conversationId}
            onSend={onSend}
            onStop={chat.stop}
          />
        </main>
      </div>
    </div>
  );
}

// ============================================================
// Selector de proyecto (dropdown del header)
// ============================================================

type ProjectSelectorProps = Readonly<{
  projects: ProjectLite[];
  active: ProjectLite;
  busy: boolean;
  onSelect: (p: ProjectLite) => void;
}>;

function ProjectSelector({
  projects,
  active,
  busy,
  onSelect,
}: ProjectSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          background: "var(--bg-elev)",
          border: "1px solid var(--line-strong)",
          borderRadius: 8,
          padding: "6px 10px",
          cursor: busy ? "wait" : "pointer",
          color: "var(--fg)",
          fontFamily: "var(--mono)",
          fontSize: 12,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
        }}
      >
        <span>{active.icon ?? "◇"}</span>
        <span>{active.name}</span>
        <span className="dim" style={{ fontSize: 9 }}>
          ▾
        </span>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            minWidth: 220,
            background: "var(--bg-elev)",
            border: "1px solid var(--line-strong)",
            borderRadius: 8,
            boxShadow: "0 12px 40px rgba(0,0,0,0.4)",
            padding: 6,
            zIndex: 1100,
          }}
        >
          {projects.map((p) => {
            const isActive = p.id === active.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setOpen(false);
                  onSelect(p);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  textAlign: "left",
                  background: isActive ? "var(--bg)" : "transparent",
                  border: 0,
                  borderRadius: 6,
                  padding: "8px 10px",
                  cursor: "pointer",
                  color: isActive ? "var(--fg)" : "var(--fg-mute)",
                  fontSize: 13,
                }}
              >
                <span style={{ fontSize: 16 }}>{p.icon ?? "◇"}</span>
                <span style={{ flex: 1 }}>
                  {p.isPrivate && (
                    <span title="Proyecto privado" style={{ marginRight: 4 }}>
                      🔒
                    </span>
                  )}
                  {p.name}
                </span>
                {isActive && (
                  <span className="tag accent" style={{ padding: "1px 6px", fontSize: 9 }}>
                    activo
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Picker intermedio (sin proyecto activo)
// ============================================================

type ClaudeProjectPickerProps = Readonly<{
  projects: ProjectLite[];
  busy: boolean;
  onPick: (p: ProjectLite) => void;
}>;

function ClaudeProjectPicker({
  projects,
  busy,
  onPick,
}: ClaudeProjectPickerProps) {
  return (
    <div
      style={{
        height: "calc(100vh - 60px - 38px)",
        display: "grid",
        placeItems: "center",
        padding: 32,
        overflowY: "auto",
      }}
    >
      <div style={{ maxWidth: 720, width: "100%", textAlign: "center" }}>
        <div className="t-eyebrow" style={{ marginBottom: 12 }}>
          ↳ CLAUDE
        </div>
        <h1
          className="page-title"
          style={{ fontSize: 30, margin: "0 0 8px" }}
        >
          Elegí un proyecto para <em>arrancar.</em>
        </h1>
        <p className="t-meta dim" style={{ marginBottom: 28 }}>
          El proyecto define el contexto y la memoria de Claude.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: 12,
            textAlign: "left",
          }}
        >
          {projects.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={busy}
              onClick={() => onPick(p)}
              style={{
                border: "1px solid var(--line)",
                borderRadius: 12,
                padding: 18,
                background: "var(--bg-elev)",
                cursor: busy ? "wait" : "pointer",
                display: "flex",
                flexDirection: "column",
                gap: 8,
                minHeight: 130,
                color: "inherit",
              }}
            >
              <span style={{ fontSize: 30, lineHeight: 1 }}>
                {p.icon ?? "◇"}
              </span>
              <span
                style={{
                  marginTop: "auto",
                  fontFamily: "var(--serif)",
                  fontStyle: "italic",
                  fontSize: 20,
                }}
              >
                {p.isPrivate && (
                  <span title="Proyecto privado" style={{ marginRight: 6 }}>
                    🔒
                  </span>
                )}
                {p.name}
              </span>
            </button>
          ))}
        </div>

        {projects.length === 0 && (
          <p className="t-meta dim" style={{ marginTop: 24 }}>
            No hay proyectos activos. Pedile al admin que cree uno.
          </p>
        )}
      </div>
    </div>
  );
}
