import { createFileRoute } from "@tanstack/react-router";
import { generateAnswer } from "@/rag/generate";
import { retrieve } from "@/rag/retrieve";

async function POST({ request }: { request: Request }) {
  const body = await request.json();
  const { query, topK } = body as { query?: string; topK?: number };

  if (!query || typeof query !== "string") {
    return Response.json({ error: "query is required" }, { status: 400 });
  }

  const chunks = await retrieve(query, topK ?? 5);

  if (chunks.length === 0) {
    return Response.json({
      answer: "No documents have been ingested yet.",
      sources: [],
    });
  }

  const answer = await generateAnswer(
    query,
    chunks.map((c) => c.content),
  );

  return Response.json({ answer, sources: chunks });
}

export const Route = createFileRoute("/api/rag/query")({
  server: { handlers: { POST } },
});
