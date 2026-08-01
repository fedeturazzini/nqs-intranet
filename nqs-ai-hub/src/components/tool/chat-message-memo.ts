import type { ChatMessage } from "@/lib/hooks/useClaudeChat";

export type MessageBubbleProps = Readonly<{
  msg: ChatMessage;
  userInitials: string;
  userFirstName: string;
}>;

export function areMessageBubblePropsEqual(
  previous: MessageBubbleProps,
  next: MessageBubbleProps,
): boolean {
  return (
    previous.msg === next.msg &&
    previous.userInitials === next.userInitials &&
    previous.userFirstName === next.userFirstName
  );
}
