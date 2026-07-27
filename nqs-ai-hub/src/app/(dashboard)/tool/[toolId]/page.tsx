/**
 * /tool/[toolId] — Server Component dispatcher de tools sin ruta propia.
 *
 * En MVP `/tool/3dsky/page.tsx` es una ruta estática dedicada (la
 * sesión 09 le dio su propia view), así que esta dispatcher solo ve:
 *   - claude → renderea ClaudeView.
 *   - cualquier otro id (válido o no) → redirect a /hub.
 *
 * Si en el futuro sumamos más tools con vista propia, crear su
 * /tool/<id>/page.tsx (estático) y dejar este dispatcher para tools
 * sin vista todavía.
 *
 * En Next 16 `params` viene como Promise.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ClaudeView } from "@/components/screens/ClaudeView";
import { requireAuth } from "@/lib/auth/server";
import { canUseTool } from "@/lib/middleware/permissions";
import {
  hasProjectGate,
  projectGateCookieName,
  verifyProjectGateToken,
} from "@/lib/auth/project-gate";
import {
  getActiveProjectForUser,
  listActiveProjects,
} from "@/lib/db/queries/projects";

export const dynamic = "force-dynamic";

type ToolPageProps = {
  params: Promise<{ toolId: string }>;
};

export default async function ToolPage({ params }: ToolPageProps) {
  const session = await requireAuth();
  const { toolId } = await params;

  if (toolId !== "claude") {
    redirect("/hub");
  }

  const perm = await canUseTool(session.userId, toolId);
  if (!perm.allowed) {
    redirect("/hub");
  }

  // FIX 17.5: la selección de proyecto se hace acá (no al login). Si el
  // user no tiene proyecto activo, ClaudeView muestra el picker; si tiene,
  // entra directo al chat con el selector siempre visible.
  const [projects, activeProject] = await Promise.all([
    listActiveProjects(),
    getActiveProjectForUser(session.userId),
  ]);

  // Gate de proyecto privado (migration 0016): NO forzamos el gate al entrar a
  // Claude. Si el proyecto activo es privado y está bloqueado, lo tratamos como
  // "sin proyecto activo" → ClaudeView muestra el picker y la contraseña se pide
  // (modal) SOLO si el user elige ese proyecto. Así apretar Claude no obliga a
  // desbloquear un privado que quizás no querés abrir. El backend (adapter) igual
  // revalida el gate en cada execute, así que no cargar el cerebro sigue protegido.
  const activeLocked =
    !!activeProject?.is_private && !(await hasProjectGate(activeProject.id));

  // Cada proyecto privado está "locked" si no hay cookie de gate válida — así el
  // selector/picker pide la contraseña (modal) recién cuando el user elige uno
  // (usa el gate_version ya cargado, sin queries extra; no se envía al cliente).
  const cookieStore = await cookies();
  const isLocked = (p: (typeof projects)[number]): boolean =>
    p.is_private &&
    !verifyProjectGateToken(
      cookieStore.get(projectGateCookieName(p.id))?.value,
      p.id,
      p.gate_version,
    );

  return (
    <ClaudeView
      user={{ name: session.name, initials: session.initials }}
      projects={projects.map((p) => ({
        id: p.id,
        name: p.name,
        icon: p.icon,
        isPrivate: p.is_private,
        locked: isLocked(p),
      }))}
      activeProject={
        activeProject && !activeLocked
          ? {
              id: activeProject.id,
              name: activeProject.name,
              icon: activeProject.icon,
              isPrivate: activeProject.is_private,
              // Llegamos acá solo si NO está bloqueado (público o gate ya pasado).
              locked: false,
            }
          : null
      }
    />
  );
}
