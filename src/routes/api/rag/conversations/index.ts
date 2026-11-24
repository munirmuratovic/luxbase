import { createFileRoute } from "@tanstack/react-router";
import {
  createConversation,
  listConversations,
} from "@/rag/conversations";

async function GET() {
  const rows = await listConversations();
  return Response.json({ conversations: rows });
}

async function POST() {
  const conversation = await createConversation();
  return Response.json({ conversation });
}

export const Route = createFileRoute("/api/rag/conversations/")({
  server: { handlers: { GET, POST } },
});
