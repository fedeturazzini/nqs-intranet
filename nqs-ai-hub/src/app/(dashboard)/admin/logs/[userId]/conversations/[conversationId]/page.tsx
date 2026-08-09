/**
 * /admin/logs/[userId]/conversations/[conversationId]
 * Detalle read-only. Gate de Gastos obligatorio.
 * Query opcional ?message=<uuid> → scroll + highlight a ese mensaje.
 */
import { GastosPasswordGate } from "@/components/admin/GastosPasswordGate";
import { AdminConversationDetail } from "@/components/admin/AdminConversationDetail";
import { hasGastosGate } from "@/lib/auth/gastos-gate";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type PageProps = {
  params: Promise<{ userId: string; conversationId: string }>;
  searchParams: Promise<{ message?: string }>;
};

export default async function AdminConversationDetailPage({
  params,
  searchParams,
}: PageProps) {
  if (!(await hasGastosGate())) {
    return <GastosPasswordGate />;
  }

  const { userId, conversationId } = await params;
  const sp = await searchParams;
  const focusMessageId =
    sp.message && UUID_RE.test(sp.message) ? sp.message : null;

  return (
    <AdminConversationDetail
      userId={userId}
      conversationId={conversationId}
      focusMessageId={focusMessageId}
    />
  );
}
