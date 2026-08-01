import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSignedUploadUrl: vi.fn(),
}));

vi.mock("@/lib/db/supabase", () => ({
  createServerClient: () => ({
    storage: {
      from: () => ({
        createSignedUploadUrl: mocks.createSignedUploadUrl,
      }),
    },
  }),
}));

import {
  SIGNED_UPLOAD_CONCURRENCY,
  createUploadTargets,
} from "@/lib/storage/claude-uploads";

beforeEach(() => {
  mocks.createSignedUploadUrl.mockReset();
});

describe("createUploadTargets", () => {
  test("limita firmas concurrentes y conserva el orden de mediaTypes", async () => {
    let active = 0;
    let maxActive = 0;
    let call = 0;
    mocks.createSignedUploadUrl.mockImplementation(async (path: string) => {
      const index = call++;
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, (7 - index) * 2));
      active -= 1;
      return {
        data: {
          signedUrl: `https://storage.test/${index}`,
          token: `token-${index}`,
        },
        error: null,
        path,
      };
    });
    const mediaTypes = [
      "image/jpeg",
      "application/pdf",
      "image/png",
      "image/webp",
      "image/gif",
      "image/jpeg",
      "application/pdf",
    ];

    const result = await createUploadTargets("user-1", null, mediaTypes);

    expect(maxActive).toBe(SIGNED_UPLOAD_CONCURRENCY);
    expect(result.map((target) => target.path.split(".").at(-1))).toEqual([
      "jpg",
      "pdf",
      "png",
      "webp",
      "gif",
      "jpg",
      "pdf",
    ]);
    expect(result.map((target) => target.token)).toEqual(
      mediaTypes.map((_, index) => `token-${index}`),
    );
  });

  test("propaga el error de Storage sin devolver targets parciales", async () => {
    mocks.createSignedUploadUrl.mockImplementation(async (path: string) => ({
      data: path.endsWith(".pdf")
        ? null
        : { signedUrl: "https://storage.test/ok", token: "token" },
      error: path.endsWith(".pdf") ? { message: "firma rechazada" } : null,
    }));

    await expect(
      createUploadTargets("user-1", "conversation-1", [
        "image/png",
        "application/pdf",
        "image/jpeg",
      ]),
    ).rejects.toThrow("firma rechazada");
  });
});
