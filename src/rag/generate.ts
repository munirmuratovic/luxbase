import { formatHistory, type HistoryTurn } from "./history";

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "llama3.1";

function buildPrompt(query: string, context: string[], history: HistoryTurn[]) {
  const contextBlock = context
    .map((chunk, i) => `[${i + 1}] ${chunk}`)
    .join("\n\n");

  const historyBlock = formatHistory(history);

  const isQuestion = /\?\s*$/.test(query.trim());

  return isQuestion
    ? `You are a helpful assistant. Answer the question below as directly and specifically as possible — stay strictly on the topic the user actually asked about, do not pivot to a related-but-different topic. The context is optional background: use it only if it directly helps answer this exact question, and ignore any part of it that isn't about what was asked. If nothing relevant is available, say so plainly instead of substituting a different topic.

Context (optional, may be irrelevant):
${contextBlock}

${historyBlock ? `Conversation so far:\n${historyBlock}\n\n` : ""}Question: ${query}

Answer the question above directly, on-topic, without changing the subject:`
    : `You are a helpful assistant having a casual conversation. React naturally and specifically to what the user just said — stay on the exact topic they raised, do not steer the conversation to a different subject. Use the background info below only if it's directly relevant to what they just said; ignore it otherwise.

Background info (optional, may be irrelevant):
${contextBlock}

${historyBlock ? `Conversation so far:\n${historyBlock}\n\n` : ""}They just said: ${query}

Reply directly to what they just said, on-topic:`;
}

export async function generateAnswer(
  query: string,
  context: string[],
  history: HistoryTurn[] = [],
) {
  const prompt = buildPrompt(query, context, history);

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

export async function* streamAnswer(
  query: string,
  context: string[],
  history: HistoryTurn[] = [],
): AsyncGenerator<string, void, unknown> {
  const prompt = buildPrompt(query, context, history);

  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt,
      stream: true,
    }),
  });

  if (!res.ok || !res.body) {
    throw new Error(
      `Ollama request failed (${res.status}): ${await res.text()}`,
    );
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      const chunk = JSON.parse(line) as { response: string; done: boolean };
      if (chunk.response) yield chunk.response;
    }
  }

  if (buffer.trim()) {
    const chunk = JSON.parse(buffer) as { response: string; done: boolean };
    if (chunk.response) yield chunk.response;
  }
}
