const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "llama3.1";

const DELETE_HINT =
  /\b(forget|delete|remove|erase|clear)\b.{0,40}\b(memory|memories|that|this|my|about|it|fact|preference|record|job|role|entry)\b|^(forget|delete|remove|erase)\b/i;

export function looksLikeDeleteIntent(message: string): boolean {
  return DELETE_HINT.test(message);
}

export type MemoryTarget = {
  kind: "memory";
  subject: string;
  attribute: string;
};

export type RecordTarget = {
  kind: "record";
  id: string;
  description: string;
};

export type DeleteTarget = MemoryTarget | RecordTarget;

type MemoryRow = { subject: string; attribute: string; value: string };
type RecordRow = { id: string; type: string; data: Record<string, unknown> };

function describeRecord(r: RecordRow): string {
  if (r.type === "work_experience") {
    const title = r.data.title ?? "role";
    const company = r.data.company ?? "unknown company";
    return `${title} at ${company}`;
  }
  return `${r.type} record`;
}

export async function resolveDeleteTarget(
  message: string,
  existingMemories: MemoryRow[],
  existingRecords: RecordRow[] = [],
): Promise<DeleteTarget | null> {
  if (existingMemories.length === 0 && existingRecords.length === 0) {
    return null;
  }

  const memoryList = existingMemories
    .map((m, i) => `M${i}: ${m.subject}.${m.attribute} = "${m.value}"`)
    .join("\n");
  const recordList = existingRecords
    .map((r, i) => `R${i}: ${describeRecord(r)}`)
    .join("\n");

  const prompt = `The user wants to delete/forget something from their stored data. Given the message and the lists below, identify which single item they want deleted, by its label (e.g. "M2" or "R0").

Memories:
${memoryList || "(none)"}

Records:
${recordList || "(none)"}

Message: "${message}"

If nothing clearly matches, respond with {"label": null}.

Respond with only JSON, no other text: {"label": "M2" or "R0" or null}`;

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
    const parsed = JSON.parse(data.response) as { label?: string | null };
    if (!parsed.label) return null;

    const memoryMatch = parsed.label.match(/^M(\d+)$/);
    if (memoryMatch) {
      const m = existingMemories[Number(memoryMatch[1])];
      return m ? { kind: "memory", subject: m.subject, attribute: m.attribute } : null;
    }

    const recordMatch = parsed.label.match(/^R(\d+)$/);
    if (recordMatch) {
      const r = existingRecords[Number(recordMatch[1])];
      return r ? { kind: "record", id: r.id, description: describeRecord(r) } : null;
    }

    return null;
  } catch {
    return null;
  }
}
