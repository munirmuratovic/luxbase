import { createFileRoute } from "@tanstack/react-router";
import {
  deleteConversation,
  getConversationMessages,
} from "@/rag/conversations";

async function GET(
  { params }: { params: { id: string } },
) {
  const { id } = params;
  const messages = await getConversationMessages(id);
  return Response.json({ messages });
}

async function DELETE(
  { params }: { params: { id: string } },
) {
  const { id } = params;
  await deleteConversation(id);
  return Response.json({ ok: true });
}

export const Route = createFileRoute("/api/rag/conversations/$id")({
  server: { handlers: { GET, DELETE } },
});
