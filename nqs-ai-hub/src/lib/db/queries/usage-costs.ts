/**
 * Agregación de gasto en Claude (USD) desde `usage_logs`.
 *
 * Fuente: logs con action='claude.execute'. El `model` y (a futuro) el
 * split de tokens viven en `metadata`. Para logs históricos sin split,
 * caemos al join con `claude_messages` vía `metadata.messageId` (que tiene
 * tokens_input/tokens_output exactos).
 *
 * Server-only.
 */
import { createServerClient } from "@/lib/db/supabase";
import { calculateCostUSD } from "@/lib/costs/claude-pricing";

const DEFAULT_MODEL = "claude-sonnet-4-6";

function asObj(m: unknown): Record<string, unknown> {
  return m && typeof m === "object" ? (m as Record<string, unknown>) : {};
}
function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function strOrNull(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

type RawLog = {
  user_id: string;
  created_at: string | null;
  metadata: unknown;
  tokens_consumed: number | null;
  users: { name: string; dept: string | null } | null;
};

/** Resuelve model + tokensIn/Out de un log, usando el map de mensajes para
 * los históricos sin split en metadata. */
function resolveTokens(
  log: RawLog,
  msgMap: Map<string, { in: number; out: number }>,
): { model: string; tokensIn: number; tokensOut: number } {
  const md = asObj(log.metadata);
  const model = strOrNull(md.model) ?? DEFAULT_MODEL;
  let tokensIn = numOrNull(md.tokensInput);
  let tokensOut = numOrNull(md.tokensOutput);
  if (tokensIn === null || tokensOut === null) {
    const messageId = strOrNull(md.messageId);
    const fromMsg = messageId ? msgMap.get(messageId) : undefined;
    if (fromMsg) {
      tokensIn = fromMsg.in;
      tokensOut = fromMsg.out;
    }
  }
  return { model, tokensIn: tokensIn ?? 0, tokensOut: tokensOut ?? 0 };
}

/** Trae el map messageId → {in,out} para los logs que lo necesiten. */
async function buildMessageTokenMap(
  logs: RawLog[],
): Promise<Map<string, { in: number; out: number }>> {
  const ids: string[] = [];
  for (const l of logs) {
    const md = asObj(l.metadata);
    const needsSplit =
      numOrNull(md.tokensInput) === null || numOrNull(md.tokensOutput) === null;
    const messageId = strOrNull(md.messageId);
    if (needsSplit && messageId) ids.push(messageId);
  }
  const map = new Map<string, { in: number; out: number }>();
  if (ids.length === 0) return map;

  const db = createServerClient();
  // Batch en chunks por si hay muchos ids.
  const CHUNK = 200;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const { data } = await db
      .from("claude_messages")
      .select("id, tokens_input, tokens_output")
      .in("id", slice);
    for (const m of data ?? []) {
      map.set(m.id, {
        in: m.tokens_input ?? 0,
        out: m.tokens_output ?? 0,
      });
    }
  }
  return map;
}

export type UsdUserSummary = {
  userId: string;
  userName: string;
  dept: string | null;
  totalUsd: number;
  messageCount: number;
};

export async function getUsdSummary(
  fromIso: string,
  toIso: string,
): Promise<UsdUserSummary[]> {
  const db = createServerClient();
  const { data, error } = await db
    .from("usage_logs")
    .select(
      "user_id, created_at, metadata, tokens_consumed, users!usage_logs_user_id_fkey(name, dept)",
    )
    .eq("action", "claude.execute")
    .gte("created_at", fromIso)
    .lte("created_at", toIso);
  if (error) throw error;

  const logs = (data ?? []) as RawLog[];
  const msgMap = await buildMessageTokenMap(logs);

  const byUser = new Map<string, UsdUserSummary>();
  for (const log of logs) {
    const { model, tokensIn, tokensOut } = resolveTokens(log, msgMap);
    const usd = calculateCostUSD(model, tokensIn, tokensOut);
    const cur = byUser.get(log.user_id) ?? {
      userId: log.user_id,
      userName: log.users?.name ?? "—",
      dept: log.users?.dept ?? null,
      totalUsd: 0,
      messageCount: 0,
    };
    cur.totalUsd += usd;
    cur.messageCount += 1;
    byUser.set(log.user_id, cur);
  }

  return [...byUser.values()].sort((a, b) => b.totalUsd - a.totalUsd);
}

export type UsdCall = {
  createdAt: string | null;
  model: string;
  tokensIn: number;
  tokensOut: number;
  usd: number;
};

export type UsdUserDetail = {
  userId: string;
  userName: string;
  dept: string | null;
  totalUsd: number;
  messageCount: number;
  calls: UsdCall[];
};

export async function getUsdDetailForUser(
  userId: string,
  fromIso: string,
  toIso: string,
): Promise<UsdUserDetail> {
  const db = createServerClient();
  const { data, error } = await db
    .from("usage_logs")
    .select(
      "user_id, created_at, metadata, tokens_consumed, users!usage_logs_user_id_fkey(name, dept)",
    )
    .eq("action", "claude.execute")
    .eq("user_id", userId)
    .gte("created_at", fromIso)
    .lte("created_at", toIso)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const logs = (data ?? []) as RawLog[];
  const msgMap = await buildMessageTokenMap(logs);

  let totalUsd = 0;
  const calls: UsdCall[] = [];
  let userName = "—";
  let dept: string | null = null;
  for (const log of logs) {
    userName = log.users?.name ?? userName;
    dept = log.users?.dept ?? dept;
    const { model, tokensIn, tokensOut } = resolveTokens(log, msgMap);
    const usd = calculateCostUSD(model, tokensIn, tokensOut);
    totalUsd += usd;
    calls.push({ createdAt: log.created_at, model, tokensIn, tokensOut, usd });
  }

  return {
    userId,
    userName,
    dept,
    totalUsd,
    messageCount: logs.length,
    calls,
  };
}
