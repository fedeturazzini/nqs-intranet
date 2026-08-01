import { describe, expect, test } from "vitest";
import { shouldFollowChatScroll } from "@/components/tool/chat-scroll-follow";

describe("shouldFollowChatScroll", () => {
  test("deja de seguir apenas el usuario intenta subir", () => {
    expect(
      shouldFollowChatScroll({
        isFollowing: true,
        previousScrollTop: 1_000,
        scrollTop: 1_000,
        distanceFromBottom: 4,
        manualUp: true,
      }),
    ).toBe(false);
  });

  test("detecta movimiento ascendente aunque siga cerca del fondo", () => {
    expect(
      shouldFollowChatScroll({
        isFollowing: true,
        previousScrollTop: 1_000,
        scrollTop: 990,
        distanceFromBottom: 14,
      }),
    ).toBe(false);
  });

  test("no reactiva el seguimiento hasta volver al fondo", () => {
    expect(
      shouldFollowChatScroll({
        isFollowing: false,
        previousScrollTop: 500,
        scrollTop: 650,
        distanceFromBottom: 80,
      }),
    ).toBe(false);
  });

  test("reactiva el seguimiento cuando el usuario vuelve al fondo", () => {
    expect(
      shouldFollowChatScroll({
        isFollowing: false,
        previousScrollTop: 900,
        scrollTop: 1_000,
        distanceFromBottom: 8,
      }),
    ).toBe(true);
  });
});
