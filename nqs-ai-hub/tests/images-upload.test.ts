import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  uploadToSignedUrl: vi.fn(),
}));

vi.mock("@/lib/db/supabase", () => ({
  createBrowserClient: () => ({
    storage: {
      from: () => ({
        uploadToSignedUrl: mocks.uploadToSignedUrl,
      }),
    },
  }),
}));

import {
  ATTACHMENT_UPLOAD_CONCURRENCY,
  MAX_ATTACHMENTS,
  uploadImages,
} from "@/lib/utils/images";

function file(name: string, type = "image/png"): File {
  return { name, type, size: 100 } as File;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function targets(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    path: `user_u/new/file-${index}.png`,
    signedUrl: `https://storage.test/${index}`,
    token: `token-${index}`,
  }));
}

beforeEach(() => {
  vi.restoreAllMocks();
  mocks.uploadToSignedUrl.mockReset();
  mocks.uploadToSignedUrl.mockResolvedValue({ data: {}, error: null });
});

describe("uploadImages", () => {
  test("refresca una vez ante 401 y reintenta la preparación", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: "unauthorized" }, 401))
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
      .mockResolvedValueOnce(jsonResponse({ targets: targets(1) }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(uploadImages([file("a.png")], null)).resolves.toEqual([
      "user_u/new/file-0.png",
    ]);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/tools/claude/upload-url",
      "/api/auth/refresh",
      "/api/tools/claude/upload-url",
    ]);
  });

  test("sube como máximo tres archivos y devuelve paths en orden", async () => {
    const input = Array.from({ length: 7 }, (_, index) =>
      file(`image-${index}.png`),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ targets: targets(input.length) })),
    );
    let active = 0;
    let maxActive = 0;
    mocks.uploadToSignedUrl.mockImplementation(async (path: string) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      const index = Number(path.match(/file-(\d+)/)?.[1] ?? 0);
      await new Promise((resolve) =>
        setTimeout(resolve, (input.length - index) * 2),
      );
      active -= 1;
      return { data: {}, error: null };
    });

    const paths = await uploadImages(input, null);

    expect(maxActive).toBe(ATTACHMENT_UPLOAD_CONCURRENCY);
    expect(paths).toEqual(targets(input.length).map((target) => target.path));
  });

  test("propaga el nombre del archivo cuya subida falló", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ targets: targets(2) })),
    );
    mocks.uploadToSignedUrl.mockImplementation(async (path: string) => ({
      data: null,
      error: path.includes("file-1") ? { message: "storage down" } : null,
    }));

    await expect(
      uploadImages([file("ok.png"), file("fallida.png")], null),
    ).rejects.toThrow("no pude subir fallida.png: storage down");
  });

  test("mantiene el límite de diez antes de hacer requests", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const input = Array.from({ length: MAX_ATTACHMENTS + 1 }, (_, index) =>
      file(`image-${index}.png`),
    );

    await expect(uploadImages(input, null)).rejects.toThrow(
      `máximo ${MAX_ATTACHMENTS}`,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
