import { and, lte, or, isNull, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { documents, memories, records } from "@/db/schema";
import { embed } from "./embeddings";

export type RetrievedChunk = {
  id: string;
  content: string;
  source: string | null;
  distance: number;
};

const MAX_RELEVANT_DISTANCE = 0.55;

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

  return merged
    .filter((c) => c.distance <= MAX_RELEVANT_DISTANCE)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, topK);
}

function describeRecord(
  type: string,
  data: Record<string, unknown>,
  isoDate: string,
): string {
  if (type === "work_experience") {
    const company = data.company ?? "an unknown company";
    const title = data.title ?? "an unspecified role";
    return `On ${isoDate}, worked as ${title} at ${company}.`;
  }
  return `On ${isoDate}: ${type}: ${JSON.stringify(data)}`;
}

export async function queryRecordsByDate(
  isoDate: string,
): Promise<RetrievedChunk[]> {
  const rows = await db
    .select({
      id: records.id,
      type: records.type,
      data: records.data,
    })
    .from(records)
    .where(
      and(
        lte(records.startDate, isoDate),
        or(isNull(records.endDate), gte(records.endDate, isoDate)),
      ),
    );

  return rows.map((r) => ({
    id: r.id,
    content: describeRecord(r.type, r.data as Record<string, unknown>, isoDate),
    source: "record",
    distance: 0,
  }));
}
