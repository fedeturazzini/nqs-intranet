/**
 * Tests del notifier de Slack.
 *
 * Validaciones críticas:
 *   1. Si SLACK_WEBHOOK_URL no está seteada → no-op silencioso, no throw.
 *   2. Si fetch tira → no-op silencioso, no propaga el error.
 *   3. Si Slack devuelve 5xx → loguea pero no throw.
 *   4. El payload tiene el shape de Slack Blocks correcto.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { notifySlack, __testing } from "@/lib/notifications/slack";

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_URL = process.env.SLACK_WEBHOOK_URL;

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  if (ORIGINAL_URL === undefined) {
    delete process.env.SLACK_WEBHOOK_URL;
  } else {
    process.env.SLACK_WEBHOOK_URL = ORIGINAL_URL;
  }
});

describe("notifySlack — graceful degradation", () => {
  test("sin SLACK_WEBHOOK_URL no hace POST y no throwea", async () => {
    delete process.env.SLACK_WEBHOOK_URL;
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await expect(
      notifySlack({
        kind: "credits_request",
        userName: "Sofía",
        toolName: "3DSky",
        amount: 10,
        reason: "render fin de semana",
        requestId: "abc-123",
      }),
    ).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("si fetch rechaza, notifySlack no propaga", async () => {
    process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.com/services/X";
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("network down")) as unknown as typeof fetch;

    await expect(
      notifySlack({
        kind: "credits_request",
        userName: "Sofía",
        toolName: "3DSky",
        amount: 10,
        reason: "render",
        requestId: "abc",
      }),
    ).resolves.toBeUndefined();
  });

  test("si Slack devuelve 500, notifySlack no propaga", async () => {
    process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.com/services/X";
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "internal error",
    } as unknown as Response) as unknown as typeof fetch;

    await expect(
      notifySlack({
        kind: "credits_rejected",
        userName: "Sofía",
        toolName: "3DSky",
        requestId: "abc",
      }),
    ).resolves.toBeUndefined();
  });
});

describe("buildPayload — shape", () => {
  test("credits_request incluye header + section + actions cuando hay adminUrl", () => {
    const p = __testing.buildPayload({
      kind: "credits_request",
      userName: "Sofía",
      toolName: "3DSky",
      amount: 10,
      reason: "render fin de semana",
      requestId: "abc-123",
      adminUrl: "https://hub.nqs/admin#requests",
    });
    expect(p.text).toContain("Sofía");
    expect(p.text).toContain("10");
    expect(p.blocks.some((b) => b.type === "header")).toBe(true);
    expect(p.blocks.some((b) => b.type === "actions")).toBe(true);
  });

  test("credits_approved usa emoji ✅ y no incluye botón", () => {
    const p = __testing.buildPayload({
      kind: "credits_approved",
      userName: "Sofía",
      toolName: "3DSky",
      amount: 10,
      requestId: "abc",
    });
    expect(p.text).toContain("✅");
    expect(p.blocks.some((b) => b.type === "actions")).toBe(false);
  });
});
