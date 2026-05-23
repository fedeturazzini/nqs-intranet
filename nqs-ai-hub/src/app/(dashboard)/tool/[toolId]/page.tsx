/**
 * /tool/[toolId] — Server Component que despacha a la vista correcta.
 *
 * En MVP solo Claude y 3DSky tienen vista. Cualquier otra cosa
 * (incluyendo IDs inválidos) → redirect a /hub.
 *
 * Verificamos permisos server-side antes de renderizar — si el user
 * no tiene acceso, lo mandamos al hub. El middleware/proxy igual
 * cubrió la auth básica antes.
 *
 * En Next 16 `params` viene como Promise (cambio de Next 15).
 */
import { redirect } from "next/navigation";
import { ClaudeView } from "@/components/screens/ClaudeView";
import { ThreeDSkyPlaceholder } from "@/components/screens/ThreeDSkyPlaceholder";
import { requireAuth } from "@/lib/auth/server";
import { canUseTool } from "@/lib/middleware/permissions";

export const dynamic = "force-dynamic";

type ToolPageProps = {
  params: Promise<{ toolId: string }>;
};

export default async function ToolPage({ params }: ToolPageProps) {
  const session = await requireAuth();
  const { toolId } = await params;

  // En MVP solo dos tools tienen vista operativa.
  if (toolId !== "claude" && toolId !== "3dsky") {
    redirect("/hub");
  }

  // Permisos: si no puede, lo mandamos al hub (la card va a estar
  // bloqueada igual). Admin pasa por arriba por convención del middleware.
  const perm = await canUseTool(session.userId, toolId);
  if (!perm.allowed) {
    redirect("/hub");
  }

  if (toolId === "claude") {
    return (
      <ClaudeView
        user={{ name: session.name, initials: session.initials }}
      />
    );
  }

  // toolId === "3dsky"
  return <ThreeDSkyPlaceholder />;
}
