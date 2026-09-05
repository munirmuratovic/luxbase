export type HistoryTurn = {
  role: "user" | "assistant";
  text: string;
};

export function formatHistory(history: HistoryTurn[], limit = 6): string {
  const recent = history.slice(-limit);
  if (recent.length === 0) return "";
  return recent.map((t) => `${t.role}: ${t.text}`).join("\n");
}
