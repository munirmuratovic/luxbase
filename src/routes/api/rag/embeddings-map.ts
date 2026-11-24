import { createFileRoute } from "@tanstack/react-router";
import { isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { documents, memories, records } from "@/db/schema";
import { pca2d } from "@/rag/pca";

type Kind = "document" | "memory" | "record";
type Row = { id: string; kind: Kind; label: string; embedding: number[] };

const LIMIT = 300;
const truncate = (s: string, n = 120) => (s.length > n ? `${s.slice(0, n)}…` : s);

async function GET() {
  const [docRows, memoryRows, recordRows] = await Promise.all([
    db
      .select({ id: documents.id, content: documents.content, embedding: documents.embedding })
      .from(documents)
      .where(isNotNull(documents.embedding))
      .limit(LIMIT),
    db
      .select({
        id: memories.id,
        subject: memories.subject,
        attribute: memories.attribute,
        value: memories.value,
        embedding: memories.embedding,
      })
      .from(memories)
      .where(isNotNull(memories.embedding))
      .limit(LIMIT),
    db
      .select({
        id: records.id,
        type: records.type,
        data: records.data,
        embedding: records.embedding,
      })
      .from(records)
      .where(isNotNull(records.embedding))
      .limit(LIMIT),
  ]);

  const rows: Row[] = [
    ...docRows.map((r) => ({
      id: r.id,
      kind: "document" as const,
      label: truncate(r.content),
      embedding: r.embedding as number[],
    })),
    ...memoryRows.map((r) => ({
      id: r.id,
      kind: "memory" as const,
      label: truncate(`${r.subject} · ${r.attribute}: ${r.value}`),
      embedding: r.embedding as number[],
    })),
    ...recordRows.map((r) => ({
      id: r.id,
      kind: "record" as const,
      label: truncate(`${r.type} ${JSON.stringify(r.data)}`),
      embedding: r.embedding as number[],
    })),
  ];

  if (rows.length === 0) return Response.json({ points: [] });

  const coords = pca2d(rows.map((r) => r.embedding));
  const points = rows.map((r, i) => ({
    id: r.id,
    kind: r.kind,
    label: r.label,
    x: coords[i].x,
    y: coords[i].y,
  }));

  return Response.json({ points });
}

export const Route = createFileRoute("/api/rag/embeddings-map")({
  server: { handlers: { GET } },
});
