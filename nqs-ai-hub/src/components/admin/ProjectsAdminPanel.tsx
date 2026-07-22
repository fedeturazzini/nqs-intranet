"use client";

/**
 * Panel admin de proyectos: lista + crear/editar + archivar/restaurar.
 *
 * - Crear/editar via modal (POST/PATCH /api/admin/projects).
 * - "Archivar" = soft delete (DELETE → is_active=false). "Restaurar" =
 *   PATCH is_active=true. No hay borrado real.
 */
import { useState } from "react";
import { showToast } from "@/lib/store/toast";

type ProjectItem = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  is_active: boolean;
  is_private: boolean;
  updated_at: string | null;
};

type ProjectsAdminPanelProps = Readonly<{
  initialProjects: ProjectItem[];
}>;

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function ProjectsAdminPanel({
  initialProjects,
}: ProjectsAdminPanelProps) {
  const [projects, setProjects] = useState(initialProjects);
  const [editing, setEditing] = useState<ProjectItem | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  // S18: hard delete — proyecto target del modal de confirmación por nombre.
  const [hardTarget, setHardTarget] = useState<ProjectItem | null>(null);

  async function hardDelete(p: ProjectItem) {
    const res = await fetch(`/api/admin/projects/${p.id}?hard=true`, {
      method: "DELETE",
    });
    if (res.ok) {
      setProjects((prev) => prev.filter((x) => x.id !== p.id));
      setHardTarget(null);
      showToast({
        title: "ELIMINADO",
        msg: `"${p.name}" y sus conversaciones se borraron definitivamente.`,
        color: "var(--danger)",
      });
    } else {
      showToast({
        title: "ERROR",
        msg: "no se pudo eliminar",
        color: "var(--danger)",
      });
    }
  }

  function openCreate() {
    setEditing(null);
    setModalOpen(true);
  }
  function openEdit(p: ProjectItem) {
    setEditing(p);
    setModalOpen(true);
  }

  async function archive(p: ProjectItem) {
    const res = await fetch(`/api/admin/projects/${p.id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setProjects((prev) =>
        prev.map((x) => (x.id === p.id ? { ...x, is_active: false } : x)),
      );
      showToast({
        title: "ARCHIVADO",
        msg: `"${p.name}" quedó archivado.`,
        color: "var(--warn)",
      });
    } else {
      showToast({ title: "ERROR", msg: "no se pudo archivar", color: "var(--danger)" });
    }
  }

  async function restore(p: ProjectItem) {
    const res = await fetch(`/api/admin/projects/${p.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ is_active: true }),
    });
    if (res.ok) {
      setProjects((prev) =>
        prev.map((x) => (x.id === p.id ? { ...x, is_active: true } : x)),
      );
      showToast({ title: "RESTAURADO", msg: `"${p.name}" está activo de nuevo.`, color: "var(--ok)" });
    } else {
      showToast({ title: "ERROR", msg: "no se pudo restaurar", color: "var(--danger)" });
    }
  }

  function onSaved(p: ProjectItem) {
    setProjects((prev) => {
      const idx = prev.findIndex((x) => x.id === p.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = p;
        return next;
      }
      return [...prev, p];
    });
    setModalOpen(false);
  }

  return (
    <div className="page">
      <div
        className="page-hd"
        style={{ alignItems: "center", justifyContent: "space-between" }}
      >
        <div>
          <div className="t-eyebrow" style={{ marginBottom: 8 }}>
            ↳ ADMIN · PROYECTOS
          </div>
          <h1 className="page-title" style={{ fontSize: 28, margin: 0 }}>
            Proyectos del <em>estudio</em>
          </h1>
        </div>
        <button type="button" className="btn" onClick={openCreate}>
          + nuevo proyecto
        </button>
      </div>

      <div
        style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}
      >
        {projects.map((p) => (
          <div
            key={p.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: 14,
              border: "1px solid var(--line)",
              borderRadius: 10,
              background: "var(--bg-elev)",
              opacity: p.is_active ? 1 : 0.55,
            }}
          >
            <span style={{ fontSize: 26 }}>{p.icon ?? "◇"}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    fontFamily: "var(--serif)",
                    fontStyle: "italic",
                    fontSize: 18,
                  }}
                >
                  {p.name}
                </span>
                <span className="t-meta dim" style={{ fontSize: 10 }}>
                  {p.slug}
                </span>
                {p.is_private && (
                  <span className="tag" style={{ padding: "1px 6px", fontSize: 9 }}>
                    🔒 privado
                  </span>
                )}
                {!p.is_active && (
                  <span className="tag" style={{ padding: "1px 6px", fontSize: 9 }}>
                    archivado
                  </span>
                )}
              </div>
              <div
                className="t-meta dim"
                style={{ fontSize: 11, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              >
                {p.description ?? "sin descripción"}
              </div>
            </div>
            <button type="button" className="btn sm secondary" onClick={() => openEdit(p)}>
              editar
            </button>
            {p.is_active ? (
              <button
                type="button"
                className="btn sm secondary"
                onClick={() => archive(p)}
                style={{ color: "var(--warn)" }}
              >
                archivar
              </button>
            ) : (
              <button type="button" className="btn sm secondary" onClick={() => restore(p)}>
                restaurar
              </button>
            )}
            {/* S18: hard delete definitivo */}
            <button
              type="button"
              className="btn sm secondary"
              onClick={() => setHardTarget(p)}
              style={{ color: "var(--danger)", borderColor: "var(--danger)" }}
              title="eliminar definitivamente"
            >
              eliminar
            </button>
          </div>
        ))}
        {projects.length === 0 && (
          <div className="t-meta dim" style={{ padding: "40px 0", textAlign: "center" }}>
            ↳ todavía no hay proyectos
          </div>
        )}
      </div>

      {modalOpen && (
        <ProjectModal
          project={editing}
          onClose={() => setModalOpen(false)}
          onSaved={onSaved}
        />
      )}

      {hardTarget && (
        <HardDeleteModal
          project={hardTarget}
          onClose={() => setHardTarget(null)}
          onConfirm={() => hardDelete(hardTarget)}
        />
      )}
    </div>
  );
}

type HardDeleteModalProps = Readonly<{
  project: ProjectItem;
  onClose: () => void;
  onConfirm: () => void;
}>;

function HardDeleteModal({ project, onClose, onConfirm }: HardDeleteModalProps) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const matches = typed.trim() === project.name;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        display: "grid",
        placeItems: "center",
        zIndex: 1100,
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-elev)",
          border: "1px solid var(--danger)",
          borderRadius: 12,
          padding: 24,
          width: "100%",
          maxWidth: 460,
        }}
      >
        <div className="t-eyebrow" style={{ color: "var(--danger)", marginBottom: 10 }}>
          ↳ ELIMINAR DEFINITIVAMENTE
        </div>
        <p style={{ lineHeight: 1.55, margin: "0 0 14px", fontSize: 14 }}>
          Esto va a eliminar <strong>PERMANENTEMENTE</strong> el proyecto{" "}
          <strong>{project.name}</strong> y{" "}
          <strong>todas sus conversaciones asociadas</strong>. No se puede
          deshacer.
        </p>
        <label style={{ display: "block" }}>
          <span className="t-meta dim" style={{ display: "block", marginBottom: 6 }}>
            Escribí <code>{project.name}</code> para confirmar:
          </span>
          <input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoFocus
            placeholder={project.name}
            style={{
              width: "100%",
              background: "var(--bg)",
              border: "1px solid var(--line-strong)",
              borderRadius: 6,
              color: "var(--fg)",
              fontFamily: "var(--sans)",
              fontSize: 13,
              padding: "8px 10px",
              outline: "none",
            }}
          />
        </label>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
          <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>
            cancelar
          </button>
          <button
            type="button"
            className="btn"
            disabled={!matches || busy}
            onClick={() => {
              setBusy(true);
              onConfirm();
            }}
            style={{
              background: matches ? "var(--danger)" : undefined,
              color: matches ? "#fff" : undefined,
            }}
          >
            {busy ? "eliminando…" : "eliminar definitivamente"}
          </button>
        </div>
      </div>
    </div>
  );
}

type ProjectModalProps = Readonly<{
  project: ProjectItem | null;
  onClose: () => void;
  onSaved: (p: ProjectItem) => void;
}>;

function ProjectModal({ project, onClose, onSaved }: ProjectModalProps) {
  const isEdit = project !== null;
  const wasPrivate = project?.is_private ?? false;
  const [name, setName] = useState(project?.name ?? "");
  const [slug, setSlug] = useState(project?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(isEdit);
  const [description, setDescription] = useState(project?.description ?? "");
  const [icon, setIcon] = useState(project?.icon ?? "");
  const [isActive, setIsActive] = useState(project?.is_active ?? true);
  const [isPrivate, setIsPrivate] = useState(wasPrivate);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  // Sub-form "cambiar contraseña" (solo si el proyecto ya es privado).
  const [changingPw, setChangingPw] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [newPwConfirm, setNewPwConfirm] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveSlug = slugTouched ? slug : slugify(name);

  // Se pide contraseña nueva en el form principal al crear un proyecto privado o
  // al pasar uno abierto a privado. Si ya era privado y sigue privado, la clave
  // se cambia con el botón dedicado (endpoint change-password).
  const needsNewPassword = isPrivate && !wasPrivate;
  const passwordOk =
    !needsNewPassword ||
    (password.length >= 8 && password === passwordConfirm);
  const canSubmit =
    name.trim().length >= 1 &&
    effectiveSlug.length >= 1 &&
    passwordOk &&
    !submitting;

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      // Parte de privacidad del payload según la transición.
      let privacy: Record<string, unknown> = {};
      if (!isEdit) {
        privacy = isPrivate
          ? { is_private: true, password }
          : { is_private: false };
      } else if (!wasPrivate && isPrivate) {
        privacy = { is_private: true, password };
      } else if (wasPrivate && !isPrivate) {
        privacy = { is_private: false };
      }
      const payload = {
        name: name.trim(),
        slug: effectiveSlug,
        description: description.trim() || null,
        icon: icon.trim() || null,
        ...(isEdit ? { is_active: isActive } : {}),
        ...privacy,
      };
      const res = await fetch(
        isEdit ? `/api/admin/projects/${project.id}` : "/api/admin/projects",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = (await res.json()) as
        | { project: ProjectItem }
        | { error: string; message?: string };
      if (!res.ok || "error" in data) {
        const msg = "message" in data && data.message ? data.message : "no_guardado";
        setError(msg);
        setSubmitting(false);
        return;
      }
      showToast({
        title: isEdit ? "PROYECTO ACTUALIZADO" : "PROYECTO CREADO",
        msg: `"${data.project.name}" guardado.`,
        color: "var(--ok)",
      });
      onSaved(data.project);
    } catch {
      setError("network_error");
      setSubmitting(false);
    }
  }

  // Reset de contraseña de un proyecto ya privado. NO pide la anterior
  // (mecanismo de recuperación) y hace gate_version++ en el server → invalida
  // los accesos vigentes.
  async function submitPasswordChange() {
    if (!project || newPw.length < 8 || newPw !== newPwConfirm) return;
    setPwBusy(true);
    try {
      const res = await fetch(
        `/api/admin/projects/${project.id}/change-password`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ new_password: newPw }),
        },
      );
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { message?: string };
        showToast({
          title: "ERROR",
          msg: d.message ?? "no se pudo cambiar la contraseña",
          color: "var(--danger)",
        });
        setPwBusy(false);
        return;
      }
      showToast({
        title: "CONTRASEÑA ACTUALIZADA",
        msg: "Los accesos vigentes van a pedir la nueva contraseña.",
        color: "var(--ok)",
      });
      setChangingPw(false);
      setNewPw("");
      setNewPwConfirm("");
      setPwBusy(false);
    } catch {
      showToast({ title: "ERROR", msg: "error de red", color: "var(--danger)" });
      setPwBusy(false);
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
          maxWidth: 480,
        }}
      >
        <div className="t-eyebrow" style={{ marginBottom: 8 }}>
          ↳ {isEdit ? "EDITAR PROYECTO" : "NUEVO PROYECTO"}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Field label="NOMBRE">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Reframes"
              style={inputStyle}
              autoFocus
            />
          </Field>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <Field label="SLUG">
                <input
                  type="text"
                  value={effectiveSlug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setSlug(slugify(e.target.value));
                  }}
                  placeholder="reframes"
                  style={inputStyle}
                />
              </Field>
            </div>
            <div style={{ width: 90 }}>
              <Field label="ICONO">
                <input
                  type="text"
                  value={icon}
                  onChange={(e) => setIcon(e.target.value)}
                  placeholder="🎬"
                  maxLength={4}
                  style={{ ...inputStyle, textAlign: "center" }}
                />
              </Field>
            </div>
          </div>
          <Field label="DESCRIPCIÓN">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="¿Para qué sirve este proyecto?"
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </Field>
          {/* ── Privacidad (migration 0016) ── */}
          <div>
            <span
              className="t-eyebrow"
              style={{ display: "block", marginBottom: 6 }}
            >
              ACCESO
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                className={isPrivate ? "btn sm secondary" : "btn sm"}
                onClick={() => setIsPrivate(false)}
              >
                Abierto
              </button>
              <button
                type="button"
                className={isPrivate ? "btn sm" : "btn sm secondary"}
                onClick={() => setIsPrivate(true)}
              >
                🔒 Privado
              </button>
            </div>
            <div
              className="t-meta dim"
              style={{ fontSize: 11, marginTop: 6, lineHeight: 1.5 }}
            >
              {isPrivate
                ? "Solo quien tenga la contraseña ve el contenido. El nombre sigue visible para todo el estudio."
                : "Visible para todo el estudio (como hoy)."}
            </div>
          </div>

          {needsNewPassword && (
            <>
              <Field label="CONTRASEÑA (MÍN. 8)">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={inputStyle}
                />
              </Field>
              <Field label="CONFIRMAR CONTRASEÑA">
                <input
                  type="password"
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  style={inputStyle}
                />
              </Field>
              {password.length > 0 && password.length < 8 && (
                <div className="t-meta" style={{ color: "var(--warn)" }}>
                  ↳ mínimo 8 caracteres
                </div>
              )}
              {passwordConfirm.length > 0 && password !== passwordConfirm && (
                <div className="t-meta" style={{ color: "var(--warn)" }}>
                  ↳ las contraseñas no coinciden
                </div>
              )}
            </>
          )}

          {isEdit && wasPrivate && !isPrivate && (
            <div
              className="t-meta"
              style={{ color: "var(--warn)", lineHeight: 1.5 }}
            >
              ⚠️ Al guardar, el proyecto va a quedar visible para todo el estudio
              y se van a invalidar los accesos vigentes.
            </div>
          )}

          {isEdit && wasPrivate && isPrivate && (
            <div style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
              {!changingPw ? (
                <button
                  type="button"
                  className="btn sm secondary"
                  onClick={() => setChangingPw(true)}
                >
                  cambiar contraseña
                </button>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <Field label="NUEVA CONTRASEÑA (MÍN. 8)">
                    <input
                      type="password"
                      value={newPw}
                      onChange={(e) => setNewPw(e.target.value)}
                      style={inputStyle}
                      autoFocus
                    />
                  </Field>
                  <Field label="CONFIRMAR">
                    <input
                      type="password"
                      value={newPwConfirm}
                      onChange={(e) => setNewPwConfirm(e.target.value)}
                      style={inputStyle}
                    />
                  </Field>
                  <div
                    className="t-meta dim"
                    style={{ fontSize: 11, lineHeight: 1.5 }}
                  >
                    Como administrador podés resetear esta contraseña sin conocer
                    la anterior. Los accesos vigentes van a pedir la nueva.
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      className="btn sm secondary"
                      onClick={() => {
                        setChangingPw(false);
                        setNewPw("");
                        setNewPwConfirm("");
                      }}
                      disabled={pwBusy}
                    >
                      cancelar
                    </button>
                    <button
                      type="button"
                      className="btn sm"
                      disabled={
                        pwBusy || newPw.length < 8 || newPw !== newPwConfirm
                      }
                      onClick={submitPasswordChange}
                    >
                      {pwBusy ? "guardando…" : "actualizar contraseña"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {isEdit && (
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              <span className="t-meta">proyecto activo</span>
            </label>
          )}
        </div>

        {error && (
          <div className="t-meta" style={{ color: "var(--danger)", marginTop: 12 }}>
            ↳ {error}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
          <button type="button" className="btn secondary" onClick={onClose} disabled={submitting}>
            cancelar
          </button>
          <button type="button" className="btn" onClick={submit} disabled={!canSubmit}>
            {submitting ? "guardando…" : isEdit ? "guardar →" : "crear →"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <label style={{ display: "block" }}>
      <span className="t-eyebrow" style={{ display: "block", marginBottom: 6 }}>
        {label}
      </span>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--bg)",
  border: "1px solid var(--line-strong)",
  borderRadius: 6,
  color: "var(--fg)",
  fontFamily: "var(--sans)",
  fontSize: 13,
  padding: "8px 10px",
  outline: "none",
};
