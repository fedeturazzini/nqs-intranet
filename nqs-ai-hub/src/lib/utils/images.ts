/**
 * Helpers de imágenes para el wrapper de Claude.
 *
 * Solo se usan en el cliente — la conversión a base64 pasa por
 * `FileReader`. El server recibe los bytes ya encoded.
 */

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_IMAGES_PER_MESSAGE = 5;
export const ACCEPTED_MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;
export type AcceptedMediaType = (typeof ACCEPTED_MEDIA_TYPES)[number];

export type ImagePayload = {
  type: "base64";
  media_type: AcceptedMediaType;
  data: string; // base64 sin el prefijo `data:image/...;base64,`
};

export type ValidateResult =
  | { ok: true }
  | { ok: false; error: string };

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
      error: `${file.name}: ${mb} MB excede el límite de 5 MB`,
    };
  }
  return { ok: true };
}

/**
 * Convierte un `File` a base64 limpio (sin el prefijo data URL).
 * Tira excepción si el FileReader falla — el caller la captura.
 */
export function fileToBase64(file: File): Promise<ImagePayload> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(new Error(`no pude leer ${file.name}`));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error(`resultado de FileReader inesperado para ${file.name}`));
        return;
      }
      // result viene como "data:image/png;base64,<DATA>"
      const commaIdx = result.indexOf(",");
      if (commaIdx === -1) {
        reject(new Error(`formato data URL inesperado para ${file.name}`));
        return;
      }
      resolve({
        type: "base64",
        media_type: file.type as AcceptedMediaType,
        data: result.slice(commaIdx + 1),
      });
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Helper para el preview en el cliente — devuelve la data URL completa
 * (con prefijo) para usar en `<img src=...>`. Lo usamos al adjuntar,
 * no se envía al server.
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
