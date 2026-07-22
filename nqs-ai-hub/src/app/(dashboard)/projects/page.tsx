/**
 * /projects — listado de proyectos del estudio.
 *
 * Server Component: trae los proyectos activos + el proyecto activo del
 * user (para marcarlo). Al clickear una card, el ProjectsScreen guarda el
 * proyecto activo y redirige a /tool/claude.
 */
import { cookies } from "next/headers";
import { ProjectsScreen } from "@/components/screens/ProjectsScreen";
import { requireAuth } from "@/lib/auth/server";
import {
  getActiveProjectId,
  listActiveProjects,
} from "@/lib/db/queries/projects";
import {
  projectGateCookieName,
  verifyProjectGateToken,
} from "@/lib/auth/project-gate";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const session = await requireAuth();
  const [projects, activeId] = await Promise.all([
    listActiveProjects(),
    getActiveProjectId(session.userId),
  ]);

  // Un proyecto privado está "locked" para este user si no tiene una cookie de
  // gate válida al gate_version actual. Lo resolvemos con el gate_version ya
  // cargado (sin queries extra); `gate_version` no se envía al cliente.
  const cookieStore = await cookies();
  const isLocked = (p: (typeof projects)[number]): boolean =>
    p.is_private &&
    !verifyProjectGateToken(
      cookieStore.get(projectGateCookieName(p.id))?.value,
      p.id,
      p.gate_version,
    );

  return (
    <ProjectsScreen
      projects={projects.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        description: p.description,
        icon: p.icon,
        updatedAt: p.updated_at,
        isPrivate: p.is_private,
        locked: isLocked(p),
      }))}
      activeProjectId={activeId}
      isAdmin={session.role === "admin"}
    />
  );
}
