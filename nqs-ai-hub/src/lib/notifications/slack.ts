/**
 * Notificaciones a Slack vía Incoming Webhook.
 *
 * Reglas:
 *   - Si `SLACK_WEBHOOK_URL` no está definida → no se manda nada y se
 *     loguea un `info` (es válido tener apagadas las notifs).
 *   - Si el POST a Slack falla (timeout, 5xx, network) → log `error`
 *     con detalle pero NO se tira excepción. Una caída de Slack NUNCA
 *     puede romper la operación principal del user.
 *
 * Server-only — la URL del webhook contiene un secreto.
 */

const SLACK_TIMEOUT_MS = 5_000;

export type SlackRequestNotification = {
  kind: "credits_request";
  userName: string;
  toolName: string;
  amount: number;
  reason: string;
  requestId: string;
  adminUrl?: string;
};

/** Solicitud de ACCESO a una tool que el user no tiene habilitada. */
export type SlackAccessRequestNotification = {
  kind: "access_request";
  userName: string;
  toolName: string;
  reason: string;
  requestId: string;
  adminUrl?: string;
};

/** Solicitud de acceso EXCEPCIONAL fuera de horario. */
export type SlackExceptionalRequestNotification = {
  kind: "exceptional_request";
  userName: string;
  toolName: string;
  durationMinutes: number;
  reason: string;
  requestId: string;
  adminUrl?: string;
};

export type SlackApprovalNotification = {
  kind: "credits_approved" | "credits_rejected";
  userName: string;
  toolName: string;
  amount?: number;
  note?: string;
  requestId: string;
  /** Admin que resolvió la solicitud (opcional). */
  adminName?: string;
};

/** Resolución (aprobar/rechazar) de una solicitud de acceso a tool. */
export type SlackAccessResolutionNotification = {
  kind: "access_approved" | "access_rejected";
  userName: string;
  toolName: string;
  adminName: string;
  note?: string;
  requestId: string;
};

export type SlackNotification =
  | SlackRequestNotification
  | SlackAccessRequestNotification
  | SlackExceptionalRequestNotification
  | SlackApprovalNotification
  | SlackAccessResolutionNotification;

/**
 * Identidad del bot en Slack (FEEDBACK NQS v2.0 5.1): nombre + logo.
 * Si `SLACK_ICON_URL` está seteada (opcional), usa esa imagen pública del
 * logo NQS; si no, cae al emoji 🟡 (large_yellow_circle, el amarillo de la
 * marca). No requiere env nueva — la variable es opcional.
 */
function slackIdentity(): {
  username: string;
  icon_url?: string;
  icon_emoji?: string;
} {
  const iconUrl = process.env.SLACK_ICON_URL?.trim();
  if (iconUrl) return { username: "NQS AI Hub", icon_url: iconUrl };
  return { username: "NQS AI Hub", icon_emoji: ":large_yellow_circle:" };
}

/**
 * Manda una notificación a Slack. Promesa resuelve siempre — el caller
 * puede `await`-earla con tranquilidad sin try/catch.
 */
export async function notifySlack(payload: SlackNotification): Promise<void> {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) {
    console.log(
      JSON.stringify({
        level: "info",
        msg: "slack notification skipped — SLACK_WEBHOOK_URL no seteada",
        kind: payload.kind,
      }),
    );
    return;
  }

  const body = { ...slackIdentity(), ...buildPayload(payload) };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SLACK_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "(no body)");
      console.error(
        JSON.stringify({
          level: "error",
          msg: "slack webhook returned non-OK",
          status: res.status,
          body: text.slice(0, 200),
          kind: payload.kind,
        }),
      );
    }
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "slack webhook POST failed",
        error: err instanceof Error ? err.message : String(err),
        kind: payload.kind,
      }),
    );
  } finally {
    clearTimeout(timer);
  }
}

// ============================================================
// Builders
// ============================================================

type SlackBlock =
  | { type: "header"; text: { type: "plain_text"; text: string } }
  | { type: "section"; text: { type: "mrkdwn"; text: string } }
  | {
      type: "section";
      fields: Array<{ type: "mrkdwn"; text: string }>;
    }
  | {
      type: "actions";
      elements: Array<{
        type: "button";
        text: { type: "plain_text"; text: string };
        url: string;
        style?: "primary" | "danger";
      }>;
    }
  | { type: "divider" };

type SlackPayload = {
  text: string;
  blocks: SlackBlock[];
};

/**
 * Formato unificado de solicitud NUEVA (FEEDBACK NQS v2.0 5.2/5.3):
 *   - `<!channel>` para pingear al canal (solo solicitudes nuevas).
 *   - header "🔔 Nueva solicitud".
 *   - dos campos: Empleado / Pide.
 *   - botón "Ver detalle" al panel.
 * Sin el campo "motivo" largo (el admin lo lee en /admin/solicitudes).
 */
function newRequestPayload(
  userName: string,
  pide: string,
  adminUrl?: string,
): SlackPayload {
  const text = `<!channel> 🔔 Nueva solicitud — ${userName} pide ${pide}`;
  const blocks: SlackBlock[] = [
    {
      type: "header",
      text: { type: "plain_text", text: "🔔 Nueva solicitud" },
    },
    // El <!channel> va en una section mrkdwn (el header es plain_text y no
    // renderiza menciones).
    {
      type: "section",
      text: { type: "mrkdwn", text: "<!channel>" },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Empleado:*\n${userName}` },
        { type: "mrkdwn", text: `*Pide:*\n${pide}` },
      ],
    },
  ];
  if (adminUrl) {
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Ver detalle" },
          url: adminUrl,
          style: "primary",
        },
      ],
    });
  }
  return { text, blocks };
}

function buildPayload(n: SlackNotification): SlackPayload {
  // ── Solicitudes NUEVAS → @channel + formato simplificado (FEEDBACK v2.0
  //    5.2/5.3): mismo formato para los 3 tipos (créditos, acceso,
  //    excepcional). Sin el campo "motivo" largo — el admin lo ve en el
  //    panel vía "Ver detalle". ──
  if (n.kind === "credits_request") {
    return newRequestPayload(
      n.userName,
      `${n.amount} créditos para ${n.toolName}`,
      n.adminUrl,
    );
  }

  if (n.kind === "access_request") {
    return newRequestPayload(
      n.userName,
      `acceso a ${n.toolName}`,
      n.adminUrl,
    );
  }

  if (n.kind === "exceptional_request") {
    const mins = n.durationMinutes;
    const dur =
      mins >= 60 && mins % 60 === 0 ? `${mins / 60}h` : `${mins} min`;
    return newRequestPayload(
      n.userName,
      `acceso excepcional (${dur}) a ${n.toolName}`,
      n.adminUrl,
    );
  }

  if (n.kind === "access_approved" || n.kind === "access_rejected") {
    const approved = n.kind === "access_approved";
    const emoji = approved ? "✅" : "❌";
    const verb = approved ? "aprobó" : "rechazó";
    const tail = approved
      ? `${n.userName} ahora tiene acceso a ${n.toolName}`
      : `${n.userName} pidió acceso a ${n.toolName}`;
    const lines: string[] = [
      `*Empleado*\n${n.userName}`,
      `*Herramienta*\n${n.toolName}`,
      `*Resuelto por*\n${n.adminName}`,
    ];
    if (n.note) lines.push(`*Nota*\n${n.note}`);
    lines.push(`*ID solicitud*\n\`${n.requestId}\``);
    return {
      text: `${emoji} ${n.adminName} ${verb} acceso: ${tail}`,
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: `${emoji} Acceso ${approved ? "aprobado" : "rechazado"}`,
          },
        },
        {
          type: "section",
          fields: lines.map((t) => ({ type: "mrkdwn" as const, text: t })),
        },
      ],
    };
  }

  // approved / rejected (créditos)
  if (n.kind === "credits_approved" || n.kind === "credits_rejected") {
    const verb = n.kind === "credits_approved" ? "aprobó" : "rechazó";
    const emoji = n.kind === "credits_approved" ? "✅" : "⛔";
    const lines: string[] = [
      `*Empleado*\n${n.userName}`,
      `*Herramienta*\n${n.toolName}`,
    ];
    if (n.amount != null) lines.push(`*Créditos*\n${n.amount}`);
    if (n.note) lines.push(`*Nota*\n${n.note}`);
    lines.push(`*ID solicitud*\n\`${n.requestId}\``);

    return {
      text: `${emoji} Solicitud ${verb}: ${n.userName} · ${n.toolName}`,
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: `${emoji} Solicitud ${verb}`,
          },
        },
        {
          type: "section",
          fields: lines.map((t) => ({ type: "mrkdwn", text: t })),
        },
      ],
    };
  }

  // Fallback inalcanzable en la práctica — los 5 kinds tienen su propio
  // bloque con return arriba. No usamos `const _: never = n` para el
  // exhaustiveness check porque TS no estrecha del todo cuando el
  // discriminante `kind` es una unión (caso de SlackApprovalNotification
  // y SlackAccessResolutionNotification). El runtime queda cubierto igual.
  return {
    text: "notificación NQS AI Hub",
    blocks: [
      {
        type: "section",
        text: { type: "mrkdwn", text: "notificación NQS AI Hub" },
      },
    ],
  };
}

// Export para tests
export const __testing = { buildPayload };
