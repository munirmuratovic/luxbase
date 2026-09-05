import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { chatMessages, conversations } from "@/db/schema";

export type ChatMessageInput = {
  role: "user" | "assistant";
  text: string;
  sources?: unknown;
  remembered?: string[] | null;
};

export async function createConversation(title = "New chat") {
  const [row] = await db.insert(conversations).values({ title }).returning();
  return row;
}

export async function listConversations() {
  return db
    .select()
    .from(conversations)
    .orderBy(desc(conversations.updatedAt));
}

export async function getConversationMessages(conversationId: string) {
  return db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.conversationId, conversationId))
    .orderBy(chatMessages.createdAt);
}

export async function addMessage(
  conversationId: string,
  message: ChatMessageInput,
) {
  await db.insert(chatMessages).values({
    conversationId,
    role: message.role,
    text: message.text,
    sources: message.sources ?? null,
    remembered: message.remembered ?? null,
  });
  await db
    .update(conversations)
    .set({ updatedAt: new Date() })
    .where(eq(conversations.id, conversationId));
}

export async function renameConversationFromFirstMessage(
  conversationId: string,
  text: string,
) {
  const title = text.trim().slice(0, 60) || "New chat";
  await db
    .update(conversations)
    .set({ title })
    .where(eq(conversations.id, conversationId));
}

export async function deleteConversation(conversationId: string) {
  await db.delete(conversations).where(eq(conversations.id, conversationId));
}
