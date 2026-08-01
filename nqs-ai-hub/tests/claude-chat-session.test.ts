import { describe, expect, test } from "vitest";
import {
  createClaudeChatSessionStore,
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
