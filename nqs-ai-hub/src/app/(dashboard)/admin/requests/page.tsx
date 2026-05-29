/**
 * /admin/requests — Aprobar / rechazar solicitudes de créditos.
 *
 * Server Component pre-carga todo (pending, approved, rejected) y el
 * `<RequestsBoard />` cliente maneja las tabs + acciones.
 */
import { createServerClient } from "@/lib/db/supabase";
import { RequestsBoard } from "@/components/admin/RequestsBoard";

export const dynamic = "force-dynamic";

async function loadRequests() {
  const db = createServerClient();
  const { data } = await db
    .from("access_requests")
    .select(
      "id, user_id, tool_id, credits_requested, exceptional_duration_minutes, request_type, reason, status, reviewed_by, reviewed_at, review_note, created_at, users!access_requests_user_id_fkey(name, initials, dept), tools!access_requests_tool_id_fkey(name, color, glyph)",
    )
    .order("created_at", { ascending: false })
    .limit(200);
  return data ?? [];
}

export default async function AdminRequestsPage() {
  const requests = await loadRequests();
  return (
    <div className="page" style={{ padding: 32 }}>
      <div className="t-eyebrow" style={{ marginBottom: 14 }}>
        ↳ ADMIN · SOLICITUDES
      </div>
      <h1
        className="page-title"
        style={{ fontSize: 28, margin: 0, letterSpacing: "-0.01em" }}
      >
        Pedidos del equipo
      </h1>
      <p className="muted" style={{ marginTop: 6, marginBottom: 22 }}>
        Aprobá o rechazá las solicitudes de créditos pendientes.
      </p>
      <RequestsBoard initialRequests={requests} />
    </div>
  );
}
