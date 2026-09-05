import { eq } from "drizzle-orm";
import { db } from "@/db";
import { documents, memories, records } from "@/db/schema";

const TABLES = { documents, memories, records } as const;
type TableName = keyof typeof TABLES;

function isTableName(value: unknown): value is TableName {
  return typeof value === "string" && value in TABLES;
}

export async function DELETE(request: Request) {
  const body = await request.json();
  const { table, id } = body as { table?: string; id?: string };

  if (!isTableName(table)) {
    return Response.json({ error: "invalid table" }, { status: 400 });
  }

  const target = TABLES[table];

  if (id) {
    await db.delete(target).where(eq(target.id, id));
    return Response.json({ deleted: 1 });
  }

  const result = await db.delete(target);
  return Response.json({ deleted: result.rowCount ?? 0 });
}
