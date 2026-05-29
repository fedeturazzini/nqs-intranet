/**
 * Helpers de Supabase Storage para los uploads del chat de Claude.
 *
 * Bucket: `claude-uploads` (privado).
 * Path: `user_{userId}/{conversationId|new}/{uuid}.{ext}`
 *
 * Flujo:
 *   1. Cliente valida tamaño/cantidad y pide signed upload URLs
 *      (`createUploadTargets`).
 *   2. Cliente sube directo a Storage con la signed URL (no pasa por
 *      Vercel → esquiva el límite de 4.5MB por request).
 *   3. Cliente manda los `path` al endpoint execute.
 *   4. El adapter genera signed DOWNLOAD URLs (`signDownloadUrls`) y se
 *      las pasa a Anthropic como `source: { type: "url" }`.
 *   5. Los paths se persisten en `claude_messages.images`.
 *   6. Para render histórico, se vuelven a firmar on-demand.
 *
 * Server-only — usa service_role.
 */
import { createServerClient } from "@/lib/db/supabase";

export const CLAUDE_UPLOADS_BUCKET = "claude-uploads";
export const SIGNED_UPLOAD_EXPIRY_SECONDS = 120; // 2 min para subir
export const SIGNED_DOWNLOAD_EXPIRY_SECONDS = 3600; // 1 hora (lo que pidió NQS)

const EXT_BY_MEDIA: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
};

export type UploadTarget = {
  /** Path completo dentro del bucket (lo que se persiste en DB). */
  path: string;
  /** URL firmada para que el cliente haga el PUT. */
  signedUrl: string;
  /** Token de la signed URL (para uploadToSignedUrl del cliente). */
  token: string;
};

/**
 * Genera N signed upload URLs para un user/conversación. El backend
 * controla el path (el cliente NO puede elegirlo), garantizando que
 * cada archivo cae en `user_{userId}/...`.
 */
export async function createUploadTargets(
  userId: string,
  conversationId: string | null,
  mediaTypes: string[],
): Promise<UploadTarget[]> {
  const db = createServerClient();
  const convSegment = conversationId ?? "new";
  const targets: UploadTarget[] = [];

  for (const media of mediaTypes) {
    const ext = EXT_BY_MEDIA[media] ?? "bin";
    const path = `user_${userId}/${convSegment}/${crypto.randomUUID()}.${ext}`;
    const { data, error } = await db.storage
      .from(CLAUDE_UPLOADS_BUCKET)
      .createSignedUploadUrl(path);
    if (error || !data) {
      throw new Error(
        `no pude crear signed upload url: ${error?.message ?? "unknown"}`,
      );
    }
    targets.push({ path, signedUrl: data.signedUrl, token: data.token });
  }
  return targets;
}

/**
 * Firma URLs de descarga (lectura) para una lista de paths. Se usa al
 * mandar a Anthropic y al renderear historial.
 *
 * Si un path falla al firmar (ej. borrado), lo omite — no rompe toda la
 * operación.
 */
export async function signDownloadUrls(
  paths: string[],
): Promise<Array<{ path: string; url: string }>> {
  if (paths.length === 0) return [];
  const db = createServerClient();
  const { data, error } = await db.storage
    .from(CLAUDE_UPLOADS_BUCKET)
    .createSignedUrls(paths, SIGNED_DOWNLOAD_EXPIRY_SECONDS);
  if (error || !data) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "signDownloadUrls failed",
        error: error?.message ?? "unknown",
        count: paths.length,
      }),
    );
    return [];
  }
  const out: Array<{ path: string; url: string }> = [];
  for (const d of data) {
    if (d.signedUrl && !d.error && d.path) {
      out.push({ path: d.path, url: d.signedUrl });
    }
  }
  return out;
}

/**
 * Valida que un path pertenezca al user (defensa contra que el cliente
 * mande paths de otro user en el execute). El path debe empezar con
 * `user_{userId}/`.
 */
export function pathBelongsToUser(path: string, userId: string): boolean {
  return path.startsWith(`user_${userId}/`);
}
