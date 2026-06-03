/**
 * /tutoriales/[id] — vista de un tutorial (S18). Header + iframe con el HTML
 * estático del cliente servido desde /public/tutorials/.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth/server";
import { getTutorial } from "@/lib/constants/tutorials";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function TutorialPage({ params }: PageProps) {
  await requireAuth();
  const { id } = await params;
  const tu = getTutorial(id);
  if (!tu) notFound();

  return (
    <div className="page" style={{ padding: "0 32px 24px" }}>
      <div
        className="row"
        style={{
          justifyContent: "space-between",
          padding: "16px 0 18px",
          borderBottom: "1px solid var(--line)",
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div className="row" style={{ gap: 14, display: "flex", alignItems: "center" }}>
          <Link href="/tutoriales" prefetch={false} className="btn secondary sm">
            ← volver
          </Link>
          <div>
            <div className="t-eyebrow">↳ TUTORIAL</div>
            <div
              style={{
                fontFamily: "var(--serif)",
                fontStyle: "italic",
                fontSize: 22,
                letterSpacing: "-0.01em",
              }}
            >
              {tu.name}
            </div>
          </div>
        </div>
        <div
          className="row"
          style={{ gap: 14, display: "flex", alignItems: "center", flexWrap: "wrap" }}
        >
          <span className="t-meta">{tu.duration}</span>
          <span className="t-meta dim">·</span>
          <span className="t-meta">cubre: {tu.tools.join(" · ")}</span>
          <span className="t-meta dim">·</span>
          <span className="t-meta">act. {tu.updated}</span>
        </div>
      </div>

      <div
        style={{
          marginTop: 14,
          border: "1px solid var(--line)",
          borderRadius: 14,
          overflow: "hidden",
          background: "#000",
          height: "calc(100vh - 60px - 38px - 120px)",
          minHeight: 540,
        }}
      >
        <iframe
          src={tu.file}
          title={tu.name}
          style={{ width: "100%", height: "100%", border: 0, display: "block" }}
          allow="autoplay; fullscreen"
        />
      </div>
    </div>
  );
}
