import { formatHistory, type HistoryTurn } from "./history";

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

export async function judgeForMemory(
  message: string,
  history: HistoryTurn[] = [],
  existingMemories: MemoryFact[] = [],
): Promise<MemoryJudgement> {
  if (looksLikeQuestion(message)) {
    return { shouldSave: false, facts: [] };
  }

  const historyBlock = formatHistory(history);
  const memoryBlock = existingMemories
    .map((m) => `- ${m.subject}.${m.attribute} = "${m.value}"`)
    .join("\n");

  const prompt = `Extract every fact, preference, opinion, or instruction about the user from the latest message, as structured key-value entries. Only extract things explicitly stated — never invent values. Lean toward extracting: a short, casual statement like "I like cars" or "I'm tired" still counts.

The latest message may refer back to earlier turns (e.g. "save it", "remember that", "yes, that's right") — use the conversation so far to resolve what "it"/"that" refers to, and extract facts from the referenced content, not just the literal wording of the latest message.

Only produce zero facts if there is truly nothing to save — pure greetings ("hey", "thanks"), acknowledgements ("ok", "got it"), questions, or a save-request with nothing concrete in the conversation to save.

Never invent a fact out of filler words in the instruction itself (e.g. "as of now", "right now", "at the moment" are not facts) — if the message and conversation contain no actual concrete detail (a name, place, job, preference, etc.), return zero facts rather than fabricating one from the sentence structure.

Reuse existing attribute names when a new fact updates or restates something already stored below — do not invent a new attribute name (like "current_job" or "career") for a concept that already has an attribute (like "job"). Only create a new attribute when the fact is about something genuinely not covered yet.

If multiple existing attributes overlap in meaning (e.g. both "job" and "current_job" describe the user's role), still extract and save the update — pick the most canonical-looking one of the overlapping attributes as the target, even though this leaves the redundant one stale. Never skip saving a genuine change in value just because a similarly-named attribute already exists with an outdated value.

Each fact has:
- subject: who/what it's about (usually "user")
- attribute: short snake_case name for the kind of fact (e.g. "name", "location", "theme_preference", "job", "likes")
- value: the actual fact, as a short standalone phrase

Examples:
Message: "My name is Alex and I work in finance." -> {"facts": [{"subject":"user","attribute":"name","value":"Alex"},{"subject":"user","attribute":"job","value":"works in finance"}]}
Message: "hey how's it going" -> {"facts": []}
Message: "From now on, always answer in bullet points." -> {"facts": [{"subject":"user","attribute":"response_style","value":"always answer in bullet points"}]}
Message: "I like cars." -> {"facts": [{"subject":"user","attribute":"likes","value":"cars"}]}
Message: "I prefer dark mode." -> {"facts": [{"subject":"user","attribute":"theme_preference","value":"dark mode"}]}
Message: "thanks!" -> {"facts": []}
Message: "This is my career as of now, save it." (no prior conversation) -> {"facts": []}
Existing memories:
- user.job = "Software Engineer"
Message: "I got promoted, I'm a Senior Software Engineer now." -> {"facts": [{"subject":"user","attribute":"job","value":"Senior Software Engineer"}]}
Conversation so far:
user: I just moved to Berlin.
Message: "save it" -> {"facts": [{"subject":"user","attribute":"location","value":"Berlin"}]}

${memoryBlock ? `Existing memories:\n${memoryBlock}\n\n` : ""}${historyBlock ? `Conversation so far:\n${historyBlock}\n\n` : ""}Message: "${message}"

Respond with only JSON, no other text: {"facts": [{"subject": "...", "attribute": "...", "value": "..."}]}`;

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
