/**
 * Pantalla full cuando el user intenta entrar a 3DSky fuera de su
 * ventana horaria.
 *
 * Server Component — recibe la schedule como prop y la describe.
 */
import Link from "next/link";
import {
  nextScheduleWindow,
  summarizeSchedule,
} from "@/lib/utils/schedule-window";
import type { ToolSchedule } from "@/types/db-aliases";

type OutsideHoursScreenProps = Readonly<{
  schedule: ToolSchedule;
}>;

export function OutsideHoursScreen({ schedule }: OutsideHoursScreenProps) {
  const summary = summarizeSchedule(schedule);
  const next = nextScheduleWindow(schedule);

  return (
    <div
      className="page"
      style={{ maxWidth: 560, margin: "0 auto", padding: "60px 32px" }}
    >
      <div className="t-eyebrow" style={{ marginBottom: 16 }}>
        ↳ FUERA DE HORARIO
      </div>
      <h1
        className="t-display"
        style={{ fontSize: 44, margin: 0, letterSpacing: "-0.01em" }}
      >
        <em style={{ fontFamily: "var(--serif)" }}>3DSky</em> no está
        disponible ahora.
      </h1>
      <p className="muted" style={{ marginTop: 16, lineHeight: 1.6 }}>
        El admin habilitó tu acceso solo en ciertos horarios.
      </p>

      <div
        style={{
          marginTop: 24,
          padding: "16px 18px",
          border: "1px solid var(--line)",
          borderRadius: 10,
          background: "var(--bg-elev)",
        }}
      >
        <div className="t-eyebrow" style={{ marginBottom: 8 }}>
          ↳ VENTANA HABILITADA
        </div>
        <div style={{ fontSize: 15, fontFamily: "var(--mono)" }}>{summary}</div>
        {next && (
          <div className="t-meta dim" style={{ marginTop: 8 }}>
            próxima: {next.humanLabel}
          </div>
        )}
      </div>

      <div style={{ marginTop: 24 }}>
        <Link href="/hub" prefetch={false} className="btn secondary">
          ← volver al hub
        </Link>
      </div>
    </div>
  );
}
