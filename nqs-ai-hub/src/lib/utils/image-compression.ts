"use client";

/**
 * Compresión de imágenes client-side (FEEDBACK Chule: el chat rechazaba
 * imágenes >10MB; Claude online acepta hasta ~30MB).
 *
 * Flujo: el user puede elegir imágenes de hasta `MAX_INPUT_SIZE_MB`; antes de
 * subirlas a Storage las reescalamos en el browser si superan el tope de PESO
 * (`MAX_OUTPUT_SIZE_MB`) **o** el de DIMENSIONES (`MAX_DIMENSION`).
 *
 * SIN WEB WORKER, a propósito: `browser-image-compression@2` con
 * `useWebWorker: true` hace `importScripts()` de un CDN externo (jsdelivr) DENTRO
 * del worker, en cada compresión. Si esa descarga se bloquea (CSP, firewall de la
 * red, CDN caído), el worker nunca postea resultado y la promesa NO resuelve ni
 * rechaza: el chat quedaba clavado en "procesando adjunto…" y, como `handleSend`
 * corta mientras `compressing` es true, el input quedaba bloqueado hasta recargar.
 * En el main thread no hay fetch externo. Bloquea el hilo ~1s (reescalamos a
 * ≤1568px antes de encodear, así que el trabajo real es chico) — infinitamente
 * mejor que colgarse para siempre.
 *
 * Además NADA queda sin techo de tiempo (`withTimeout`) y un fallo de compresión
 * NUNCA descarta el adjunto si el original ya entra en el límite.
 *
 * El cap de dimensiones corre SIEMPRE, no solo cuando la imagen pesa mucho: un
 * JPG liviano pero enorme (ej. un brochure de varias páginas "unificado",
 * 2000×20000px y pocos MB) antes pasaba intacto y Anthropic lo rechazaba por
 * límite de dimensiones/megapíxeles. Capear al lado largo lo evita. Anthropic
 * reescala de su lado las imágenes >~1568px al lado largo para los modelos en
 * uso, así que capear acá no pierde calidad real y ahorra tokens.
 *
 * El tope de entrada lo valida `validateAttachment` en `images.ts`.
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
/** Techo de espera de la compresión. Red de seguridad: nunca colgarse. */
const COMPRESS_TIMEOUT_MS = 30_000;
/** Techo de espera de la lectura de dimensiones (`createImageBitmap`). */
const DIMENSIONS_TIMEOUT_MS = 10_000;

/**
 * Corre una promesa con techo de tiempo. Necesario porque una promesa que NUNCA
 * settlea (ni resuelve ni rechaza) deja al caller esperando para siempre — no
 * alcanza con try/catch. Ojo: no cancela el trabajo de fondo, solo deja de
 * esperarlo, que es justo lo que necesitamos para no bloquear la UI.
 */
function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label}: no respondió en ${ms}ms`)),
      ms,
    );
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

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
    const bitmap = await withTimeout(
      createImageBitmap(file),
      DIMENSIONS_TIMEOUT_MS,
      "createImageBitmap",
    );
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

  // Solo comprimimos imágenes. Un PDF (u otro no-imagen) se sube tal cual —
  // browser-image-compression rompería con un archivo que no es imagen.
  if (!file.type.startsWith("image/")) {
    return { file, compressed: false, originalSizeMB, finalSizeMB: originalSizeMB };
  }

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
  // `useWebWorker: false` es deliberado (ver el encabezado del archivo): el worker
  // de esta librería descarga su código de un CDN externo y se cuelga si está
  // bloqueado. El timeout es la red de seguridad por si igual no vuelve.
  try {
    const compressed = await withTimeout(
      imageCompression(file, {
        maxSizeMB: MAX_OUTPUT_SIZE_MB,
        maxWidthOrHeight: MAX_DIMENSION,
        useWebWorker: false,
        initialQuality: 0.85,
      }),
      COMPRESS_TIMEOUT_MS,
      "compresión de imagen",
    );

    return {
      file: compressed,
      compressed: true,
      originalSizeMB,
      finalSizeMB: compressed.size / (1024 * 1024),
    };
  } catch (err) {
    // La compresión falló o tardó demasiado. Antes esto perdía el adjunto (o,
    // peor, colgaba la UI). Si el ORIGINAL ya entra en el límite de peso, lo
    // mandamos tal cual: mejor una imagen sin optimizar que perderla.
    console.warn(
      `[img] compresión falló para ${file.name || "(sin nombre)"} (${originalSizeMB.toFixed(1)}MB): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    if (originalSizeMB <= MAX_OUTPUT_SIZE_MB) {
      // Nota: si entró acá por DIMENSIONES, la mandamos sin capear. Anthropic
      // reescala >1568px de su lado, así que en la práctica funciona; solo un
      // caso extremo de megapíxeles podría rechazarla, y ahí el error se ve.
      return { file, compressed: false, originalSizeMB, finalSizeMB: originalSizeMB };
    }
    // Muy pesada Y sin poder comprimir: acá sí hay que avisar. `addFiles` lo
    // captura y lo muestra como toast.
    throw new Error(
      `no pude procesar la imagen (${originalSizeMB.toFixed(1)}MB). Probá con una más liviana.`,
    );
  }
}
