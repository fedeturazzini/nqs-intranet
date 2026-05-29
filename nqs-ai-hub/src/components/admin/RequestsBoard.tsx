"use client";

/**
 * Tablero de solicitudes con tabs filtro + cards accionables.
 */
import { useMemo, useState } from "react";
import { showToast } from "@/lib/store/toast";

type RequestType = "credits" | "access" | "exceptional_access";

type RequestRow = {
  id: string;
  user_id: string;
  tool_id: string;
  credits_requested: number | null;
  exceptional_duration_minutes: number | null;
  // El CHECK constraint en DB asegura que es uno de los 3 valores;
  // el autogen lo tipa como `string`. La validación a runtime la
  // hacemos al leer (con `as RequestType` cuando lo precisamos).
  request_type: string | null;
  reason: string | null;
  status: "pending" | "approved" | "rejected" | "expired" | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string | null;
  users: { name: string; initials: string; dept: string | null } | null;
  tools: { name: string; color: string | null; glyph: string | null } | null;
};

type Tab = "pending" | "approved" | "rejected" | "all";
type KindFilter = "all" | RequestType;

type RequestsBoardProps = Readonly<{
  initialRequests: RequestRow[];
}>;

const RELATIVE = new Intl.RelativeTimeFormat("es", { numeric: "auto" });
function fmtRelative(iso: string | null): string {
  if (!iso) return "—";
  const diffMin = Math.round(
    (new Date(iso).getTime() - Date.now()) / 60_000,
  );
  if (Math.abs(diffMin) < 60) return RELATIVE.format(diffMin, "minute");
  const diffH = Math.round(diffMin / 60);
  if (Math.abs(diffH) < 48) return RELATIVE.format(diffH, "hour");
  return RELATIVE.format(Math.round(diffH / 24), "day");
}

export function RequestsBoard({ initialRequests }: RequestsBoardProps) {
  const [requests, setRequests] = useState(initialRequests);
  const [tab, setTab] = useState<Tab>("pending");
  const [kind, setKind] = useState<KindFilter>("all");

  const counts = useMemo(() => {
    const c = { pending: 0, approved: 0, rejected: 0, all: requests.length };
    for (const r of requests) {
      if (r.status === "pending") c.pending++;
      else if (r.status === "approved") c.approved++;
      else if (r.status === "rejected") c.rejected++;
    }
    return c;
  }, [requests]);

  const kindCounts = useMemo(() => {
    const c = { credits: 0, access: 0, exceptional_access: 0 };
    for (const r of requests) {
      const t = (r.request_type ?? "credits") as RequestType;
      if (t in c) c[t]++;
    }
    return c;
  }, [requests]);

  const filtered = useMemo(() => {
    return requests.filter((r) => {
      const statusOk = tab === "all" || r.status === tab;
      const typeOk =
        kind === "all" || (r.request_type ?? "credits") === kind;
      return statusOk && typeOk;
    });
  }, [requests, tab, kind]);

  async function refresh() {
    try {
      const res = await fetch("/api/admin/requests?limit=200", {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as { requests: RequestRow[] };
      setRequests(data.requests);
    } catch {
      // silent
    }
  }

  async function approve(r: RequestRow) {
    const res = await fetch(`/api/admin/requests/${r.id}/approve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    if (res.ok) {
      showToast({
        title: "APROBADO",
        msg: `${r.users?.name ?? "user"} recibió +${r.credits_requested ?? 0} créditos de ${r.tools?.name ?? r.tool_id}.`,
        color: "var(--ok)",
      });
      await refresh();
    } else {
      const body = (await res.json().catch(() => ({}))) as {
        message?: string;
      };
      showToast({
        title: "ERROR",
        msg: body.message ?? "no se pudo aprobar",
        color: "var(--danger)",
      });
    }
  }

  async function reject(r: RequestRow, note: string) {
    const res = await fetch(`/api/admin/requests/${r.id}/reject`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ note: note.trim() || undefined }),
    });
    if (res.ok) {
      showToast({
        title: "RECHAZADO",
        msg: `Solicitud de ${r.users?.name ?? "user"} marcada como rechazada.`,
        color: "var(--warn)",
      });
      await refresh();
    } else {
      showToast({
        title: "ERROR",
        msg: "no se pudo rechazar",
        color: "var(--danger)",
      });
    }
  }

  return (
    <>
      <div style={tabsStyle}>
        <Tab
          label={`pendientes · ${counts.pending}`}
          active={tab === "pending"}
          onClick={() => setTab("pending")}
        />
        <Tab
          label={`aprobadas · ${counts.approved}`}
          active={tab === "approved"}
          onClick={() => setTab("approved")}
        />
        <Tab
          label={`rechazadas · ${counts.rejected}`}
          active={tab === "rejected"}
          onClick={() => setTab("rejected")}
        />
        <Tab
          label={`todas · ${counts.all}`}
          active={tab === "all"}
          onClick={() => setTab("all")}
        />
      </div>

      {/* Sub-filtro por tipo de solicitud */}
      <div
        style={{
          display: "flex",
          gap: 6,
          marginTop: 14,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <span
          className="t-meta dim"
          style={{ fontSize: 10, marginRight: 4 }}
        >
          ↳ TIPO:
        </span>
        <KindChip
          label={`todos · ${counts.all}`}
          active={kind === "all"}
          onClick={() => setKind("all")}
          color={null}
        />
        <KindChip
          label={`créditos · ${kindCounts.credits}`}
          active={kind === "credits"}
          onClick={() => setKind("credits")}
          color="var(--accent)"
        />
        <KindChip
          label={`acceso · ${kindCounts.access}`}
          active={kind === "access"}
          onClick={() => setKind("access")}
          color="#5BC0EB"
        />
        <KindChip
          label={`⏰ excepcional · ${kindCounts.exceptional_access}`}
          active={kind === "exceptional_access"}
          onClick={() => setKind("exceptional_access")}
          color="#FF8A3D"
        />
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          marginTop: 16,
        }}
      >
        {filtered.length === 0 && (
          <div
            className="t-meta dim"
            style={{ padding: "40px 0", textAlign: "center" }}
          >
            ↳ no hay solicitudes en {tab === "all" ? "el sistema" : tab}
          </div>
        )}
        {filtered.map((r) => (
          <RequestCard
            key={r.id}
            req={r}
            onApprove={() => approve(r)}
            onReject={(note) => reject(r, note)}
          />
        ))}
      </div>
    </>
  );
}

type RequestCardProps = Readonly<{
  req: RequestRow;
  onApprove: () => void;
  onReject: (note: string) => void;
}>;

function RequestCard({ req, onApprove, onReject }: RequestCardProps) {
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const status = req.status ?? "pending";
  const reqType = (req.request_type ?? "credits") as RequestType;
  const isExceptional = reqType === "exceptional_access";
  const isAccess = reqType === "access";

  // Color + label del badge según el tipo de solicitud.
  const typeBadge =
    reqType === "exceptional_access"
      ? { color: "#FF8A3D", bg: "rgba(255,138,61,0.10)", label: "⏰ acceso excepcional" }
      : reqType === "access"
        ? { color: "#5BC0EB", bg: "rgba(91,192,235,0.10)", label: "acceso a tool" }
        : { color: "var(--accent-fg)", bg: "var(--accent)", label: "créditos" };

  // Texto principal del "qué pidió" según el tipo.
  let askedLabel: string;
  if (isExceptional) {
    const mins = req.exceptional_duration_minutes ?? 0;
    askedLabel =
      mins >= 60 && mins % 60 === 0
        ? `${mins / 60}h fuera de horario`
        : `${mins} min fuera de horario`;
  } else if (isAccess) {
    askedLabel = "acceso a la tool";
  } else {
    askedLabel = `+${req.credits_requested ?? 0} créditos`;
  }

  return (
    <div
      style={{
        border: isExceptional
          ? "1px solid rgba(255,138,61,0.32)"
          : "1px solid var(--line)",
        borderLeft: isExceptional
          ? "3px solid #FF8A3D"
          : isAccess
            ? "3px solid #5BC0EB"
            : "1px solid var(--line)",
        borderRadius: 10,
        padding: 16,
        background: "var(--bg-elev)",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div className="av" style={{ width: 28, height: 28, fontSize: 11 }}>
            {req.users?.initials ?? "?"}
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 500 }}>
              {req.users?.name ?? "user borrado"}
            </div>
            <div className="t-meta dim" style={{ fontSize: 10 }}>
              {req.users?.dept ?? "—"} · {fmtRelative(req.created_at)}
            </div>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              color: req.tools?.color ?? "var(--fg)",
              fontFamily: "var(--serif)",
              fontStyle: "italic",
              fontSize: 16,
            }}
          >
            {req.tools?.glyph ?? "◇"}
          </span>
          <span style={{ fontSize: 13 }}>
            {req.tools?.name ?? req.tool_id}
          </span>
          <span
            className="tag"
            style={{
              padding: "2px 8px",
              background: typeBadge.bg,
              color: typeBadge.color,
              border: isExceptional || isAccess
                ? `1px solid ${typeBadge.color}`
                : undefined,
            }}
          >
            {typeBadge.label}
          </span>
          <span
            className="tag"
            style={{
              padding: "2px 8px",
              fontFamily: "var(--mono)",
              fontSize: 10,
            }}
          >
            {askedLabel}
          </span>
          {status !== "pending" && (
            <span
              className={`tag ${status === "approved" ? "ok" : "danger"}`}
              style={{ padding: "2px 8px" }}
            >
              {status}
            </span>
          )}
        </div>
      </div>

      {req.reason && (
        <blockquote
          style={{
            margin: 0,
            paddingLeft: 12,
            borderLeft: "2px solid var(--line-strong)",
            color: "var(--fg-mute)",
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          {req.reason}
        </blockquote>
      )}

      {req.review_note && (
        <div
          className="t-meta dim"
          style={{ fontStyle: "italic", fontSize: 11 }}
        >
          nota del admin: {req.review_note}
        </div>
      )}

      {status === "pending" && (
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            marginTop: 4,
          }}
        >
          <button
            type="button"
            className="btn secondary"
            onClick={() => setRejectOpen((v) => !v)}
            style={{ color: "var(--danger)" }}
          >
            rechazar
          </button>
          <button type="button" className="btn" onClick={onApprove}>
            {isAccess
              ? "aprobar y habilitar →"
              : isExceptional
                ? "aprobar acceso →"
                : `aprobar +${req.credits_requested ?? 0} →`}
          </button>
        </div>
      )}

      {rejectOpen && (
        <div
          style={{
            borderTop: "1px solid var(--line)",
            paddingTop: 12,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div className="t-eyebrow">↳ MOTIVO DEL RECHAZO (OPCIONAL)</div>
          <textarea
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
            rows={2}
            placeholder="ej: ya tenés créditos disponibles, hablemos antes"
            style={{
              width: "100%",
              background: "var(--bg)",
              border: "1px solid var(--line-strong)",
              borderRadius: 6,
              color: "var(--fg)",
              fontFamily: "var(--sans)",
              fontSize: 12,
              padding: "8px 10px",
              outline: "none",
              resize: "vertical",
            }}
          />
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
            }}
          >
            <button
              type="button"
              className="btn secondary"
              onClick={() => {
                setRejectOpen(false);
                setRejectNote("");
              }}
            >
              cancelar
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                onReject(rejectNote);
                setRejectOpen(false);
                setRejectNote("");
              }}
              style={{ background: "var(--danger)", color: "white" }}
            >
              confirmar rechazo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Tab({
  label,
  active,
  onClick,
}: Readonly<{ label: string; active: boolean; onClick: () => void }>) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="t-meta"
      style={{
        padding: "8px 14px",
        background: "transparent",
        border: 0,
        borderBottom: active
          ? "2px solid var(--accent)"
          : "2px solid transparent",
        color: active ? "var(--fg)" : "var(--fg-mute)",
        cursor: "pointer",
        fontSize: 11,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
      }}
    >
      {label}
    </button>
  );
}

function KindChip({
  label,
  active,
  onClick,
  color,
}: Readonly<{
  label: string;
  active: boolean;
  onClick: () => void;
  color: string | null;
}>) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "4px 10px",
        border: `1px solid ${active ? (color ?? "var(--accent)") : "var(--line)"}`,
        borderRadius: 999,
        background: active && color ? `${color}22` : "transparent",
        color: active ? "var(--fg)" : "var(--fg-mute)",
        cursor: "pointer",
        fontSize: 10,
        fontFamily: "var(--mono)",
        letterSpacing: "0.06em",
        textTransform: "uppercase",
      }}
    >
      {label}
    </button>
  );
}

const tabsStyle: React.CSSProperties = {
  display: "flex",
  gap: 4,
  borderBottom: "1px solid var(--line)",
};
