const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "llama3.1";

const QUESTION_STARTERS =
  /^(what|who|when|where|why|how|which|is|are|do|does|did|can|could|should|would|will|has|have)\b/i;

export type MemoryFact = {
  subject: string;
  attribute: string;
  value: string;
};

export type MemoryJudgement = {
  shouldSave: boolean;
  facts: MemoryFact[];
};

function looksLikeQuestion(message: string): boolean {
  const trimmed = message.trim();
  return trimmed.endsWith("?") || QUESTION_STARTERS.test(trimmed);
}

export async function judgeForMemory(message: string): Promise<MemoryJudgement> {
  if (looksLikeQuestion(message)) {
    return { shouldSave: false, facts: [] };
  }

  const prompt = `Extract any facts, preferences, or instructions about the user from this message, as structured key-value entries. Only extract things explicitly stated — never invent values.

Do NOT extract anything if the message has no clear statement about the user (e.g. small talk, commands unrelated to the user, vague remarks).

Each fact has:
- subject: who/what it's about (usually "user")
- attribute: short snake_case name for the kind of fact (e.g. "name", "location", "theme_preference", "job")
- value: the actual fact, as a short standalone phrase

Examples:
Message: "My name is Alex and I work in finance." -> {"shouldSave": true, "facts": [{"subject":"user","attribute":"name","value":"Alex"},{"subject":"user","attribute":"job","value":"works in finance"}]}
Message: "hey how's it going" -> {"shouldSave": false, "facts": []}
Message: "From now on, always answer in bullet points." -> {"shouldSave": true, "facts": [{"subject":"user","attribute":"response_style","value":"always answer in bullet points"}]}
Message: "My favorite color is blue." -> {"shouldSave": true, "facts": [{"subject":"user","attribute":"favorite_color","value":"blue"}]}
Message: "I prefer dark mode." -> {"shouldSave": true, "facts": [{"subject":"user","attribute":"theme_preference","value":"dark mode"}]}

Message: "${message}"

Respond with only JSON, no other text: {"shouldSave": true or false, "facts": [{"subject": "...", "attribute": "...", "value": "..."}]}`;

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

  if (!res.ok) {
    throw new Error(
      `Ollama request failed (${res.status}): ${await res.text()}`,
    );
  }

  const data = (await res.json()) as { response: string };

  try {
    const parsed = JSON.parse(data.response) as Partial<MemoryJudgement>;
    const facts = Array.isArray(parsed.facts)
      ? parsed.facts.filter(
          (f): f is MemoryFact =>
            typeof f?.subject === "string" &&
            typeof f?.attribute === "string" &&
            typeof f?.value === "string" &&
            f.subject.length > 0 &&
            f.attribute.length > 0 &&
            f.value.length > 0,
        )
      : [];
    return { shouldSave: facts.length > 0, facts };
  } catch {
    return { shouldSave: false, facts: [] };
  }
}
