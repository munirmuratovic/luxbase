"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";

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
  retrieve: "Retrieve",
  judge: "Judge",
  extract_records: "Extract records",
  save: "Save",
  generate: "Generate",
  delete: "Delete",
};

type TableKind = "memories" | "records" | "documents";

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function RagPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [asking, setAsking] = useState(false);
  const [steps, setSteps] = useState<StepEvent[]>([]);
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [memoryRows, setMemoryRows] = useState<MemoryRow[]>([]);
  const [recordRows, setRecordRows] = useState<RecordRow[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TableKind>("memories");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const logEndRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages, asking, steps]);

  async function deleteRow(table: TableKind, id: string) {
    await fetch("/api/rag/manage", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table, id }),
    });
    loadDocs();
  }

  async function clearTable(table: TableKind) {
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

  const tabCount: Record<TableKind, number> = {
    memories: memoryRows.length,
    records: recordRows.length,
    documents: docs.length,
  };

  const lastStep = steps[steps.length - 1];
  const currentStageLabel = lastStep
    ? lastStep.status === "start"
      ? `${STAGE_LABEL[lastStep.stage]}…`
      : `${STAGE_LABEL[lastStep.stage]} done`
    : "Starting…";

  return (
    <div className="min-h-full flex-1 bg-background font-sans text-foreground">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8 lg:h-screen lg:py-10">
        <header className="flex items-end justify-between gap-4 border-b-2 border-foreground pb-4">
          <div className="flex items-end gap-4">
            <h1
              className="text-4xl font-bold leading-none tracking-tight"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Luxbase<span className="text-accent">.</span>
            </h1>
            <span className="mb-1 font-mono text-xs uppercase tracking-[0.2em] text-muted">
              local memory / pgvector + ollama
            </span>
          </div>
          <div className="mb-1 flex items-center gap-2 rounded-full border border-accent/40 bg-accent-soft px-3 py-1 text-xs font-medium text-accent">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
            </span>
            on-device · no cloud calls
          </div>
        </header>

        <main className="grid flex-1 grid-cols-1 gap-5 overflow-hidden lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          {/* Conversation */}
          <section className="flex min-h-0 flex-col rounded-xl border border-border bg-surface">
            <div className="flex-1 overflow-y-auto px-5 py-5">
              {messages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
                  <p className="text-sm text-muted">
                    Nothing said yet. Try telling it something, or asking a
                    question.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-5">
                  {messages.map((m, i) => (
                    <div
                      key={i}
                      className={
                        m.role === "user"
                          ? "ml-auto max-w-[85%]"
                          : "mr-auto max-w-[85%]"
                      }
                    >
                      <div
                        className={
                          m.role === "user"
                            ? "rounded-2xl rounded-br-sm bg-accent px-4 py-2.5 text-sm text-on-accent"
                            : "rounded-2xl rounded-bl-sm bg-surface-sunken px-4 py-2.5 text-sm text-foreground"
                        }
                      >
                        <p className="whitespace-pre-wrap leading-relaxed">
                          {m.text}
                        </p>
                      </div>

                      {m.remembered && m.remembered.length > 0 && (
                        <p className="mt-1.5 flex items-start gap-1.5 rounded-lg bg-accent-soft px-2.5 py-1.5 text-xs font-medium text-accent">
                          <span aria-hidden>◆</span>
                          <span className="font-mono font-normal">
                            {m.remembered.join(" · ")}
                          </span>
                        </p>
                      )}

                      {m.sources && m.sources.length > 0 && (
                        <details className="mt-1.5 px-1 text-xs text-muted">
                          <summary className="cursor-pointer select-none hover:text-foreground">
                            {m.sources.length} source
                            {m.sources.length === 1 ? "" : "s"}
                          </summary>
                          <ul className="mt-1.5 flex flex-col gap-1 border-l border-border pl-3 font-mono">
                            {m.sources.map((s) => (
                              <li key={s.id} className="tabular-nums">
                                <span className="text-accent">
                                  {s.distance.toFixed(3)}
                                </span>{" "}
                                <span className="text-muted">
                                  [{s.source ?? "untitled"}]
                                </span>{" "}
                                {s.content.slice(0, 90)}
                                {s.content.length > 90 ? "…" : ""}
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </div>
                  ))}
                  {asking && (
                    <div className="mr-auto max-w-[85%]">
                      <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm bg-surface-sunken px-4 py-2.5 text-sm text-muted">
                        <span className="flex gap-1">
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:-0.3s]" />
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:-0.15s]" />
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent" />
                        </span>
                        <span className="font-mono text-xs">
                          {currentStageLabel}
                        </span>
                      </div>
                    </div>
                  )}
                  <div ref={logEndRef} />
                </div>
              )}
            </div>

            <div className="flex gap-2 border-t border-border p-3">
              <input
                className="flex-1 rounded-lg border border-border bg-surface-sunken px-3.5 py-2.5 text-sm outline-none placeholder:text-muted focus:border-accent"
                placeholder="Say something…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSend();
                }}
              />
              <Button
                className="h-auto py-2.5"
                disabled={asking || !input.trim()}
                onClick={handleSend}
              >
                {asking ? "…" : "Send →"}
              </Button>
            </div>
          </section>

          {/* System state */}
          <aside className="flex min-h-0 flex-col gap-5 overflow-y-auto">
            <div className="rounded-xl border-2 border-border bg-surface p-4">
              <h2 className="mb-3 font-mono text-xs font-bold uppercase tracking-[0.15em] text-foreground">
                Pipeline<span className="text-accent">_</span>
              </h2>
              {steps.length === 0 ? (
                <p className="text-xs text-muted">
                  {asking ? "Starting…" : "Waiting for a message."}
                </p>
              ) : (
                <ol className="relative flex flex-col gap-3 border-l border-border pl-4">
                  {steps
                    .filter((s) => s.status === "done")
                    .map((s, i) => (
                      <li key={i} className="relative">
                        <span
                          className={
                            "absolute -left-[1.1rem] top-1 h-2 w-2 rounded-full " +
                            (s.stage === "delete"
                              ? "bg-danger"
                              : "bg-accent")
                          }
                        />
                        <div className="flex items-baseline justify-between gap-2 text-xs">
                          <span className="font-medium">
                            {STAGE_LABEL[s.stage]}
                          </span>
                          {s.ms !== undefined && (
                            <span className="font-mono tabular-nums text-muted">
                              {s.ms}ms
                            </span>
                          )}
                        </div>

                        {s.stage === "retrieve" && s.sources && (
                          <ul className="mt-1 flex flex-col gap-0.5 font-mono text-[11px] text-muted">
                            {s.sources.slice(0, 4).map((src) => (
                              <li key={src.id} className="tabular-nums">
                                {src.distance.toFixed(3)} {src.content.slice(0, 42)}
                                {src.content.length > 42 ? "…" : ""}
                              </li>
                            ))}
                          </ul>
                        )}

                        {s.stage === "judge" && s.judgement && (
                          <div className="mt-1 text-[11px] text-muted">
                            {s.judgement.facts.length > 0 ? (
                              <ul className="flex flex-col gap-0.5 font-mono">
                                {s.judgement.facts.map((f, fi) => (
                                  <li key={fi}>
                                    {f.subject}.{f.attribute} = &ldquo;
                                    {f.value}&rdquo;
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <span>nothing worth saving</span>
                            )}
                          </div>
                        )}

                        {s.stage === "extract_records" && s.records && (
                          <p className="mt-1 text-[11px] text-muted">
                            {s.records.length} record
                            {s.records.length === 1 ? "" : "s"} found
                          </p>
                        )}

                        {s.stage === "delete" && (
                          <p className="mt-1 text-[11px] text-muted">
                            {s.target
                              ? `${s.target.subject}.${s.target.attribute}`
                              : "no match found"}
                          </p>
                        )}
                      </li>
                    ))}
                  {lastStep?.status === "start" && (
                    <li className="relative">
                      <span className="absolute -left-[1.1rem] top-1 h-2 w-2 animate-pulse rounded-full bg-accent" />
                      <span className="text-xs font-medium text-accent">
                        {STAGE_LABEL[lastStep.stage]}…
                      </span>
                    </li>
                  )}
                </ol>
              )}
            </div>

            <Tabs
              value={activeTab}
              onValueChange={(v) => setActiveTab(v as TableKind)}
              className="flex min-h-0 flex-1 flex-col rounded-xl border border-border bg-surface p-4"
            >
              <div className="mb-3 flex items-center gap-1.5">
                <TabsList>
                  {(["memories", "records", "documents"] as TableKind[]).map(
                    (tab) => (
                      <TabsTab key={tab} value={tab}>
                        {tab}
                        <span className="ml-1 font-mono text-[10px] tabular-nums opacity-70">
                          {tabCount[tab]}
                        </span>
                      </TabsTab>
                    ),
                  )}
                </TabsList>
                {docsLoading && (
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => clearTable(activeTab)}
                  disabled={tabCount[activeTab] === 0}
                  className="ml-auto h-auto p-0 font-normal hover:bg-transparent hover:text-danger"
                >
                  clear
                </Button>
              </div>

              <TabsPanel value="memories" className="overflow-y-auto">
                <ul className="flex flex-col gap-0.5">
                  {memoryRows.length === 0 && (
                    <li className="py-1 text-xs text-muted">No memories yet.</li>
                  )}
                  {memoryRows.map((m) => (
                    <li
                      key={m.id}
                      className="group flex items-start justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-sunken"
                    >
                      <p className="text-xs leading-snug">
                        <span className="font-mono text-muted">
                          {m.subject}.{m.attribute}
                        </span>{" "}
                        <span>{m.value}</span>
                      </p>
                      <button
                        onClick={() => deleteRow("memories", m.id)}
                        aria-label="Delete memory"
                        className="shrink-0 text-muted opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              </TabsPanel>

              <TabsPanel value="records" className="overflow-y-auto">
                <ul className="flex flex-col gap-1.5">
                  {recordRows.length === 0 && (
                    <li className="py-1 text-xs text-muted">No records yet.</li>
                  )}
                  {recordRows.map((r) => (
                    <li
                      key={r.id}
                      className="group rounded-lg px-2 py-1.5 hover:bg-surface-sunken"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium">
                            {String(
                              (r.data as { title?: string }).title ?? r.type,
                            )}
                            {(r.data as { company?: string }).company && (
                              <span className="font-normal text-muted">
                                {" "}
                                · {(r.data as { company?: string }).company}
                              </span>
                            )}
                          </p>
                          <p className="mt-0.5 font-mono text-[11px] tabular-nums text-muted">
                            {r.startDate ?? "?"} – {r.endDate ?? "present"}
                          </p>
                        </div>
                        <button
                          onClick={() => deleteRow("records", r.id)}
                          aria-label="Delete record"
                          className="shrink-0 text-muted opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                        >
                          ✕
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </TabsPanel>

              <TabsPanel value="documents" className="overflow-y-auto">
                <ul className="flex flex-col gap-1.5">
                  {docs.length === 0 && (
                    <li className="py-1 text-xs text-muted">No documents yet.</li>
                  )}
                  {docs.map((d) => (
                    <li
                      key={d.id}
                      className="group rounded-lg px-2 py-1.5 hover:bg-surface-sunken"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 flex-1 truncate text-xs text-foreground">
                          {d.content.slice(0, 90)}
                        </p>
                        <button
                          onClick={() => deleteRow("documents", d.id)}
                          aria-label="Delete document"
                          className="shrink-0 text-muted opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                        >
                          ✕
                        </button>
                      </div>
                      <p className="font-mono text-[11px] text-muted">
                        {d.source ?? "untitled"} · {fmtTime(d.createdAt)}
                      </p>
                    </li>
                  ))}
                </ul>
              </TabsPanel>
            </Tabs>
          </aside>
        </main>
      </div>
    </div>
  );
}
