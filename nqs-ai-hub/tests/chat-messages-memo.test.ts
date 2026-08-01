import { describe, expect, test } from "vitest";
import { areMessageBubblePropsEqual } from "@/components/tool/chat-message-memo";
import type { ChatMessage } from "@/lib/hooks/useClaudeChat";

const finishedMessage: ChatMessage = {
  id: "assistant-finished",
  role: "assistant",
  content: "respuesta completa",
  streaming: false,
};

describe("areMessageBubblePropsEqual", () => {
  test("salta el render de un mensaje terminado con la misma referencia", () => {
    const props = {
      msg: finishedMessage,
      userInitials: "FT",
      userFirstName: "Federico",
    };

    expect(areMessageBubblePropsEqual(props, props)).toBe(true);
  });

  test("renderiza de nuevo el assistant activo cuando cambia su objeto", () => {
    const previous = {
      msg: {
        ...finishedMessage,
        id: "assistant-active",
        content: "texto",
        streaming: true,
      },
      userInitials: "FT",
      userFirstName: "Federico",
    };
    const next = {
      ...previous,
      msg: { ...previous.msg, content: "texto nuevo" },
    };

    expect(areMessageBubblePropsEqual(previous, next)).toBe(false);
  });
});
