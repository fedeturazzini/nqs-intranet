"use client";

/**
 * Compresión de imágenes client-side (FEEDBACK Chule: el chat rechazaba
 * imágenes >10MB; Claude online acepta hasta ~30MB).
 *
 * Flujo: el user puede elegir imágenes de hasta `MAX_INPUT_SIZE_MB`; si pesan
 * más de `MAX_OUTPUT_SIZE_MB` las comprimimos en el browser (Web Worker, no
 * bloquea la UI) antes de subirlas a Storage. Anthropic acepta hasta 5MB por
 * imagen, así que apuntamos a 4MB para dejar margen.
 *
 * El tope de entrada (30MB) lo valida `validateImage` en `images.ts`; acá solo
 * comprimimos.
 */
import imageCompression from "browser-image-compression";

/** Tope de entrada que el user puede seleccionar (como Claude online). */
export const MAX_INPUT_SIZE_MB = 30;
/** Tope de salida: Anthropic acepta hasta 5MB/imagen, dejamos margen. */
const MAX_OUTPUT_SIZE_MB = 4;
/** Reescalado máximo: suficiente para que Claude lea la imagen con detalle. */
const MAX_DIMENSION = 2048;

export type CompressResult = {
  file: File;
  /** true si efectivamente se comprimió (para feedback en UI / logs). */
  compressed: boolean;
  originalSizeMB: number;
  finalSizeMB: number;
};

/**
 * Devuelve la imagen lista para subir. Si ya entra en el tope de salida, la
 * deja igual; si no, la comprime. Puede tirar si el browser no puede procesar
 * el archivo — el caller lo captura y muestra un toast.
 */
export async function compressImageIfNeeded(
  file: File,
): Promise<CompressResult> {
  const originalSizeMB = file.size / (1024 * 1024);

  // Las imágenes chicas no se tocan (evita recomprimir y perder calidad).
  if (originalSizeMB <= MAX_OUTPUT_SIZE_MB) {
    return {
      file,
      compressed: false,
      originalSizeMB,
      finalSizeMB: originalSizeMB,
    };
  }

  const compressed = await imageCompression(file, {
    maxSizeMB: MAX_OUTPUT_SIZE_MB,
    maxWidthOrHeight: MAX_DIMENSION,
    useWebWorker: true,
    initialQuality: 0.85,
  });

  return {
    file: compressed,
    compressed: true,
    originalSizeMB,
    finalSizeMB: compressed.size / (1024 * 1024),
  };
}
