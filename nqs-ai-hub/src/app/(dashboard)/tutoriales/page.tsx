/**
 * /tutoriales — grid de recorridos (S18). Replica el TutorialsScreen del
 * cliente. Visible para todos los users logueados (sin gate de acceso).
 *
 * Cada card linkea a /tutoriales/[id], que embebe el HTML en un iframe.
 */
import Link from "next/link";
import { requireAuth } from "@/lib/auth/server";
import { canUseTool } from "@/lib/middleware/permissions";
import { TutorialesGate } from "@/components/screens/TutorialesGate";
import { TUTORIALS } from "@/lib/constants/tutorials";

export const dynamic = "force-dynamic";

export default async function TutorialesPage() {
  const session = await requireAuth();

  // Acceso gestionado vía tool_access (sesión auxiliar). Sin acceso → gate.
  const perm = await canUseTool(session.userId, "tutoriales");
  if (!perm.allowed) return <TutorialesGate />;

  return (
    <div className="page" style={{ padding: 32 }}>
      <div className="page-hd">
        <div>
          <div className="t-eyebrow" style={{ marginBottom: 18 }}>
            ↳ TUTORIALES NQS
          </div>
          <h1 className="page-title">
            Cómo usamos <em>cada herramienta</em>, acá adentro.
          </h1>
          <div className="page-sub">
            Recorridos cortos, hechos por el equipo. No "qué es Claude" — es{" "}
            <em style={{ color: "var(--accent)" }}>cómo lo usamos en NQS.</em>
          </div>
        </div>
        <div className="page-meta">
          <div>RECORRIDOS</div>
          <strong>{TUTORIALS.length}</strong>
        </div>
      </div>

      <div className="t-eyebrow" style={{ marginBottom: 14 }}>
        ↳ HOW-TO
      </div>
      <div className="tut-grid">
        {TUTORIALS.map((tu) => (
          <Link
            key={tu.id}
            href={`/tutoriales/${tu.id}`}
            prefetch={false}
            className="tut-card"
            style={{ ["--tut-color" as string]: tu.color }}
          >
            <div className="tut-card-thumb">
              <span className="tut-card-glyph" style={{ color: tu.color }}>
                {tu.glyph}
              </span>
              <span className="tut-card-dur">{tu.duration}</span>
            </div>
            <div className="tut-card-body">
              <div className="t-eyebrow">↳ HOW-TO</div>
              <div className="tut-card-title">{tu.name}</div>
              <div className="tut-card-lead">{tu.lead}</div>
              <div className="tut-card-foot">
                <div
                  className="row"
                  style={{ gap: 6, flexWrap: "wrap", display: "flex" }}
                >
                  {tu.tools.map((tool) => (
                    <span key={tool} className="tag tut-tool-tag">
                      {tool}
                    </span>
                  ))}
                </div>
                <span className="t-meta dim">act. {tu.updated}</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
