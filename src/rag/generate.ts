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

  const isQuestion = /\?\s*$/.test(query.trim());

  const prompt = isQuestion
    ? `You are a helpful assistant. Answer the question using the context below as directly as possible. If the context has nothing relevant, say so plainly.

Context:
${contextBlock}

${historyBlock ? `Conversation so far:\n${historyBlock}\n\n` : ""}Question: ${query}

Answer:`
    : `You are a helpful assistant having a casual conversation. React naturally to what the user just said — acknowledge it, comment on it, or continue the conversation. Use the background info below only if it's actually relevant.

Background info:
${contextBlock}

${historyBlock ? `Conversation so far:\n${historyBlock}\n\n` : ""}They just said: ${query}

Your reply:`;

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
