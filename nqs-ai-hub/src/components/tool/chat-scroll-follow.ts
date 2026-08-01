export const CHAT_BOTTOM_THRESHOLD_PX = 24;

export function shouldAttachChatScrollListeners(messageCount: number): boolean {
  return messageCount > 0;
}

type ScrollFollowInput = {
  isFollowing: boolean;
  previousScrollTop: number;
  scrollTop: number;
  distanceFromBottom: number;
  manualUp?: boolean;
};

export function shouldFollowChatScroll({
  isFollowing,
  previousScrollTop,
  scrollTop,
  distanceFromBottom,
  manualUp = false,
}: ScrollFollowInput): boolean {
  if (manualUp || scrollTop < previousScrollTop - 1) return false;
  if (distanceFromBottom <= CHAT_BOTTOM_THRESHOLD_PX) return true;
  return isFollowing;
}
