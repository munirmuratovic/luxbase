"use client";

import { useEffect, useRef, useState } from "react";

type Source = {
  id: string;
  content: string;
  source: string | null;
  distance: number;
};

type Message = {
  role: "user" | "assistant";
  text: string;
  sources?: Source[];
  remembered?: string[] | null;
};

type MemoryFact = { subject: string; attribute: string; value: string };

type ExtractedRecord = {
  type: string;
  startDate: string | null;
  endDate: string | null;
  data: Record<string, unknown>;
};

type StepEvent = {
  stage: "retrieve" | "judge" | "save" | "generate" | "extract_records" | "delete";
  status: "start" | "done";
  ms?: number;
  sources?: Source[];
  judgement?: { shouldSave: boolean; facts: MemoryFact[] };
  facts?: MemoryFact[];
  records?: ExtractedRecord[];
  target?: { subject: string; attribute: string } | null;
};

type DocRow = {
  id: string;
  content: string;
  source: string | null;
  createdAt: string;
};

type MemoryRow = {
  id: string;
  subject: string;
  attribute: string;
  value: string;
  updatedAt: string;
};

type RecordRow = {
  id: string;
  type: string;
  startDate: string | null;
  endDate: string | null;
  data: Record<string, unknown>;
};

const STAGE_LABEL: Record<StepEvent["stage"], string> = {
  retrieve: "Retrieving context",
  judge: "Judging memory-worthiness",
  extract_records: "Extracting structured records",
  save: "Saving to memory",
  generate: "Generating answer",
  delete: "Resolving delete request",
};

export default function RagPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [asking, setAsking] = useState(false);
  const [steps, setSteps] = useState<StepEvent[]>([]);
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [memoryRows, setMemoryRows] = useState<MemoryRow[]>([]);
  const [recordRows, setRecordRows] = useState<RecordRow[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function loadDocs() {
    setDocsLoading(true);
    try {
      const res = await fetch("/api/rag/documents");
      const data = await res.json();
      setDocs(data.documents ?? []);
      setMemoryRows(data.memories ?? []);
      setRecordRows(data.records ?? []);
    } finally {
      setDocsLoading(false);
    }
  }

  useEffect(() => {
    loadDocs();
    pollRef.current = setInterval(loadDocs, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function deleteRow(table: "documents" | "memories" | "records", id: string) {
    await fetch("/api/rag/manage", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table, id }),
    });
    loadDocs();
  }

  async function clearTable(table: "documents" | "memories" | "records") {
    if (!confirm(`Delete all rows in ${table}?`)) return;
    await fetch("/api/rag/manage", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table }),
    });
    loadDocs();
  }

  async function handleSend() {
    if (!input.trim()) return;
    const text = input;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text }]);
    setAsking(true);
    setSteps([]);

    try {
      const res = await fetch("/api/rag/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      if (!res.body) throw new Error("No response stream");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const raw of events) {
          const eventMatch = raw.match(/^event: (.+)$/m);
          const dataMatch = raw.match(/^data: (.+)$/m);
          if (!eventMatch || !dataMatch) continue;
          const event = eventMatch[1];
          const data = JSON.parse(dataMatch[1]);

          if (event === "step") {
            setSteps((prev) => [...prev, data as StepEvent]);
            if (data.stage === "save" && data.status === "done") {
              loadDocs();
            }
          } else if (event === "final") {
            setMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                text: data.answer,
                sources: data.sources,
                remembered: data.remembered,
              },
            ]);
          } else if (event === "error") {
            setMessages((prev) => [
              ...prev,
              { role: "assistant", text: `Error: ${data.message}` },
            ]);
          }
        }
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: err instanceof Error ? err.message : "Chat failed",
        },
      ]);
    } finally {
      setAsking(false);
    }
  }

  return (
    <div className="flex min-h-full flex-1 justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="grid w-full max-w-6xl grid-cols-1 gap-6 px-6 py-12 lg:grid-cols-[2fr_1fr]">
        <section className="flex flex-col gap-6">
          <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
            Chat
          </h1>

          <div className="flex flex-1 flex-col gap-5">
            {messages.map((m, i) => (
              <div key={i} className="flex flex-col gap-1">
                <span className="text-xs font-medium uppercase text-zinc-500">
                  {m.role}
                </span>
                <p className="whitespace-pre-wrap text-sm text-black dark:text-zinc-50">
                  {m.text}
                </p>
                {m.remembered && m.remembered.length > 0 && (
                  <p className="text-xs italic text-zinc-500">
                    remembered: {m.remembered.join("; ")}
                  </p>
                )}
                {m.sources && m.sources.length > 0 && (
                  <details className="text-xs text-zinc-500">
                    <summary>{m.sources.length} source(s)</summary>
                    <ul className="mt-1 flex flex-col gap-1">
                      {m.sources.map((s) => (
                        <li key={s.id}>
                          {s.source ?? "untitled"} (distance{" "}
                          {s.distance.toFixed(3)}): {s.content.slice(0, 120)}
                          ...
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              className="flex-1 rounded border border-black/[.08] bg-transparent px-3 py-2 text-sm dark:border-white/[.145]"
              placeholder="Say something..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSend();
              }}
            />
            <button
              className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
              disabled={asking || !input.trim()}
              onClick={handleSend}
            >
              {asking ? "..." : "Send"}
            </button>
          </div>
        </section>

        <aside className="flex flex-col gap-6">
          <div className="flex flex-col gap-2 rounded-lg border border-black/[.08] p-4 dark:border-white/[.145]">
            <h2 className="text-sm font-medium text-black dark:text-zinc-50">
              Live pipeline
            </h2>
            {steps.length === 0 && (
              <p className="text-xs text-zinc-500">
                Send a message to see the pipeline run.
              </p>
            )}
            <ul className="flex flex-col gap-2">
              {steps.map((s, i) => (
                <li key={i} className="text-xs">
                  <span
                    className={
                      s.status === "start"
                        ? "text-zinc-500"
                        : "font-medium text-black dark:text-zinc-50"
                    }
                  >
                    {s.status === "start" ? "…" : "✓"} {STAGE_LABEL[s.stage]}
                    {s.ms !== undefined ? ` (${s.ms}ms)` : ""}
                  </span>
                  {s.stage === "retrieve" && s.sources && (
                    <ul className="ml-4 mt-1 flex flex-col gap-0.5 text-zinc-500">
                      {s.sources.map((src) => (
                        <li key={src.id}>
                          {src.distance.toFixed(3)} — {src.content.slice(0, 60)}
                          ...
                        </li>
                      ))}
                    </ul>
                  )}
                  {s.stage === "judge" && s.judgement && (
                    <div className="ml-4 mt-1 text-zinc-500">
                      <p>shouldSave: {String(s.judgement.shouldSave)}</p>
                      {s.judgement.facts.length > 0 && (
                        <ul className="mt-0.5 flex flex-col gap-0.5">
                          {s.judgement.facts.map((f, fi) => (
                            <li key={fi}>
                              {f.subject}.{f.attribute} = &ldquo;{f.value}
                              &rdquo;
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                  {s.stage === "extract_records" && s.records && (
                    <ul className="ml-4 mt-1 flex flex-col gap-0.5 text-zinc-500">
                      {s.records.map((r, ri) => (
                        <li key={ri}>
                          {r.type} ({r.startDate ?? "?"} – {r.endDate ?? "present"}
                          ): {JSON.stringify(r.data)}
                        </li>
                      ))}
                    </ul>
                  )}
                  {s.stage === "save" && s.records && (
                    <p className="ml-4 mt-1 text-zinc-500">
                      Saved {s.records.length} record(s)
                    </p>
                  )}
                  {s.stage === "delete" && (
                    <p className="ml-4 mt-1 text-zinc-500">
                      {s.target
                        ? `Target: ${s.target.subject}.${s.target.attribute}`
                        : "No matching memory found"}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-2 rounded-lg border border-black/[.08] p-4 dark:border-white/[.145]">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-black dark:text-zinc-50">
                Memories ({memoryRows.length})
              </h2>
              <div className="flex gap-2">
                <button
                  className="text-xs text-zinc-500 underline"
                  onClick={loadDocs}
                  disabled={docsLoading}
                >
                  {docsLoading ? "..." : "refresh"}
                </button>
                <button
                  className="text-xs text-red-500 underline"
                  onClick={() => clearTable("memories")}
                  disabled={memoryRows.length === 0}
                >
                  clear all
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-zinc-500">
                    <th className="pr-2 pb-1 font-medium">Subject</th>
                    <th className="pr-2 pb-1 font-medium">Attribute</th>
                    <th className="pr-2 pb-1 font-medium">Value</th>
                    <th className="pb-1 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {memoryRows.map((m) => (
                    <tr
                      key={m.id}
                      className="border-t border-black/[.06] dark:border-white/[.1]"
                    >
                      <td className="py-1 pr-2 text-zinc-500">{m.subject}</td>
                      <td className="py-1 pr-2 text-zinc-500">
                        {m.attribute}
                      </td>
                      <td className="py-1 pr-2 text-black dark:text-zinc-50">
                        {m.value}
                      </td>
                      <td className="py-1">
                        <button
                          className="text-zinc-400 hover:text-red-500"
                          onClick={() => deleteRow("memories", m.id)}
                          aria-label="Delete"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-col gap-2 rounded-lg border border-black/[.08] p-4 dark:border-white/[.145]">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-black dark:text-zinc-50">
                Records ({recordRows.length})
              </h2>
              <div className="flex gap-2">
                <button
                  className="text-xs text-zinc-500 underline"
                  onClick={loadDocs}
                  disabled={docsLoading}
                >
                  {docsLoading ? "..." : "refresh"}
                </button>
                <button
                  className="text-xs text-red-500 underline"
                  onClick={() => clearTable("records")}
                  disabled={recordRows.length === 0}
                >
                  clear all
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-zinc-500">
                    <th className="pr-2 pb-1 font-medium">Type</th>
                    <th className="pr-2 pb-1 font-medium">Start</th>
                    <th className="pr-2 pb-1 font-medium">End</th>
                    <th className="pr-2 pb-1 font-medium">Data</th>
                    <th className="pb-1 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {recordRows.map((r) => (
                    <tr
                      key={r.id}
                      className="border-t border-black/[.06] dark:border-white/[.1]"
                    >
                      <td className="py-1 pr-2 text-zinc-500">{r.type}</td>
                      <td className="py-1 pr-2 text-zinc-500">
                        {r.startDate ?? "?"}
                      </td>
                      <td className="py-1 pr-2 text-zinc-500">
                        {r.endDate ?? "present"}
                      </td>
                      <td className="py-1 pr-2 text-black dark:text-zinc-50">
                        {JSON.stringify(r.data)}
                      </td>
                      <td className="py-1">
                        <button
                          className="text-zinc-400 hover:text-red-500"
                          onClick={() => deleteRow("records", r.id)}
                          aria-label="Delete"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-col gap-2 rounded-lg border border-black/[.08] p-4 dark:border-white/[.145]">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-black dark:text-zinc-50">
                Stored documents ({docs.length})
              </h2>
              <div className="flex gap-2">
                <button
                  className="text-xs text-zinc-500 underline"
                  onClick={loadDocs}
                  disabled={docsLoading}
                >
                  {docsLoading ? "..." : "refresh"}
                </button>
                <button
                  className="text-xs text-red-500 underline"
                  onClick={() => clearTable("documents")}
                  disabled={docs.length === 0}
                >
                  clear all
                </button>
              </div>
            </div>
            <ul className="flex max-h-96 flex-col gap-2 overflow-y-auto text-xs">
              {docs.map((d) => (
                <li
                  key={d.id}
                  className="rounded border border-black/[.06] p-2 dark:border-white/[.1]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-zinc-500">
                      {d.source ?? "untitled"} —{" "}
                      {new Date(d.createdAt).toLocaleTimeString()}
                    </p>
                    <button
                      className="shrink-0 text-zinc-400 hover:text-red-500"
                      onClick={() => deleteRow("documents", d.id)}
                      aria-label="Delete"
                    >
                      ✕
                    </button>
                  </div>
                  <p className="text-black dark:text-zinc-50">
                    {d.content.slice(0, 140)}...
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </main>
    </div>
  );
}
