import { createFileRoute } from "@tanstack/react-router";
import { ingestDocument } from "@/rag/ingest";

async function POST({ request }: { request: Request }) {
  const body = await request.json();
  const { content, source } = body as { content?: string; source?: string };

  if (!content || typeof content !== "string") {
    return Response.json(
      { error: "content is required" },
      { status: 400 },
    );
  }

  const result = await ingestDocument(content, source);
  return Response.json(result);
}

export const Route = createFileRoute("/api/rag/ingest")({
  server: { handlers: { POST } },
});
