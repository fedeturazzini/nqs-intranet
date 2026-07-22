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
import { ProjectPasswordGate } from "@/components/screens/ProjectPasswordGate";
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

  // Gate de proyecto privado (migration 0016): si el proyecto activo es privado
  // y no hay cookie de gate válida, mostramos el gate en vez del chat — no se
  // carga NADA del proyecto (ni cerebro ni conversaciones).
  if (activeProject?.is_private && !(await hasProjectGate(activeProject.id))) {
    return (
      <ProjectPasswordGate
        projectId={activeProject.id}
        projectName={activeProject.name}
      />
    );
  }

  // Cada proyecto privado está "locked" si no hay cookie de gate válida — así el
  // selector in-chat pide la contraseña ANTES de entrar (usa el gate_version ya
  // cargado, sin queries extra; no se envía al cliente).
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
        activeProject
          ? {
              id: activeProject.id,
              name: activeProject.name,
              icon: activeProject.icon,
              isPrivate: activeProject.is_private,
              // Si llegamos acá, el proyecto activo ya pasó el gate SSR.
              locked: false,
            }
          : null
      }
    />
  );
}
