export const CONVERSATION_DATE_GROUPS = [
  { key: "today", label: "HOY" },
  { key: "yesterday", label: "AYER" },
  { key: "last-seven-days", label: "ÚLTIMOS 7 DÍAS" },
  { key: "older", label: "ANTERIORES" },
] as const;

export type ConversationDateGroup =
  (typeof CONVERSATION_DATE_GROUPS)[number]["key"];

export type ConversationDateMeta = {
  group: ConversationDateGroup;
  compact: string | null;
  exact: string | null;
};

const timeFormatter = new Intl.DateTimeFormat("es-AR", {
  hour: "2-digit",
  minute: "2-digit",
});

function calendarDayNumber(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

export function getConversationDateMeta(
  timestamp: string | null,
  now = new Date(),
): ConversationDateMeta {
  if (!timestamp) {
    return { group: "older", compact: null, exact: null };
  }

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return { group: "older", compact: null, exact: null };
  }

  const dayDifference = Math.round(
    (calendarDayNumber(now) - calendarDayNumber(date)) / 86_400_000,
  );

  let group: ConversationDateGroup;
  if (dayDifference <= 0) {
    group = "today";
  } else if (dayDifference === 1) {
    group = "yesterday";
  } else if (dayDifference <= 7) {
    group = "last-seven-days";
  } else {
    group = "older";
  }

  let compact: string;
  if (group === "today") {
    compact = timeFormatter.format(date);
  } else if (group === "yesterday") {
    compact = `ayer · ${timeFormatter.format(date)}`;
  } else {
    compact = new Intl.DateTimeFormat("es-AR", {
      day: "numeric",
      month: "short",
      ...(date.getFullYear() !== now.getFullYear()
        ? { year: "numeric" as const }
        : {}),
    }).format(date);
  }

  const exact = new Intl.DateTimeFormat("es-AR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);

  return { group, compact, exact };
}
