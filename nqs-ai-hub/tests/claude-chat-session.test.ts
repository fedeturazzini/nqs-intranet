import { describe, expect, test } from "vitest";
import {
  createClaudeChatSessionStore,
  createInFlightRequestDeduper,
  reconcileMessages,
  resolveFinalResponseText,
  type ChatMessage,
} from "@/lib/hooks/useClaudeChat";

const PROJECT_ID = "11111111-1111-1111-1111-111111111111";
const CONVERSATION_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const CONVERSATION_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

function message(
  id: string,
  role: "user" | "assistant",
  content: string,
  extra: Partial<ChatMessage> = {},
): ChatMessage {
  return { id, role, content, ...extra };
}

describe("reconcileMessages", () => {
  test("conserva el turno optimista mientras su assistant sigue en vuelo", () => {
    const local = [
      message("local-user", "user", "pedido", {
        clientExecutionId: "exec-1",
      }),
      message("local-assistant", "assistant", "", {
        clientExecutionId: "exec-1",
        isPending: true,
      }),
    ];
    const server = [message("old", "assistant", "respuesta anterior")];

    expect(reconcileMessages(server, local)).toEqual([...server, ...local]);
  });

  test("conserva el user mientras sus adjuntos todavía se están subiendo", () => {
    const local = [
      message("local-user", "user", "pedido con imagen", {
        clientExecutionId: "exec-upload",
        uploadingAttachments: true,
        imagePreviews: ["data:image/png;base64,preview"],
      }),
    ];
    const server = [message("old", "assistant", "respuesta anterior")];

    expect(reconcileMessages(server, local)).toEqual([...server, ...local]);
  });

  test("al completar usa la DB como verdad y elimina optimistas del turno", () => {
    const local = [
      message("local-user", "user", "pedido", {
        clientExecutionId: "exec-1",
      }),
      message("assistant-real", "assistant", "respuesta", {
        clientExecutionId: "exec-1",
        streaming: false,
      }),
    ];
    const server = [
      message("user-real", "user", "pedido"),
      message("assistant-real", "assistant", "respuesta"),
    ];

    expect(reconcileMessages(server, local)).toEqual(server);
  });

  test("mantiene files exclusivamente en el message_id que devuelve el server", () => {
    const fileA = { id: "file-a", name: "a.txt", mediaType: "text/plain" };
    const fileB = { id: "file-b", name: "b.txt", mediaType: "text/plain" };
    const server = [
      message("assistant-a", "assistant", "A", { files: [fileA] }),
      message("assistant-b", "assistant", "B", { files: [fileB] }),
    ];

    const reconciled = reconcileMessages(server, []);
    expect(reconciled[0].files).toEqual([fileA]);
    expect(reconciled[1].files).toEqual([fileB]);
  });

  test("preserva files de done si el GET del mismo mensaje todavía está atrasado", () => {
    const file = { id: "file-a", name: "entrega.txt", mediaType: "text/plain" };
    const server = [message("assistant-a", "assistant", "respuesta A")];
    const local = [
      message("assistant-a", "assistant", "respuesta A", { files: [file] }),
    ];

    const reconciled = reconcileMessages(server, local);
    expect(reconciled[0].files).toEqual([file]);
  });

  test("preserva fallback TXT solo por message_id exacto al reconciliar", () => {
    const server = [
      message("assistant-a", "assistant", "respuesta A"),
      message("assistant-b", "assistant", "respuesta B"),
    ];
    const local = [
      message("assistant-a", "assistant", "respuesta A", {
        textFileFallback: { filename: "a.txt" },
      }),
    ];

    const reconciled = reconcileMessages(server, local);
    expect(reconciled[0].textFileFallback).toEqual({ filename: "a.txt" });
    expect(reconciled[1].textFileFallback).toBeUndefined();
  });

  test("preserva fallo de tool_use solo por message_id exacto", () => {
    const server = [
      message("assistant-a", "assistant", "respuesta A"),
      message("assistant-b", "assistant", "respuesta B"),
    ];
    const local = [
      message("assistant-b", "assistant", "respuesta B", {
        toolDeliveryFailed: { toolName: "otra_tool" },
      }),
    ];

    const reconciled = reconcileMessages(server, local);
    expect(reconciled[0].toolDeliveryFailed).toBeUndefined();
    expect(reconciled[1].toolDeliveryFailed).toEqual({
      toolName: "otra_tool",
    });
  });
});

describe("resolveFinalResponseText", () => {
  test("done.text reemplaza deltas parciales aunque ya haya contenido", () => {
    const streamed = "Listo, lo genero.";
    const done = `${streamed}\n<function_calls>artifact completo</function_calls>`;

    expect(resolveFinalResponseText(streamed, done)).toBe(done);
  });

  test("usa los deltas solo si done no trae texto", () => {
    expect(resolveFinalResponseText("respuesta stream", undefined)).toBe(
      "respuesta stream",
    );
  });
});

describe("createClaudeChatSessionStore", () => {
  test("prepara el user y recién agrega pensando al completar el upload", () => {
    const store = createClaudeChatSessionStore();
    const turn = store.prepareAttachmentTurn(
      PROJECT_ID,
      "analizá estas imágenes",
      ["data:image/png;base64,preview"],
      [],
    );

    expect(store.active().messages).toHaveLength(1);
    expect(store.active().messages[0]).toMatchObject({
      id: turn.userMessageId,
      role: "user",
      uploadingAttachments: true,
    });
    expect(store.active().isSending).toBe(false);

    expect(store.promoteAttachmentTurn(turn)).toBe(true);
    expect(store.active().messages).toHaveLength(2);
    expect(store.active().messages[0].uploadingAttachments).toBe(false);
    expect(store.active().messages[1]).toMatchObject({
      id: turn.pendingMessageId,
      role: "assistant",
      isPending: true,
    });
    expect(store.active().isSending).toBe(true);
  });

  test("rollback elimina solo el turno cuyo upload falló", () => {
    const store = createClaudeChatSessionStore();
    const session = store.ensureProject(PROJECT_ID);
    store.update(session.key, (current) => ({
      ...current,
      messages: [message("old", "assistant", "respuesta anterior")],
    }));
    const turn = store.prepareAttachmentTurn(
      PROJECT_ID,
      "pedido con adjuntos",
      ["data:image/png;base64,preview"],
      [],
    );

    expect(store.rollbackAttachmentTurn(turn)).toBe(true);
    expect(store.active().messages).toEqual([
      message("old", "assistant", "respuesta anterior"),
    ]);
  });

  test("upload preparado en una sesión inactiva no contamina la activa", () => {
    const store = createClaudeChatSessionStore();
    const turn = store.prepareAttachmentTurn(
      PROJECT_ID,
      "pedido A",
      ["data:image/png;base64,a"],
      [],
    );
    const loadB = store.beginLoad(PROJECT_ID, CONVERSATION_B);
    store.applyLoad(loadB, [message("b", "assistant", "respuesta B")]);

    expect(store.promoteAttachmentTurn(turn)).toBe(true);
    expect(store.active().conversationId).toBe(CONVERSATION_B);
    expect(store.active().messages[0].content).toBe("respuesta B");

    let inactiveMessages: ChatMessage[] = [];
    store.update(turn.sessionKey, (session) => {
      inactiveMessages = session.messages;
      return session;
    });
    expect(inactiveMessages).toHaveLength(2);
    expect(inactiveMessages[0].content).toBe("pedido A");
    expect(inactiveMessages[1].isPending).toBe(true);
  });

  test("un mount nuevo recupera la sesión pending del mismo proyecto", () => {
    const store = createClaudeChatSessionStore();
    const draft = store.ensureProject(PROJECT_ID);
    store.update(draft.key, (session) => ({
      ...session,
      isSending: true,
      messages: [
        message("pending", "assistant", "", {
          clientExecutionId: "exec-1",
          isPending: true,
        }),
      ],
    }));

    const restored = store.ensureProject(PROJECT_ID);
    expect(restored.key).toBe(draft.key);
    expect(restored.isSending).toBe(true);
    expect(restored.messages[0].isPending).toBe(true);
  });

  test("si dos cargas se cruzan solo gana la selección más reciente", () => {
    const store = createClaudeChatSessionStore();
    const loadA = store.beginLoad(PROJECT_ID, CONVERSATION_A);
    const loadB = store.beginLoad(PROJECT_ID, CONVERSATION_B);

    expect(
      store.applyLoad(loadA, [message("a", "assistant", "respuesta A")]),
    ).toBe(false);
    expect(
      store.applyLoad(loadB, [message("b", "assistant", "respuesta B")]),
    ).toBe(true);
    expect(store.active().conversationId).toBe(CONVERSATION_B);
    expect(store.active().messages[0].content).toBe("respuesta B");
  });

  test("primera carga expone loading y lo limpia al aplicar mensajes", () => {
    const store = createClaudeChatSessionStore();
    const load = store.beginLoad(PROJECT_ID, CONVERSATION_A);

    expect(store.active().conversationId).toBe(CONVERSATION_A);
    expect(store.active().messages).toEqual([]);
    expect(store.active().isLoadingConversation).toBe(true);

    store.applyLoad(load, [message("a", "assistant", "respuesta A")]);
    expect(store.active().isLoadingConversation).toBe(false);
  });

  test("al revalidar conserva inmediatamente el cache de esa conversación", () => {
    const store = createClaudeChatSessionStore();
    const initial = store.beginLoad(PROJECT_ID, CONVERSATION_A);
    store.applyLoad(initial, [message("a", "assistant", "respuesta cacheada")]);

    const revalidation = store.beginLoad(PROJECT_ID, CONVERSATION_A);
    expect(store.active().isLoadingConversation).toBe(true);
    expect(store.active().messages[0].content).toBe("respuesta cacheada");

    store.applyLoad(revalidation, [
      message("a", "assistant", "respuesta actualizada"),
    ]);
    expect(store.active().isLoadingConversation).toBe(false);
    expect(store.active().messages[0].content).toBe("respuesta actualizada");
  });

  test("un error obsoleto no contamina ni finaliza la selección actual", () => {
    const store = createClaudeChatSessionStore();
    const loadA = store.beginLoad(PROJECT_ID, CONVERSATION_A);
    const loadB = store.beginLoad(PROJECT_ID, CONVERSATION_B);

    expect(store.failLoad(loadA, "falló A")).toBe(false);
    expect(store.active().conversationId).toBe(CONVERSATION_B);
    expect(store.active().isLoadingConversation).toBe(true);
    expect(store.active().loadError).toBeNull();

    expect(store.failLoad(loadB, "falló B")).toBe(true);
    expect(store.active().isLoadingConversation).toBe(false);
    expect(store.active().loadError).toBe("falló B");
  });

  test("A → B → A nunca aplica respuestas de una selección anterior", () => {
    const store = createClaudeChatSessionStore();
    const firstA = store.beginLoad(PROJECT_ID, CONVERSATION_A);
    const loadB = store.beginLoad(PROJECT_ID, CONVERSATION_B);
    const latestA = store.beginLoad(PROJECT_ID, CONVERSATION_A);

    expect(
      store.applyLoad(firstA, [message("a-old", "assistant", "A vieja")]),
    ).toBe(false);
    expect(
      store.applyLoad(loadB, [message("b", "assistant", "respuesta B")]),
    ).toBe(false);
    expect(
      store.applyLoad(latestA, [message("a-new", "assistant", "A nueva")]),
    ).toBe(true);
    expect(store.active().conversationId).toBe(CONVERSATION_A);
    expect(store.active().messages[0].content).toBe("A nueva");
  });

  test("un done tardío de un draft inactivo no roba la conversación visible", () => {
    const store = createClaudeChatSessionStore();
    const draftA = store.ensureProject(PROJECT_ID);
    store.update(draftA.key, (session) => ({
      ...session,
      messages: [
        message("pending-a", "assistant", "", {
          clientExecutionId: "exec-a",
          isPending: true,
        }),
      ],
    }));

    const loadB = store.beginLoad(PROJECT_ID, CONVERSATION_B);
    store.applyLoad(loadB, [message("b", "assistant", "respuesta B")]);

    store.update(draftA.key, (session) => ({
      ...session,
      messages: [message("assistant-a", "assistant", "respuesta A")],
    }));
    store.migrateToConversation(draftA.key, CONVERSATION_A);

    expect(store.active().conversationId).toBe(CONVERSATION_B);
    expect(store.active().messages[0].content).toBe("respuesta B");
  });

  test("solo aplica la reconciliación más reciente de una sesión", () => {
    const store = createClaudeChatSessionStore();
    const session = store.ensureProject(PROJECT_ID);
    const oldSync = store.beginReconcile(session.key);
    const latestSync = store.beginReconcile(session.key);

    expect(oldSync).not.toBeNull();
    expect(latestSync).not.toBeNull();
    expect(
      store.applyReconcile(oldSync!, [
        message("old", "assistant", "snapshot viejo"),
      ]),
    ).toBe(false);
    expect(
      store.applyReconcile(latestSync!, [
        message("new", "assistant", "snapshot nuevo"),
      ]),
    ).toBe(true);
    expect(store.active().messages[0].content).toBe("snapshot nuevo");
  });

  test("reconcilia la sesión correcta aunque ya no esté activa", () => {
    const store = createClaudeChatSessionStore();
    const sessionA = store.ensureProject(PROJECT_ID);
    const syncA = store.beginReconcile(sessionA.key);
    const loadB = store.beginLoad(PROJECT_ID, CONVERSATION_B);
    store.applyLoad(loadB, [message("b", "assistant", "respuesta B")]);

    expect(syncA).not.toBeNull();
    expect(
      store.applyReconcile(syncA!, [
        message("a", "assistant", "respuesta A"),
      ]),
    ).toBe(true);
    expect(store.active().conversationId).toBe(CONVERSATION_B);
    expect(store.active().messages[0].content).toBe("respuesta B");

    let inactiveMessages: ChatMessage[] = [];
    store.update(sessionA.key, (session) => {
      inactiveMessages = session.messages;
      return session;
    });
    expect(inactiveMessages[0].content).toBe("respuesta A");
  });
});

describe("createInFlightRequestDeduper", () => {
  test("comparte un request simultáneo y permite revalidar después", async () => {
    const dedupe = createInFlightRequestDeduper<string>();
    let calls = 0;
    let resolve!: (value: string) => void;
    const loader = () => {
      calls += 1;
      return new Promise<string>((done) => {
        resolve = done;
      });
    };

    const first = dedupe(CONVERSATION_A, loader);
    const second = dedupe(CONVERSATION_A, loader);
    expect(first).toBe(second);
    expect(calls).toBe(1);

    resolve("ok");
    await expect(Promise.all([first, second])).resolves.toEqual(["ok", "ok"]);
    await expect(
      dedupe(CONVERSATION_A, async () => {
        calls += 1;
        return "fresh";
      }),
    ).resolves.toBe("fresh");
    expect(calls).toBe(2);
  });
});
