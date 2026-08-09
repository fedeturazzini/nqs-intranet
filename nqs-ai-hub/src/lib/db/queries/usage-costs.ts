/**
 * Agregación de gasto en Claude (USD) desde `usage_logs`.
 *
 * Fuente: logs con action='claude.execute'. El `model` y (a futuro) el
 * split de tokens viven en `metadata`. Para logs históricos sin split,
 * caemos al join con `claude_messages` vía `metadata.messageId` (que tiene
 * tokens_input/tokens_output exactos).
 *
 * Pagina resultados (Supabase max_rows=1000) para cubrir períodos largos.
 *
 * Server-only.
 */
import { createServerClient } from "@/lib/db/supabase";
import { calculateCostUSD } from "@/lib/costs/claude-pricing";

const DEFAULT_MODEL = "claude-sonnet-4-6";

/** PostgREST/Supabase `max_rows` (ver supabase/config.toml). Sin paginar,
 * los períodos largos se cortan en este tope y el total USD queda incompleto. */
const PAGE_SIZE = 1000;

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

const LOG_SELECT =
  "user_id, created_at, metadata, tokens_consumed, users!usage_logs_user_id_fkey(name, dept)";

/** Trae todos los `claude.execute` del rango, paginando más allá de max_rows. */
async function fetchAllUsageLogs(opts: {
  fromIso: string;
  toIso: string;
  userId?: string;
  ascending?: boolean;
}): Promise<RawLog[]> {
  const db = createServerClient();
  const all: RawLog[] = [];
  let offset = 0;
  const ascending = opts.ascending ?? true;

  for (;;) {
    let q = db
      .from("usage_logs")
      .select(LOG_SELECT)
      .eq("action", "claude.execute");
    if (opts.userId) q = q.eq("user_id", opts.userId);

    const { data, error } = await q
      .gte("created_at", opts.fromIso)
      .lte("created_at", opts.toIso)
      .order("created_at", { ascending })
      .order("id", { ascending })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;

    const batch = (data ?? []) as RawLog[];
    all.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return all;
}

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
  const logs = await fetchAllUsageLogs({ fromIso, toIso });
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
  /** De usage_logs.metadata.conversationId — null si no se persistió. */
  conversationId: string | null;
  /** De usage_logs.metadata.messageId (mensaje assistant del turno). */
  messageId: string | null;
  /** De usage_logs.metadata.projectId. */
  projectId: string | null;
  /** Nombre resuelto desde projects; null si no hay / no existe. */
  projectName: string | null;
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
  const logs = await fetchAllUsageLogs({
    fromIso,
    toIso,
    userId,
    ascending: false,
  });
  const msgMap = await buildMessageTokenMap(logs);

  // Resolver nombres de proyecto en un batch (metadata.projectId).
  const projectIds = new Set<string>();
  for (const log of logs) {
    const pid = strOrNull(asObj(log.metadata).projectId);
    if (pid) projectIds.add(pid);
  }
  const projectNames = new Map<string, string>();
  if (projectIds.size > 0) {
    const db = createServerClient();
    const ids = [...projectIds];
    const CHUNK = 200;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK);
      const { data: projects } = await db
        .from("projects")
        .select("id, name")
        .in("id", slice);
      for (const p of projects ?? []) {
        projectNames.set(p.id, p.name);
      }
    }
  }

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
    const md = asObj(log.metadata);
    const rawConvId = strOrNull(md.conversationId);
    const conversationId =
      rawConvId && rawConvId.length > 0 ? rawConvId : null;
    const rawMsgId = strOrNull(md.messageId);
    const messageId = rawMsgId && rawMsgId.length > 0 ? rawMsgId : null;
    const rawProjectId = strOrNull(md.projectId);
    const projectId =
      rawProjectId && rawProjectId.length > 0 ? rawProjectId : null;
    calls.push({
      createdAt: log.created_at,
      model,
      tokensIn,
      tokensOut,
      usd,
      conversationId,
      messageId,
      projectId,
      projectName: projectId ? (projectNames.get(projectId) ?? null) : null,
    });
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
