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
import { redirect } from "next/navigation";
import { ClaudeView } from "@/components/screens/ClaudeView";
import { requireAuth } from "@/lib/auth/server";
import { canUseTool } from "@/lib/middleware/permissions";

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

  return (
    <ClaudeView
      user={{ name: session.name, initials: session.initials }}
    />
  );
}
