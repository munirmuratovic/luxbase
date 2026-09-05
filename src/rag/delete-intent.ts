const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "llama3.1";

const DELETE_HINT =
  /\b(forget|delete|remove|erase|clear)\b.{0,40}\b(memory|memories|that|this|my|about|it|fact|preference|record)\b|^(forget|delete|remove|erase)\b/i;

export function looksLikeDeleteIntent(message: string): boolean {
  return DELETE_HINT.test(message);
}

export type DeleteTarget = {
  subject: string;
  attribute: string;
};

export async function resolveDeleteTarget(
  message: string,
  existingMemories: { subject: string; attribute: string; value: string }[],
): Promise<DeleteTarget | null> {
  if (existingMemories.length === 0) return null;

  const memoryList = existingMemories
    .map((m) => `- ${m.subject}.${m.attribute} = "${m.value}"`)
    .join("\n");

  const prompt = `The user wants to delete/forget something from their stored memories. Given the message and the list of currently stored memories, identify which single memory (by subject and attribute) they want deleted.

Stored memories:
${memoryList}

Message: "${message}"

If none of the stored memories clearly match what the user wants deleted, respond with {"subject": null, "attribute": null}.

Respond with only JSON, no other text: {"subject": "...", "attribute": "..."}`;

  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt,
      stream: false,
      format: "json",
      options: { temperature: 0 },
    }),
  });

  if (!res.ok) return null;

  const data = (await res.json()) as { response: string };
  try {
    const parsed = JSON.parse(data.response) as {
      subject?: string | null;
      attribute?: string | null;
    };
    if (!parsed.subject || !parsed.attribute) return null;

    const match = existingMemories.find(
      (m) => m.subject === parsed.subject && m.attribute === parsed.attribute,
    );
    return match ? { subject: match.subject, attribute: match.attribute } : null;
  } catch {
    return null;
  }
}
