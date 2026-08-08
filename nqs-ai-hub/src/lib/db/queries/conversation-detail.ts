/**
 * Armado compartido del payload de mensajes de una conversación
 * (orden, firmas Storage, claude_files + huérfanos).
 *
 * Usado por GET /api/me/conversations/[id] y GET /api/admin/conversations/[id].
 * El caller se encarga de ownership / gates antes de invocar.
 */
import { createServerClient } from "@/lib/db/supabase";
import { signDownloadUrls } from "@/lib/storage/claude-uploads";
import { orderPriorDeliveryMessages } from "@/lib/adapters/claude-binary-delivery";

export type ConversationMessagePayload = {
  id: string;
  role: "user" | "assistant";
  content: string;
  images: unknown;
  tokens_input: number | null;
  tokens_output: number | null;
  created_at: string | null;
  imageUrls: string[];
  pdfAttachments: Array<{ url: string; name: string }>;
  files: Array<{ id: string; name: string; mediaType: string }> | undefined;
};

/**
 * Carga mensajes + firma imágenes/PDFs + adjunta claude_files.
 * Lanza si hay error de DB.
 */
export async function buildConversationMessagesPayload(
  conversationId: string,
): Promise<ConversationMessagePayload[]> {
  const db = createServerClient();

  const { data: messages, error: msgErr } = await db
    .from("claude_messages")
    .select(
      "id, role, content, images, tokens_input, tokens_output, created_at",
    )
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (msgErr) throw msgErr;

  // User y assistant se insertan en un mismo batch y reciben el mismo NOW().
  // Postgres no garantiza el orden entre empates: normalizamos antes de firmar.
  const orderedMessages = orderPriorDeliveryMessages(messages ?? []);

  const allPaths: string[] = [];
  for (const m of orderedMessages) {
    const imgs = Array.isArray(m.images) ? (m.images as unknown[]) : [];
    for (const p of imgs) {
      if (typeof p === "string" && p.length > 0) allPaths.push(p);
    }
  }
  const signedByPath = new Map<string, string>();
  if (allPaths.length > 0) {
    const signed = await signDownloadUrls(allPaths);
    for (const s of signed) signedByPath.set(s.path, s.url);
  }

  const { data: files } = await db
    .from("claude_files")
    .select("id, message_id, name, media_type, created_at")
    .eq("conversation_id", conversationId);
  const filesByMessage = new Map<
    string,
    Array<{ id: string; name: string; mediaType: string }>
  >();

  // REGLA DURA (archivo-equivocado-audit.md): cada huérfano va al mensaje de
  // SU PROPIO turno, no al último assistant de la conversación.
  const orphanFiles: Array<{
    id: string;
    name: string;
    mediaType: string;
    createdAt: string | null;
  }> = [];
  for (const f of files ?? []) {
    if (!f.message_id) {
      orphanFiles.push({
        id: f.id,
        name: f.name,
        mediaType: f.media_type,
        createdAt: f.created_at,
      });
      continue;
    }
    const arr = filesByMessage.get(f.message_id) ?? [];
    arr.push({ id: f.id, name: f.name, mediaType: f.media_type });
    filesByMessage.set(f.message_id, arr);
  }
  if (orphanFiles.length > 0) {
    const assistantMsgs = orderedMessages.filter((m) => m.role === "assistant");
    for (const orphan of orphanFiles) {
      if (!orphan.createdAt) continue;
      const fileTime = new Date(orphan.createdAt).getTime();
      let ownerId: string | null = null;
      for (const m of assistantMsgs) {
        if (!m.created_at) continue;
        if (new Date(m.created_at).getTime() <= fileTime) ownerId = m.id;
        else break;
      }
      if (!ownerId) continue;
      const arr = filesByMessage.get(ownerId) ?? [];
      arr.push({
        id: orphan.id,
        name: orphan.name,
        mediaType: orphan.mediaType,
      });
      filesByMessage.set(ownerId, arr);
    }
  }

  return orderedMessages.map((m) => {
    const imgs = Array.isArray(m.images) ? (m.images as unknown[]) : [];
    const imageUrls: string[] = [];
    const pdfAttachments: Array<{ url: string; name: string }> = [];
    for (const p of imgs) {
      if (typeof p !== "string") continue;
      const url = signedByPath.get(p);
      if (!url) continue;
      if (p.toLowerCase().endsWith(".pdf")) {
        pdfAttachments.push({ url, name: "documento.pdf" });
      } else {
        imageUrls.push(url);
      }
    }
    return {
      ...m,
      role: m.role as "user" | "assistant",
      imageUrls,
      pdfAttachments,
      files: filesByMessage.get(m.id),
    };
  });
}
