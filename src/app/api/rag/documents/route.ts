import { desc } from "drizzle-orm";
import { db } from "@/db";
import { documents, memories, records } from "@/db/schema";

export async function GET() {
  const [docRows, memoryRows, recordRows] = await Promise.all([
    db
      .select({
        id: documents.id,
        content: documents.content,
        source: documents.source,
        createdAt: documents.createdAt,
      })
      .from(documents)
      .orderBy(desc(documents.createdAt))
      .limit(100),
    db
      .select({
        id: memories.id,
        subject: memories.subject,
        attribute: memories.attribute,
        value: memories.value,
        updatedAt: memories.updatedAt,
      })
      .from(memories)
      .orderBy(desc(memories.updatedAt))
      .limit(100),
    db
      .select({
        id: records.id,
        type: records.type,
        startDate: records.startDate,
        endDate: records.endDate,
        data: records.data,
      })
      .from(records)
      .orderBy(desc(records.startDate))
      .limit(100),
  ]);

  return Response.json({
    documents: docRows,
    memories: memoryRows,
    records: recordRows,
  });
}
