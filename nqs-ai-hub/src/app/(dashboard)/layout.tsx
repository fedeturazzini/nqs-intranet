/**
 * Layout del grupo `(dashboard)` — envuelve `/hub`, `/admin`, `/tool/[id]`.
 *
 * Server Component. Si no hay sesión, redirige a /login (defensa en
 * profundidad: el proxy también lo hace, pero acá garantizamos que
 * cualquier render dentro del layout tiene `Session` válido).
 *
 * Estructura:
 *   <div class="app">
 *     <Topbar />              ← logo + nav + user chip
 *     <Marquee />              ← 6 frases del manifesto
 *     {children}                ← cada page del segment
 *     <Toast />                 ← portal global (Zustand)
 *   </div>
 */
import { Marquee } from "@/components/ui/Marquee";
import { Toast } from "@/components/ui/Toast";
import { Topbar } from "@/components/ui/Topbar";
import { requireAuth } from "@/lib/auth/server";
import { canUseTool } from "@/lib/middleware/permissions";

const MARQUEE_ITEMS = [
  "ONE KEY · EVERY TOOL",
  "DIRIGIDO, NO GENERADO",
  "DESPLEGÁ IA EN MINUTOS",
  "DUEÑOS DE TU STACK",
  "NQS · AI HUB",
  "BUILT IN ARGENTINA",
] as const;

// `pendingCount` post-MVP — cuando exista el módulo de aprobaciones,
// resolvemos acá la query y lo pasamos al Topbar para el badge.
const PENDING_COUNT_PLACEHOLDER = 0;

type DashboardLayoutProps = Readonly<{
  children: React.ReactNode;
}>;

export default async function DashboardLayout({
  children,
}: DashboardLayoutProps) {
  const session = await requireAuth();

  // El item "Tutoriales" del navbar solo se muestra si el user tiene acceso
  // (los admins lo bypassean en canUseTool → siempre lo ven).
  const tutorialesPerm = await canUseTool(session.userId, "tutoriales");

  return (
    <div className="app">
      <Topbar
        user={{
          name: session.name,
          initials: session.initials,
          role: session.role,
          theme: session.theme,
        }}
        pendingCount={PENDING_COUNT_PLACEHOLDER}
        hasTutoriales={tutorialesPerm.allowed}
      />
      <Marquee items={MARQUEE_ITEMS} />
      {children}
      <Toast />
    </div>
  );
}
