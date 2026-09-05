import { db } from "@/db";
import { documents } from "@/db/schema";
import { chunkText } from "./chunk";
import { embed, embedBatch } from "./embeddings";

export async function ingestDocument(content: string, source?: string) {
  const chunks = chunkText(content);
  if (chunks.length === 0) return { chunksInserted: 0 };

  const vectors = await embedBatch(chunks);

  await db.insert(documents).values(
    chunks.map((chunk, i) => ({
      content: chunk,
      embedding: vectors[i],
      source,
    })),
  );

  return { chunksInserted: chunks.length };
}

export async function saveMemory(content: string, source = "chat-memory") {
  const vector = await embed(content);
  await db.insert(documents).values({ content, embedding: vector, source });
}
