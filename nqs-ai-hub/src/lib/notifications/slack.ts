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
  | SlackApprovalNotification
  | SlackAccessResolutionNotification;

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

  const body = buildPayload(payload);

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

function buildPayload(n: SlackNotification): SlackPayload {
  if (n.kind === "credits_request") {
    const text = `🔔 ${n.userName} pidió ${n.amount} créditos de ${n.toolName}`;
    const blocks: SlackBlock[] = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "🔔 Nueva solicitud de créditos",
        },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Empleado*\n${n.userName}` },
          { type: "mrkdwn", text: `*Herramienta*\n${n.toolName}` },
          { type: "mrkdwn", text: `*Cantidad*\n${n.amount} créditos` },
          { type: "mrkdwn", text: `*ID solicitud*\n\`${n.requestId}\`` },
        ],
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: `*Motivo:*\n> ${n.reason}` },
      },
    ];
    if (n.adminUrl) {
      blocks.push({
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "Ver en panel" },
            url: n.adminUrl,
            style: "primary",
          },
        ],
      });
    }
    return { text, blocks };
  }

  if (n.kind === "access_request") {
    const text = `🔓 ${n.userName} pidió acceso a ${n.toolName}`;
    const blocks: SlackBlock[] = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "🔓 Solicitud de acceso a herramienta",
        },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Empleado*\n${n.userName}` },
          { type: "mrkdwn", text: `*Herramienta*\n${n.toolName}` },
          { type: "mrkdwn", text: `*ID solicitud*\n\`${n.requestId}\`` },
        ],
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Motivo:*\n> ${n.reason}\n\n_Este empleado todavía no tiene esta herramienta habilitada._`,
        },
      },
    ];
    if (n.adminUrl) {
      blocks.push({
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "Ver en panel" },
            url: n.adminUrl,
            style: "primary",
          },
        ],
      });
    }
    return { text, blocks };
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
