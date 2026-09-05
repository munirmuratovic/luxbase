import { generateAnswer } from "@/rag/generate";
import { saveMemory } from "@/rag/ingest";
import { judgeForMemory } from "@/rag/memory";
import { retrieve } from "@/rag/retrieve";

export async function POST(request: Request) {
  const body = await request.json();
  const { message } = body as { message?: string };

  if (!message || typeof message !== "string") {
    return Response.json({ error: "message is required" }, { status: 400 });
  }

  const [chunks, judgement] = await Promise.all([
    retrieve(message),
    judgeForMemory(message),
  ]);

  if (judgement.shouldSave && judgement.content) {
    await saveMemory(judgement.content);
  }

  const answer = await generateAnswer(
    message,
    chunks.map((c) => c.content),
  );

  return Response.json({
    answer,
    sources: chunks,
    remembered: judgement.shouldSave ? judgement.content : null,
  });
}
