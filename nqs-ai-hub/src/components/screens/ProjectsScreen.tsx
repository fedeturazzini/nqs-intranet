"use client";

/**
 * Pantalla de selección de proyecto del estudio.
 *
 * Grid de cards (una por proyecto activo). Click → guarda el proyecto
 * activo (POST /api/me/active-project) → redirige a /tool/claude. Si el
 * user es admin, se agrega una card "+ Nuevo proyecto" que lleva al CRUD.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { showToast } from "@/lib/store/toast";
import { ProjectPasswordGate } from "@/components/screens/ProjectPasswordGate";

type ProjectCardData = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  updatedAt: string | null;
  /** migration 0016: proyecto privado (candado). */
  isPrivate: boolean;
  /** privado y sin cookie de gate válida → al clickear pide contraseña. */
  locked: boolean;
};

type ProjectsScreenProps = Readonly<{
  projects: ProjectCardData[];
  activeProjectId: string | null;
  isAdmin: boolean;
}>;

const RELATIVE = new Intl.RelativeTimeFormat("es", { numeric: "auto" });
function fmtUpdated(iso: string | null): string {
  if (!iso) return "—";
  const days = Math.round(
    (Date.now() - new Date(iso).getTime()) / 86_400_000,
  );
  if (days <= 0) return "actualizado hoy";
  return `actualizado ${RELATIVE.format(-days, "day")}`;
}

export function ProjectsScreen({
  projects,
  activeProjectId,
  isAdmin,
}: ProjectsScreenProps) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  // FIX 17.5: volvió el toggle grid/lista.
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  // migration 0016: proyecto privado bloqueado que está pidiendo contraseña.
  const [gateFor, setGateFor] = useState<ProjectCardData | null>(null);

  // Click en una card: si el proyecto está bloqueado (privado sin gate), abrimos
  // el modal de contraseña; si no, entra directo como siempre.
  function handleOpen(p: ProjectCardData) {
    if (p.locked) {
      setGateFor(p);
      return;
    }
    void openProject(p);
  }

  async function openProject(p: ProjectCardData) {
    setBusyId(p.id);
    try {
      const res = await fetch("/api/me/active-project", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ project_id: p.id }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          message?: string;
        };
        showToast({
          title: "ERROR",
          msg: body.message ?? "no pude abrir el proyecto",
          color: "var(--danger)",
        });
        setBusyId(null);
        return;
      }
      // Hard nav para que el hub/Claude relean el proyecto activo en limpio.
      window.location.href = "/tool/claude";
    } catch {
      showToast({
        title: "ERROR",
        msg: "error de red, probá de nuevo",
        color: "var(--danger)",
      });
      setBusyId(null);
    }
  }

  return (
    <div className="page">
      <div className="page-hd">
        <div>
          <div className="t-eyebrow" style={{ marginBottom: 18 }}>
            ↳ PROYECTOS DEL ESTUDIO
          </div>
          <h1 className="page-title">
            Elegí tu <em>proyecto.</em>
          </h1>
          <div className="page-sub">
            Cada proyecto tiene su propio cerebro y memoria en Claude.
            Seleccioná uno para empezar a trabajar.
          </div>
        </div>

        {/* FIX 17.5: toggle grid / lista */}
        <div className="hub-filters" style={{ alignSelf: "center" }}>
          <button
            type="button"
            className={layout === "grid" ? "active" : ""}
            onClick={() => setLayout("grid")}
          >
            Grid
          </button>
          <button
            type="button"
            className={layout === "list" ? "active" : ""}
            onClick={() => setLayout("list")}
          >
            Lista
          </button>
        </div>
      </div>

      {layout === "list" && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            marginTop: 8,
          }}
        >
          {projects.map((p) => {
            const isActive = p.id === activeProjectId;
            const busy = busyId === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => handleOpen(p)}
                disabled={busy}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  textAlign: "left",
                  border: isActive
                    ? "1px solid var(--accent)"
                    : "1px solid var(--line)",
                  borderRadius: 10,
                  padding: "12px 16px",
                  background: "var(--bg-elev)",
                  cursor: busy ? "wait" : "pointer",
                  color: "inherit",
                }}
              >
                <span style={{ fontSize: 26 }}>{p.icon ?? "◇"}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: "var(--serif)",
                      fontStyle: "italic",
                      fontSize: 18,
                    }}
                  >
                    {p.isPrivate && (
                      <span title="Proyecto privado" style={{ marginRight: 6 }}>
                        🔒
                      </span>
                    )}
                    {p.name}{" "}
                    {isActive && (
                      <span
                        className="tag accent"
                        style={{ padding: "1px 6px", fontSize: 9, marginLeft: 6 }}
                      >
                        activo
                      </span>
                    )}
                  </div>
                  <div
                    className="t-meta dim"
                    style={{
                      fontSize: 11,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {p.description ?? "Sin descripción."}
                  </div>
                </div>
                <span className="btn sm" style={{ flexShrink: 0 }}>
                  {busy ? "abriendo…" : "abrir →"}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {layout === "grid" && (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 14,
          marginTop: 8,
        }}
      >
        {projects.map((p) => {
          const isActive = p.id === activeProjectId;
          const busy = busyId === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => handleOpen(p)}
              disabled={busy}
              style={{
                textAlign: "left",
                border: isActive
                  ? "1px solid var(--accent)"
                  : "1px solid var(--line)",
                borderRadius: 12,
                padding: 20,
                background: "var(--bg-elev)",
                cursor: busy ? "wait" : "pointer",
                display: "flex",
                flexDirection: "column",
                gap: 10,
                minHeight: 200,
                color: "inherit",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                }}
              >
                <span style={{ fontSize: 34, lineHeight: 1 }}>
                  {p.icon ?? "◇"}
                </span>
                {isActive && (
                  <span
                    className="tag accent"
                    style={{ padding: "2px 8px", fontSize: 9 }}
                  >
                    activo
                  </span>
                )}
              </div>

              <div style={{ marginTop: "auto" }}>
                <div
                  className="t-eyebrow"
                  style={{ fontSize: 9, marginBottom: 4 }}
                >
                  {p.slug}
                </div>
                <div
                  style={{
                    fontFamily: "var(--serif)",
                    fontStyle: "italic",
                    fontSize: 24,
                    letterSpacing: "-0.01em",
                  }}
                >
                  {p.isPrivate && (
                    <span title="Proyecto privado" style={{ marginRight: 6 }}>
                      🔒
                    </span>
                  )}
                  {p.name}
                </div>
                <p
                  className="t-meta dim"
                  style={{ margin: "6px 0 0", lineHeight: 1.5, minHeight: 32 }}
                >
                  {p.description ?? "Sin descripción."}
                </p>
                <div
                  className="t-meta dim"
                  style={{ marginTop: 10, fontSize: 10 }}
                >
                  {fmtUpdated(p.updatedAt)}
                </div>
              </div>

              <span
                className="btn sm"
                style={{
                  marginTop: 8,
                  textAlign: "center",
                  opacity: busy ? 0.6 : 1,
                }}
              >
                {busy ? "abriendo…" : "abrir proyecto →"}
              </span>
            </button>
          );
        })}

        {isAdmin && (
          <button
            type="button"
            onClick={() => router.push("/admin/projects")}
            style={{
              border: "1px dashed var(--line-strong)",
              borderRadius: 12,
              padding: 20,
              background: "transparent",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              minHeight: 200,
              color: "var(--fg-mute)",
            }}
          >
            <span style={{ fontSize: 30, lineHeight: 1 }}>+</span>
            <span
              className="t-meta"
              style={{ textTransform: "uppercase", letterSpacing: "0.08em" }}
            >
              Nuevo proyecto
            </span>
            <span className="t-meta dim" style={{ fontSize: 10 }}>
              gestionar en el panel admin
            </span>
          </button>
        )}
      </div>
      )}

      {gateFor && (
        <ProjectPasswordGate
          variant="modal"
          projectId={gateFor.id}
          projectName={gateFor.name}
          onUnlocked={() => {
            const p = gateFor;
            setGateFor(null);
            void openProject(p);
          }}
          onCancel={() => setGateFor(null)}
        />
      )}
    </div>
  );
}
