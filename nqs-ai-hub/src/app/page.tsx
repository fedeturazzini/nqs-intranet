import { NqsLogo } from "@/components/ui/NqsLogo";
import { Marquee } from "@/components/ui/Marquee";

const MARQUEE_ITEMS = [
  "NQS AI HUB · LOADING…",
  "STACK PROPIO · CEREBRO PROTEGIDO",
  "CLAUDE · WEAVY · KLING · RUNWAY · ELEVENLABS",
  "NEXT LAYER · NQS STUDIO",
] as const;

export default function HomePage() {
  return (
    <>
      <Marquee items={MARQUEE_ITEMS} />
      <main className="grow center fade-in" style={{ padding: "80px 24px" }}>
        <div
          className="col"
          style={{ alignItems: "center", gap: 28, textAlign: "center" }}
        >
          <NqsLogo size={96} variant="wide" />
          <div className="t-eyebrow">nqs · ai hub</div>
          <h1
            className="t-display"
            style={{ fontSize: 64, maxWidth: 720, margin: 0 }}
          >
            setup completo.
          </h1>
          <p className="muted" style={{ maxWidth: 520, margin: 0 }}>
            Esqueleto del proyecto listo. Próximo paso:{" "}
            <span className="mono">prompts/mvp/02-database.md</span>.
          </p>
        </div>
      </main>
    </>
  );
}
