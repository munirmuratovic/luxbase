import { ingestDocument } from "@/rag/ingest";

export async function POST(request: Request) {
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
