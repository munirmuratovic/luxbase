import {
  deleteConversation,
  getConversationMessages,
} from "@/rag/conversations";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const messages = await getConversationMessages(id);
  return Response.json({ messages });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await deleteConversation(id);
  return Response.json({ ok: true });
}
