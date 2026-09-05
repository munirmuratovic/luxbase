import { sql } from "drizzle-orm";
import { db } from "@/db";
import { documents, memories } from "@/db/schema";
import { embed } from "./embeddings";

export type RetrievedChunk = {
  id: string;
  content: string;
  source: string | null;
  distance: number;
};

export async function retrieve(query: string, topK = 5): Promise<RetrievedChunk[]> {
  const queryVector = await embed(query);
  const embeddingParam = JSON.stringify(queryVector);

  const [docRows, memoryRows] = await Promise.all([
    db
      .select({
        id: documents.id,
        content: documents.content,
        source: documents.source,
        distance: sql<number>`embedding <=> ${embeddingParam}::vector`,
      })
      .from(documents)
      .orderBy(sql`embedding <=> ${embeddingParam}::vector`)
      .limit(topK),
    db
      .select({
        id: memories.id,
        subject: memories.subject,
        attribute: memories.attribute,
        value: memories.value,
        distance: sql<number>`embedding <=> ${embeddingParam}::vector`,
      })
      .from(memories)
      .orderBy(sql`embedding <=> ${embeddingParam}::vector`)
      .limit(topK),
  ]);

  const merged: RetrievedChunk[] = [
    ...docRows,
    ...memoryRows.map((m) => ({
      id: m.id,
      content: `${m.subject} ${m.attribute}: ${m.value}`,
      source: "memory",
      distance: m.distance,
    })),
  ];

  return merged.sort((a, b) => a.distance - b.distance).slice(0, topK);
}
