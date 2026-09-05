import {
  createConversation,
  listConversations,
} from "@/rag/conversations";

export async function GET() {
  const rows = await listConversations();
  return Response.json({ conversations: rows });
}

export async function POST() {
  const conversation = await createConversation();
  return Response.json({ conversation });
}
