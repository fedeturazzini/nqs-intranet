"use client";

/**
 * Helpers de imágenes para el wrapper de Claude.
 *
 * Flujo de upload (cliente → Storage directo, sin pasar por Vercel):
 *   1. `validateImage(file)` — tipo + tamaño (≤10MB).
 *   2. `uploadImages(files, conversationId)`:
 *        a. pide signed upload URLs a /api/tools/claude/upload-url
 *        b. sube cada file directo a Supabase Storage con la signed URL
 *        c. devuelve los `path` (que después van al execute)
 *   3. `fileToPreviewUrl(file)` — data URL local para el thumbnail
 *      mientras se compone (no se sube, solo preview optimista).
 */
import { createBrowserClient } from "@/lib/db/supabase";

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB (límite de Anthropic)
export const MAX_IMAGES_PER_MESSAGE = 5;
export const ACCEPTED_MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;
export type AcceptedMediaType = (typeof ACCEPTED_MEDIA_TYPES)[number];
const CLAUDE_UPLOADS_BUCKET = "claude-uploads";

export type ValidateResult = { ok: true } | { ok: false; error: string };

export function validateImage(file: File): ValidateResult {
  if (!ACCEPTED_MEDIA_TYPES.includes(file.type as AcceptedMediaType)) {
    return {
      ok: false,
      error: `${file.name}: tipo no soportado (solo JPG, PNG, GIF, WebP)`,
    };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      ok: false,
      error: `${file.name}: ${mb} MB excede el límite de 10 MB`,
    };
  }
  return { ok: true };
}

type UploadTarget = { path: string; signedUrl: string; token: string };

/**
 * Sube una lista de Files a Storage y devuelve sus paths, en el mismo
 * orden que los files. Valida client-side antes de pedir las URLs
 * (no gastamos bandwidth ni signed URLs si algo no pasa).
 *
 * Tira excepción si algún paso falla — el caller la captura y muestra
 * un toast.
 */
export async function uploadImages(
  files: File[],
  conversationId: string | null,
): Promise<string[]> {
  if (files.length === 0) return [];

  // Validación local (defensa además de la del modal).
  for (const f of files) {
    const v = validateImage(f);
    if (!v.ok) throw new Error(v.error);
  }
  if (files.length > MAX_IMAGES_PER_MESSAGE) {
    throw new Error(`máximo ${MAX_IMAGES_PER_MESSAGE} imágenes por mensaje`);
  }

  // 1) pedir signed upload URLs (una por file, en orden)
  const res = await fetch("/api/tools/claude/upload-url", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      mediaTypes: files.map((f) => f.type),
      conversationId: conversationId ?? undefined,
    }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `no se pudieron preparar las subidas (${res.status})`);
  }
  const { targets } = (await res.json()) as { targets: UploadTarget[] };
  if (targets.length !== files.length) {
    throw new Error("respuesta de upload-url inconsistente");
  }

  // 2) subir cada file con su signed URL (directo a Storage)
  const supabase = createBrowserClient();
  const paths: string[] = [];
  for (let i = 0; i < files.length; i++) {
    const target = targets[i];
    const { error } = await supabase.storage
      .from(CLAUDE_UPLOADS_BUCKET)
      .uploadToSignedUrl(target.path, target.token, files[i], {
        contentType: files[i].type,
      });
    if (error) {
      throw new Error(`no pude subir ${files[i].name}: ${error.message}`);
    }
    paths.push(target.path);
  }
  return paths;
}

/**
 * Data URL local para el thumbnail mientras se compone. No se sube —
 * es solo preview optimista en el bubble del user.
 */
export function fileToPreviewUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`no pude leer ${file.name}`));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("FileReader devolvió tipo inesperado"));
        return;
      }
      resolve(result);
    };
    reader.readAsDataURL(file);
  });
}
