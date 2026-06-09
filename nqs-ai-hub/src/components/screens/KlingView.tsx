"use client";

/**
 * Vista del módulo Kling para el empleado. Clon de `ThreeDSkyView` con el
 * branding de Kling y `toolId="kling"` (el hook y el modal de créditos están
 * parametrizados; pegan a `/api/tools/kling/…`).
 *
 * Mismos elementos comentados que 3DSky (FEEDBACK NQS v2.0):
 *   - SIN contador "X créditos · de Y" desglosado (la barra lo oculta igual).
 *   - SIN modal "declarar consumo" al salir (cierre silencioso con 0).
 *   - Solo botón "pedir créditos".
 */
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { CreditRequestModal } from "@/components/tool/CreditRequestModal";
import { CreditsBlockOverlay } from "@/components/tool/CreditsBlockOverlay";
import { EmbeddedSite } from "@/components/tool/EmbeddedSite";
import { ScheduleIndicator } from "@/components/tool/ScheduleIndicator";
import { ToolViewBar } from "@/components/tool/ToolViewBar";
import { useThreeDSkySession } from "@/lib/hooks/useThreeDSkySession";
import { showToast } from "@/lib/store/toast";
import type { ToolSchedule } from "@/types/db-aliases";

const KLING_COLOR = "#5BC0EB";
const KLING_GLYPH = "▷";

type KlingViewProps = Readonly<{
  embedUrl: string;
  initialCredits: { credits: number; creditsTotal: number; used: number };
  schedule: ToolSchedule | null;
}>;

export function KlingView({
  embedUrl,
  initialCredits,
  schedule,
}: KlingViewProps) {
  const router = useRouter();
  const chat = useThreeDSkySession(initialCredits, "kling");
  const [requestOpen, setRequestOpen] = useState(false);

  // Cierre silencioso (declared=0). El beacon de unmount del hook cubre el
  // caso "cerró la tab".
  const leaveToHub = useCallback(async () => {
    await chat.declareAndEnd(0);
    router.push("/hub");
  }, [chat, router]);

  const onRequestMore = useCallback(() => {
    setRequestOpen(true);
  }, []);

  const onRequestSubmitted = useCallback((requestId: string) => {
    setRequestOpen(false);
    showToast({
      title: "SOLICITUD ENVIADA",
      msg: `Pedido ${requestId.slice(0, 8)}… mandado. El admin recibe una notificación por Slack.`,
      color: "var(--ok)",
    });
  }, []);

  const noCredits = chat.credits.credits <= 0;

  return (
    <div
      className="threedsky-mock"
      style={{
        height: "calc(100vh - 60px - 38px)",
        display: "flex",
        flexDirection: "column",
        background: "var(--bg)",
      }}
    >
      <ToolViewBar
        toolName="Kling"
        toolGlyph={KLING_GLYPH}
        toolColor={KLING_COLOR}
        vendorHost="kling.ai"
        credits={{
          left: chat.credits.credits,
          total: chat.credits.creditsTotal,
          warnAt: 5,
        }}
        onBack={leaveToHub}
        onRequestMore={onRequestMore}
      />

      <ScheduleIndicator schedule={schedule} />

      {/* Iframe + overlay si se quedó sin créditos */}
      <div
        style={{
          position: "relative",
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <EmbeddedSite
          url={embedUrl}
          title="Kling"
          brandColor={KLING_COLOR}
          brandGlyph={KLING_GLYPH}
        />
        {noCredits && (
          <CreditsBlockOverlay
            onRequestMore={onRequestMore}
            onBackToHub={() => router.push("/hub")}
          />
        )}
      </div>

      <CreditRequestModal
        open={requestOpen}
        currentCredits={chat.credits.credits}
        toolId="kling"
        toolLabel="KLING"
        onClose={() => setRequestOpen(false)}
        onSubmitted={onRequestSubmitted}
      />
    </div>
  );
}
