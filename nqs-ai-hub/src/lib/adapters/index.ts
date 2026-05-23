/**
 * Registry de adapters.
 *
 * Agregar una tool nueva = importar su adapter y agregar la entrada
 * al record. El resto del sistema lee acá via `getAdapter(toolId)`.
 *
 * Las 5 tools "próximamente" del MVP usan `createPlaceholderAdapter`
 * — implementan la interfaz pero todo `notImplemented`.
 */
import { claudeAdapter } from "./claude";
import { threeDSkyAdapter } from "./three-dsky";
import type {
  AccessState,
  ToolAdapter,
  ToolCategory,
  ToolId,
} from "./types";

// ============================================================
// Placeholder adapter para tools "próximamente"
// ============================================================

export function createPlaceholderAdapter(
  id: ToolId,
  category: ToolCategory,
): ToolAdapter {
  return {
    id,
    category,
    usesCredits: false,
    isEmbedded: false,
    async checkAccess(): Promise<AccessState> {
      return { status: "locked" };
    },
    async logUsage(): Promise<void> {
      // no-op
    },
  };
}

// ============================================================
// Registry
// ============================================================

export const adapters: Record<ToolId, ToolAdapter> = {
  claude: claudeAdapter,
  "3dsky": threeDSkyAdapter,
  weavy: createPlaceholderAdapter("weavy", "visual"),
  kling: createPlaceholderAdapter("kling", "video"),
  runway: createPlaceholderAdapter("runway", "video"),
  elevenlabs: createPlaceholderAdapter("elevenlabs", "audio"),
  highsfield: createPlaceholderAdapter("highsfield", "video"),
};

export function getAdapter(toolId: ToolId): ToolAdapter {
  const adapter = adapters[toolId];
  if (!adapter) {
    throw new Error(`no hay adapter registrado para tool: ${toolId}`);
  }
  return adapter;
}

// Re-export de los types para que el resto del código importe desde
// `@/lib/adapters` sin tener que conocer la sub-ruta.
export type {
  AccessState,
  ExecuteParams,
  ExecuteResult,
  Result,
  ToolAdapter,
  ToolCategory,
  ToolId,
} from "./types";
