const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "llama3.1";

type MemoryJudgement = {
  shouldSave: boolean;
  content: string;
};

export async function judgeForMemory(message: string): Promise<MemoryJudgement> {
  const prompt = `Decide whether this message contains a fact, preference, or instruction worth remembering for future conversations (e.g. personal details, decisions, stable facts). Casual chit-chat, greetings, or one-off questions are NOT worth saving.

Message: "${message}"

Respond with only JSON, no other text: {"shouldSave": true or false, "content": "the fact to remember, rewritten as a standalone statement, or empty string if shouldSave is false"}`;

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
    return {
      shouldSave: Boolean(parsed.shouldSave),
      content: typeof parsed.content === "string" ? parsed.content : "",
    };
  } catch {
    return { shouldSave: false, content: "" };
  }
}
