import { formatHistory, type HistoryTurn } from "./history";

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "llama3.1";

export async function generateAnswer(
  query: string,
  context: string[],
  history: HistoryTurn[] = [],
) {
  const contextBlock = context
    .map((chunk, i) => `[${i + 1}] ${chunk}`)
    .join("\n\n");

  const historyBlock = formatHistory(history);

  const prompt = `You are a helpful assistant. Use the context below to answer the question as directly as possible. Only say you don't know if the context truly has nothing relevant.

Context:
${contextBlock}

${historyBlock ? `Conversation so far:\n${historyBlock}\n\n` : ""}Latest message: ${query}

Answer:`;

  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt,
      stream: false,
    }),
  });

  if (!res.ok) {
    throw new Error(
      `Ollama request failed (${res.status}): ${await res.text()}`,
    );
  }

  const data = (await res.json()) as { response: string };
  return data.response.trim();
}
