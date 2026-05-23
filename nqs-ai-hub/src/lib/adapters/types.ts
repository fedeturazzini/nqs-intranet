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

export type ExecuteImage = {
  type: "base64";
  media_type: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
  data: string;
};

export type ExecuteParams = {
  prompt: string;
  images?: ExecuteImage[];
  /** Si viene, se appendea a la conversación existente. Si no, se crea una nueva. */
  conversationId?: string;
};

export type ExecuteResult = {
  text: string;
  tokensInput: number;
  tokensOutput: number;
  conversationId: string;
  messageId: string;
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

  /** Tools con API directa (Claude). Ejecuta la operación principal. */
  execute?(
    userId: string,
    params: ExecuteParams,
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
