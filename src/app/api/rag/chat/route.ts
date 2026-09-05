import {
  extractDateFromQuery,
  looksLikeStructuredPaste,
  mightReferenceDate,
} from "@/rag/date-query";
import {
  looksLikeDeleteIntent,
  resolveDeleteTarget,
} from "@/rag/delete-intent";
import { generateAnswer } from "@/rag/generate";
import type { HistoryTurn } from "@/rag/history";
import {
  deleteMemoryFact,
  deleteRecord,
  listAllMemories,
  listAllRecords,
  saveMemoryFact,
  saveRecord,
} from "@/rag/ingest";
import { judgeForMemory } from "@/rag/memory";
import { extractRecords } from "@/rag/records";
import { queryRecordsByDate, retrieve } from "@/rag/retrieve";

function sseEvent(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: Request) {
  const body = await request.json();
  const { message, history } = body as {
    message?: string;
    history?: HistoryTurn[];
  };

  if (!message || typeof message !== "string") {
    return Response.json({ error: "message is required" }, { status: 400 });
  }

  const recentHistory = Array.isArray(history) ? history : [];

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (event: string, data: unknown) =>
        controller.enqueue(new TextEncoder().encode(sseEvent(event, data)));

      try {
        if (looksLikeDeleteIntent(message)) {
          enqueue("step", { stage: "delete", status: "start" });
          const deleteStart = Date.now();
          const [existingMemories, existingRecords] = await Promise.all([
            listAllMemories(),
            listAllRecords(),
          ]);
          const target = await resolveDeleteTarget(
            message,
            existingMemories,
            existingRecords.map((r) => ({
              id: r.id,
              type: r.type,
              data: r.data as Record<string, unknown>,
            })),
          );

          let answer = "I couldn't find a matching item to delete.";
          if (target?.kind === "memory") {
            await deleteMemoryFact(target.subject, target.attribute);
            answer = `Forgot ${target.subject}.${target.attribute}.`;
          } else if (target?.kind === "record") {
            await deleteRecord(target.id);
            answer = `Deleted record: ${target.description}.`;
          }

          enqueue("step", {
            stage: "delete",
            status: "done",
            ms: Date.now() - deleteStart,
            target,
          });

          enqueue("final", { answer, sources: [], remembered: null });
          return;
        }

        enqueue("step", { stage: "retrieve", status: "start" });
        const retrieveStart = Date.now();
        let chunks = await retrieve(message);

        if (mightReferenceDate(message)) {
          const isoDate = await extractDateFromQuery(message);
          if (isoDate) {
            const dateMatches = await queryRecordsByDate(isoDate);
            chunks = [...dateMatches, ...chunks];
          }
        }

        enqueue("step", {
          stage: "retrieve",
          status: "done",
          ms: Date.now() - retrieveStart,
          sources: chunks,
        });

        let remembered: string[] = [];

        if (looksLikeStructuredPaste(message, recentHistory)) {
          enqueue("step", { stage: "extract_records", status: "start" });
          const extractStart = Date.now();
          const combinedText = [
            ...recentHistory.map((t) => t.text),
            message,
          ].join("\n\n");
          const extracted = await extractRecords(combinedText);
          enqueue("step", {
            stage: "extract_records",
            status: "done",
            ms: Date.now() - extractStart,
            records: extracted,
          });

          if (extracted.length > 0) {
            enqueue("step", { stage: "save", status: "start" });
            const saveStart = Date.now();
            for (const record of extracted) {
              await saveRecord(record);
            }
            remembered = extracted.map(
              (r) => `${r.type}: ${JSON.stringify(r.data)}`,
            );
            enqueue("step", {
              stage: "save",
              status: "done",
              ms: Date.now() - saveStart,
              records: extracted,
            });
          }
        } else {
          enqueue("step", { stage: "judge", status: "start" });
          const judgeStart = Date.now();
          const existingMemories = await listAllMemories();
          const judgement = await judgeForMemory(
            message,
            recentHistory,
            existingMemories,
          );
          enqueue("step", {
            stage: "judge",
            status: "done",
            ms: Date.now() - judgeStart,
            judgement,
          });

          if (judgement.shouldSave && judgement.facts.length > 0) {
            enqueue("step", { stage: "save", status: "start" });
            const saveStart = Date.now();
            for (const fact of judgement.facts) {
              await saveMemoryFact(fact);
            }
            remembered = judgement.facts.map(
              (f) => `${f.subject} ${f.attribute}: ${f.value}`,
            );
            enqueue("step", {
              stage: "save",
              status: "done",
              ms: Date.now() - saveStart,
              facts: judgement.facts,
            });
          }
        }

        enqueue("step", { stage: "generate", status: "start" });
        const generateStart = Date.now();
        const answer = await generateAnswer(
          message,
          chunks.map((c) => c.content),
          recentHistory,
        );
        enqueue("step", {
          stage: "generate",
          status: "done",
          ms: Date.now() - generateStart,
        });

        enqueue("final", {
          answer,
          sources: chunks,
          remembered: remembered.length > 0 ? remembered : null,
        });
      } catch (err) {
        enqueue("error", {
          message: err instanceof Error ? err.message : "Unknown error",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
