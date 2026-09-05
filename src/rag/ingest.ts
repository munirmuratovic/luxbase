import { sql } from "drizzle-orm";
import { db } from "@/db";
import { documents, memories } from "@/db/schema";
import { chunkText } from "./chunk";
import { embed, embedBatch } from "./embeddings";
import type { MemoryFact } from "./memory";

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

export async function saveMemoryFact(fact: MemoryFact) {
  const text = `${fact.subject} ${fact.attribute}: ${fact.value}`;
  const vector = await embed(text);

  await db
    .insert(memories)
    .values({
      subject: fact.subject,
      attribute: fact.attribute,
      value: fact.value,
      embedding: vector,
    })
    .onConflictDoUpdate({
      target: [memories.subject, memories.attribute],
      set: {
        value: fact.value,
        embedding: vector,
        updatedAt: sql`now()`,
      },
    });
}
