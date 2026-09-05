import { sql } from "drizzle-orm";
import { db } from "@/db";
import { documents } from "@/db/schema";
import { embed } from "./embeddings";

export async function retrieve(query: string, topK = 5) {
  const queryVector = await embed(query);
  const embeddingParam = JSON.stringify(queryVector);

  const rows = await db
    .select({
      id: documents.id,
      content: documents.content,
      source: documents.source,
      distance: sql<number>`embedding <=> ${embeddingParam}::vector`,
    })
    .from(documents)
    .orderBy(sql`embedding <=> ${embeddingParam}::vector`)
    .limit(topK);

  return rows;
}
