/**
 * /hub — catálogo del workspace.
 *
 * Server Component: resuelve sesión + tools-con-acceso desde la DB,
 * pasa todo prerendered al `HubScreen` (Client). Sin fetch HTTP entre
 * server y client — query directa en el mismo proceso.
 */
import { HubScreen } from "@/components/screens/HubScreen";
import { requireAuth } from "@/lib/auth/server";
import { listToolsWithAccess } from "@/lib/db/queries/access";

export const dynamic = "force-dynamic";

export default async function HubPage() {
  const session = await requireAuth();

  // FIX 17.5: el hub NO obliga a elegir proyecto. Los proyectos son un
  // concepto exclusivo de Claude — la selección se hace al entrar a
  // /tool/claude, no al login. Acá mostramos todas las tools como siempre.
  const tools = await listToolsWithAccess(session.userId);
  const firstName = session.name.split(" ")[0] ?? session.name;

  return <HubScreen tools={tools} userFirstName={firstName} />;
}
