/**
 * Tipos compartidos por todos los `ToolAdapter`.
 *
 * Vienen de `kit/reference/tool-adapter-pattern.ts`. Los exportamos
 * desde acá (no desde `./index`) para evitar ciclos: cada adapter
 * importa de `./types` y `./utils`, nunca de `./index`.
 *
 * `ToolId` y `ToolCategory` se re-exportan desde `@/types/db-aliases`
 * (single source of truth — vienen del schema autogenerado).
 */
import type { ToolCategory, ToolId } from "@/types/db-aliases";

export type { ToolCategory, ToolId };

// ============================================================
// AccessState — devuelto por `checkAccess`
// ============================================================
// Es una discriminated union por `status`. Cada variante trae los
// campos relevantes (créditos solo en active de tools con créditos,
// requestedAt solo en pending, etc.).

export type AccessState =
  | {
      status: "active";
      expiresAt?: Date;
      credits?: number;
      creditsTotal?: number;
    }
  | { status: "pending"; requestedAt: Date }
  | { status: "locked" }
  | { status: "expired"; expiredAt: Date };

// ============================================================
// Result<T, E> — wrapper de operaciones que pueden fallar
// ============================================================
// Convención del proyecto (ver kit/docs/02-conventions.md): usar
// Result en vez de throws para que el caller decida cómo manejar.

export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

// ============================================================
// Execute — parámetros y resultado
// ============================================================

export type ExecuteParams = {
  prompt: string;
  /**
   * Paths de imágenes ya subidas a Supabase Storage (bucket
   * `claude-uploads`). El adapter genera signed download URLs y se las
   * pasa a Anthropic. Reemplaza el viejo `images` base64 — ahora los
   * archivos viajan directo cliente → Storage, no por la API route
   * (esquiva el límite de 4.5MB de Vercel).
   */
  imagePaths?: string[];
  /** Si viene, se appendea a la conversación existente. Si no, se crea una nueva. */
  conversationId?: string;
  /**
   * Proyecto que la pestaña espera usar. Es un hint no confiable: para una
   * conversación existente el server usa `claude_conversations.project_id`
   * como autoridad y rechaza cualquier mismatch.
   */
  projectId?: string;
  /**
   * Contexto canónico resuelto server-side antes de abrir el stream. El schema
   * HTTP no acepta este campo: la route lo agrega después de validar ownership,
   * proyecto activo y gate.
   */
  projectContext?: {
    projectId: string;
    source:
      | "conversation"
      | "request"
      | "global_fallback"
      | "legacy_request"
      | "legacy_global_fallback";
  };
};

export type ExecuteResult = {
  text: string;
  tokensInput: number;
  tokensOutput: number;
  conversationId: string;
  messageId: string;
  /** Timestamp real (`created_at` de la DB) del mensaje del assistant, para el
   *  horario en la UI. Null si la persistencia falló — el cliente cae a "ahora". */
  createdAt: string | null;
  /** Por qué terminó la respuesta: "end_turn" (normal), "max_tokens"
   *  (cortada por el techo), etc. Lo usa la UI para avisar si se cortó. */
  stopReason?: string | null;
  /**
   * Archivos binarios (PDF/Word/Excel/PPT) que Claude generó en el sandbox de
   * Anthropic vía code execution. ETAPA 1: solo el `fileId` capturado (todavía
   * no se baja ni se guarda; la etapa 2 los descarga de la Files API y los sube
   * a Supabase Storage). Vacío/undefined si no se generó ninguno.
   */
  generatedFiles?: Array<{ fileId: string }>;
  /**
   * Archivos generados que YA se bajaron, subieron a Storage y registraron en
   * `claude_files` (ETAPA 2). Sin URL — se firma on-demand (done / etapa 3).
   */
  files?: Array<{
    id: string;
    name: string;
    mediaType: string;
    storagePath: string;
  }>;
  /**
   * Cantidad de archivos que se CAPTURARON (file_id) pero NO se pudieron bajar/
   * subir/registrar en la etapa 2 (fallo transitorio de Files API / Storage /
   * DB). >0 significa "Claude generó un archivo pero no se pudo adjuntar" → la
   * UI lo avisa para que el user pueda reintentar en vez de creer que no se
   * generó nada. 0/undefined cuando no falló ninguno.
   */
  filesFailed?: number;
  /**
   * True si SE PIDIÓ un archivo binario y no se capturó ningún `file_id`,
   * incluso si el modelo no llegó a invocar el sandbox.
   * Distinto de `filesFailed`, que cuenta archivos capturados que no se pudieron
   * persistir. Este caso antes quedaba MUDO (ver archivo-equivocado-audit.md).
   */
  filesMissing?: boolean;
  /**
   * La única llamada para un `.txt`/`.md` explícitamente pedido terminó sin
   * artifact ni archivo real. La UI puede ofrecer descargar el texto visible
   * como fallback honesto, sin persistirlo en `claude_files`.
   */
  textFileFallback?: {
    filename: string;
  };
  /** Claude terminó en un tool_use que el hub no sabe materializar. */
  toolDeliveryFailed?: {
    toolName: string;
  };
};

// ============================================================
// Interface ToolAdapter
// ============================================================
// Cada tool del catálogo implementa esta interfaz. Agregar una tool
// nueva = crear un nuevo archivo en lib/adapters/ + registrarlo en
// ./index.ts. El resto del sistema no se toca.
//
// Convención del proyecto: nada de `interface`, usar `type`.
// (ver 02-conventions.md). Acá es un Type alias de un object type, no
// una `interface`.

export type ToolAdapter = {
  readonly id: ToolId;
  readonly category: ToolCategory;
  /** Si maneja sistema de créditos (3DSky sí, Claude no). */
  readonly usesCredits: boolean;
  /** Si la tool se renderea via iframe embebido (3DSky sí, Claude no). */
  readonly isEmbedded: boolean;

  /** Estado de acceso del user a la tool. */
  checkAccess(userId: string): Promise<AccessState>;

  /** Loguea una acción del user sobre la tool. */
  logUsage(
    userId: string,
    action: string,
    metadata?: Record<string, unknown>,
  ): Promise<void>;

  // ─── opcionales ───

  /**
   * Tools con API directa (Claude). Ejecuta la operación principal.
   * Si se pasa `onText`, la respuesta se streamea: se invoca por cada
   * fragmento de texto a medida que el modelo lo genera. Igual resuelve
   * con el resultado completo al terminar.
   */
  execute?(
    userId: string,
    params: ExecuteParams,
    onText?: (delta: string) => void,
    /** Señales de estado durante la ejecución (ej. "generating_file" cuando
     *  Claude arranca a generar un archivo en el sandbox). La UI muestra un
     *  indicador mientras tanto. */
    onStatus?: (status: string) => void,
  ): Promise<Result<ExecuteResult>>;

  /** Tools con créditos. Cuántos le quedan al user. */
  getRemainingCredits?(userId: string): Promise<number>;

  /** Tools con créditos. Consume N créditos atómicamente. */
  consumeCredit?(
    userId: string,
    amount: number,
    reason: string,
  ): Promise<Result<{ remaining: number }>>;

  /** Tools embebidas. URL del iframe (o proxy). */
  getEmbedUrl?(userId: string): Promise<string>;
};
