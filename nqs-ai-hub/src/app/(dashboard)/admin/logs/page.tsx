/**
 * /admin/logs — Auditoría combinada con filtros UI.
 *
 * Server Component pre-carga users + tools (chico, no paginado) para
 * que el `<LogsFilters />` tenga los pickers populados desde el primer
 * render sin un fetch adicional.
 */
import { Suspense } from "react";
import { LogsBoard } from "@/components/admin/LogsBoard";
import { createServerClient } from "@/lib/db/supabase";

export const dynamic = "force-dynamic";

async function loadPickerData() {
  const db = createServerClient();
  const [usersRes, toolsRes] = await Promise.all([
    db
      .from("users")
      .select("id, name, initials")
      .order("name", { ascending: true }),
    db.from("tools").select("id, name").order("name", { ascending: true }),
  ]);
  return {
    users: usersRes.data ?? [],
    tools: toolsRes.data ?? [],
  };
}

export default async function AdminLogsPage() {
  const picker = await loadPickerData();
  return (
    <div className="page" style={{ padding: 32 }}>
      <div className="t-eyebrow" style={{ marginBottom: 14 }}>
        ↳ ADMIN · LOGS
      </div>
      <h1
        className="page-title"
        style={{ fontSize: 28, margin: 0, letterSpacing: "-0.01em" }}
      >
        Auditoría
      </h1>
      <p className="muted" style={{ marginTop: 6, marginBottom: 16 }}>
        Quién hizo qué, cuándo, con qué tool. Filtros sincronizados con la URL —
        copiá el link para compartir una vista filtrada.
      </p>
      {/* `useSearchParams` adentro de LogsBoard requiere Suspense. */}
      <Suspense fallback={null}>
        <LogsBoard users={picker.users} tools={picker.tools} />
      </Suspense>
    </div>
  );
}
