"use client";

/**
 * Compresión de imágenes client-side (FEEDBACK Chule: el chat rechazaba
 * imágenes >10MB; Claude online acepta hasta ~30MB).
 *
 * Flujo: el user puede elegir imágenes de hasta `MAX_INPUT_SIZE_MB`; antes de
 * subirlas a Storage las reescalamos en el browser (Web Worker) si superan el
 * tope de PESO (`MAX_OUTPUT_SIZE_MB`) **o** el de DIMENSIONES (`MAX_DIMENSION`).
 *
 * El cap de dimensiones corre SIEMPRE, no solo cuando la imagen pesa mucho: un
 * JPG liviano pero enorme (ej. un brochure de varias páginas "unificado",
 * 2000×20000px y pocos MB) antes pasaba intacto y Anthropic lo rechazaba por
 * límite de dimensiones/megapíxeles. Capear al lado largo lo evita. Anthropic
 * reescala de su lado las imágenes >~1568px al lado largo para los modelos en
 * uso, así que capear acá no pierde calidad real y ahorra tokens.
 *
 * El tope de entrada (30MB) lo valida `validateImage` en `images.ts`.
 */
import imageCompression from "browser-image-compression";

/** Tope de entrada que el user puede seleccionar (como Claude online). */
export const MAX_INPUT_SIZE_MB = 30;
/** Tope de salida: Anthropic acepta hasta 5MB/imagen, dejamos margen. */
const MAX_OUTPUT_SIZE_MB = 4;
/**
 * Cap del lado largo. 1568px = umbral al que Anthropic reescala de su lado
 * (Sonnet/Opus 4.6). Capear acá evita el rechazo por dimensiones sin perder
 * calidad efectiva (el modelo la downscalearía igual).
 */
const MAX_DIMENSION = 1568;

export type CompressResult = {
  file: File;
  /** true si efectivamente se comprimió (para feedback en UI / logs). */
  compressed: boolean;
  originalSizeMB: number;
  finalSizeMB: number;
};

/**
 * Lee las dimensiones de un archivo de imagen. Defensivo: si el browser no
 * puede decodificarlo (tipo raro / archivo corrupto), devuelve null y el caller
 * cae al criterio por peso — nunca rompe el flujo de adjuntar.
 */
async function readDimensions(
  file: File,
): Promise<{ w: number; h: number } | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const dims = { w: bitmap.width, h: bitmap.height };
    bitmap.close();
    return dims;
  } catch {
    return null;
  }
}

/**
 * Devuelve la imagen lista para subir. Si ya entra en peso Y dimensiones, la
 * deja igual (no reprocesa, no degrada); si excede alguno de los dos, la
 * reescala/comprime. Puede tirar si el browser no puede procesar el archivo —
 * el caller lo captura y muestra un toast.
 */
export async function compressImageIfNeeded(
  file: File,
): Promise<CompressResult> {
  const originalSizeMB = file.size / (1024 * 1024);
  const dims = await readDimensions(file);

  const tooHeavy = originalSizeMB > MAX_OUTPUT_SIZE_MB;
  const tooLarge = dims !== null && Math.max(dims.w, dims.h) > MAX_DIMENSION;

  // Ya entra en peso y dimensiones (o no se pudo medir y es liviana) → intacta.
  if (!tooHeavy && !tooLarge) {
    return {
      file,
      compressed: false,
      originalSizeMB,
      finalSizeMB: originalSizeMB,
    };
  }

  // Un solo call cubre ambos casos: liviana-pero-enorme → capea dimensiones;
  // pesada → además baja el peso. Siempre capea el lado largo a MAX_DIMENSION.
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
