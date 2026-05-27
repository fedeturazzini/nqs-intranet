"use client";

/**
 * Vista del módulo 3DSky para el empleado.
 *
 * Estructura (post-refactor sesión 09b — header alineado al diseño del
 * cliente con `.tool-view-bar`):
 *
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │ ← intranet  ↳ /  ◈ 3DSky · 3dsky.org   [pill] [pedir más]  │  ← ToolViewBar
 *   ├─────────────────────────────────────────────────────────────┤
 *   │ ↳ HORARIOS · Lun-Vie 09:00–18:00   · activo ahora           │  ← ScheduleIndicator (si hay schedule)
 *   ├─────────────────────────────────────────────────────────────┤
 *   │ Iframe a https://3dsky.org/es/ (preloader + fallback)       │
 *   └─────────────────────────────────────────────────────────────┘
 *
 * Modales overlay:
 *   - DeclareConsumptionPrompt al "← intranet"
 *   - CreditRequestModal cuando pide más créditos
 *   - CreditsBlockOverlay cuando credits === 0 durante la sesión
 *
 * El hook `useThreeDSkySession` se encarga del lifecycle.
 */
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { CreditRequestModal } from "@/components/tool/CreditRequestModal";
import { CreditsBlockOverlay } from "@/components/tool/CreditsBlockOverlay";
import { DeclareConsumptionPrompt } from "@/components/tool/DeclareConsumptionPrompt";
import { EmbeddedSite } from "@/components/tool/EmbeddedSite";
import { ScheduleIndicator } from "@/components/tool/ScheduleIndicator";
import { ToolViewBar } from "@/components/tool/ToolViewBar";
import { useThreeDSkySession } from "@/lib/hooks/useThreeDSkySession";
import { showToast } from "@/lib/store/toast";
import type { ToolSchedule } from "@/types/db-aliases";

type ThreeDSkyViewProps = Readonly<{
  embedUrl: string;
  initialCredits: { credits: number; creditsTotal: number; used: number };
  schedule: ToolSchedule | null;
}>;

export function ThreeDSkyView({
  embedUrl,
  initialCredits,
  schedule,
}: ThreeDSkyViewProps) {
  const router = useRouter();
  const chat = useThreeDSkySession(initialCredits);
  const [declareOpen, setDeclareOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);

  const openDeclareThenLeave = useCallback(() => {
    setDeclareOpen(true);
  }, []);

  const confirmDeclareAndLeave = useCallback(
    async (amount: number) => {
      const result = await chat.declareAndEnd(amount);
      if (!result.ok) {
        showToast({
          title: "ERROR",
          msg:
            result.error === "insufficient_credits"
              ? "No alcanzan los créditos para esa declaración."
              : result.error,
          color: "var(--danger)",
        });
        return;
      }
      if (amount > 0) {
        showToast({
          title: "CONSUMO REGISTRADO",
          msg: `Te quedan ${result.credits.credits} créditos disponibles.`,
          color: "var(--ok)",
        });
      }
      setDeclareOpen(false);
      router.push("/hub");
    },
    [chat, router],
  );

  const cancelDeclare = useCallback(() => {
    setDeclareOpen(false);
  }, []);

  const onRequestMore = useCallback(() => {
    setRequestOpen(true);
  }, []);

  const onRequestSubmitted = useCallback(
    (requestId: string) => {
      setRequestOpen(false);
      showToast({
        title: "SOLICITUD ENVIADA",
        msg: `Pedido ${requestId.slice(0, 8)}… mandado. El admin recibe una notificación por Slack.`,
        color: "var(--ok)",
      });
    },
    [],
  );

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
        toolName="3DSky"
        toolGlyph="◈"
        toolColor="#4FD1C5"
        vendorHost="3dsky.org"
        credits={{
          left: chat.credits.credits,
          total: chat.credits.creditsTotal,
          warnAt: 5,
        }}
        onBack={openDeclareThenLeave}
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
          title="3DSky"
          brandColor="#4FD1C5"
          brandGlyph="◈"
        />
        {noCredits && (
          <CreditsBlockOverlay
            onRequestMore={onRequestMore}
            onBackToHub={() => router.push("/hub")}
          />
        )}
      </div>

      <DeclareConsumptionPrompt
        open={declareOpen}
        maxAvailable={chat.credits.credits}
        isSubmitting={chat.isEnding}
        onCancel={cancelDeclare}
        onConfirm={confirmDeclareAndLeave}
      />

      <CreditRequestModal
        open={requestOpen}
        currentCredits={chat.credits.credits}
        onClose={() => setRequestOpen(false)}
        onSubmitted={onRequestSubmitted}
      />
    </div>
  );
}
