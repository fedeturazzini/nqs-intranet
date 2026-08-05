import { describe, expect, test } from "vitest";
import {
  defaultThinkingModeFor,
  isThinkingMode,
  thinkingParamFor,
} from "@/lib/anthropic/thinking-mode";

describe("thinking-mode", () => {
  test("isThinkingMode solo acepta off|auto", () => {
    expect(isThinkingMode("off")).toBe(true);
    expect(isThinkingMode("auto")).toBe(true);
    expect(isThinkingMode("on")).toBe(false);
    expect(isThinkingMode(null)).toBe(false);
  });

  test("defaultThinkingModeFor: Sonnet 5 → off; resto → auto", () => {
    expect(defaultThinkingModeFor("claude-sonnet-5")).toBe("off");
    expect(defaultThinkingModeFor("claude-sonnet-5-20260501")).toBe("off");
    expect(defaultThinkingModeFor("claude-sonnet-4-6")).toBe("auto");
    expect(defaultThinkingModeFor("claude-opus-4-7")).toBe("auto");
    expect(defaultThinkingModeFor("claude-haiku-4-5")).toBe("auto");
  });

  test("thinkingParamFor off → disabled; auto → undefined", () => {
    expect(thinkingParamFor("claude-sonnet-5", "off")).toEqual({
      type: "disabled",
    });
    expect(thinkingParamFor("claude-sonnet-5", "auto")).toBeUndefined();
    expect(thinkingParamFor("claude-opus-4-7", "auto")).toBeUndefined();
    expect(thinkingParamFor("claude-opus-4-7", "off")).toEqual({
      type: "disabled",
    });
  });

  test("thinkingParamFor sin mode usa default del modelo", () => {
    expect(thinkingParamFor("claude-sonnet-5")).toEqual({ type: "disabled" });
    expect(thinkingParamFor("claude-opus-4-7")).toBeUndefined();
  });
});
