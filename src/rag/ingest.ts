import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { documents, memories, records } from "@/db/schema";
import { chunkText } from "./chunk";
import { embed, embedBatch } from "./embeddings";
import type { MemoryFact } from "./memory";
import type { ExtractedRecord } from "./records";

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

export async function saveRecord(record: ExtractedRecord) {
  const text = `${record.type}: ${JSON.stringify(record.data)}`;
  const vector = await embed(text);

  await db.insert(records).values({
    type: record.type,
    startDate: record.startDate,
    endDate: record.endDate,
    data: record.data,
    embedding: vector,
  });
}

export async function listAllMemories() {
  return db
    .select({
      subject: memories.subject,
      attribute: memories.attribute,
      value: memories.value,
    })
    .from(memories);
}

export async function deleteMemoryFact(subject: string, attribute: string) {
  await db
    .delete(memories)
    .where(
      and(eq(memories.subject, subject), eq(memories.attribute, attribute)),
    );
}
