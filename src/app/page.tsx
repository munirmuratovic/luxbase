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
  target?:
    | { kind: "memory"; subject: string; attribute: string }
    | { kind: "record"; id: string; description: string }
    | null;
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
  retrieve: "Looking up context",
  judge: "Checking what to remember",
  extract_records: "Reading your experience",
  save: "Saving",
  generate: "Writing a reply",
  delete: "Removing",
};

type TableKind = "memories" | "records" | "documents";

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [asking, setAsking] = useState(false);
  const [steps, setSteps] = useState<StepEvent[]>([]);
  const [showTrace, setShowTrace] = useState(false);
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [memoryRows, setMemoryRows] = useState<MemoryRow[]>([]);
  const [recordRows, setRecordRows] = useState<RecordRow[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TableKind>("memories");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const logEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

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
    logEndRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
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
    const history = messages.slice(-6).map((m) => ({
      role: m.role,
      text: m.text,
    }));
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text }]);
    setAsking(true);
    setSteps([]);
    setShowTrace(false);

    try {
      const res = await fetch("/api/rag/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history }),
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
      inputRef.current?.focus();
    }
  }

  const tabCount: Record<TableKind, number> = {
    memories: memoryRows.length,
    records: recordRows.length,
    documents: docs.length,
  };

  const lastStep = steps[steps.length - 1];
  const currentStageLabel = lastStep ? STAGE_LABEL[lastStep.stage] : "Thinking";
  const completedSteps = steps.filter((s) => s.status === "done");

  return (
    <div className="min-h-full flex-1 bg-background font-sans text-foreground">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6 lg:h-screen lg:py-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent">
              <span
                className="text-lg font-bold leading-none text-on-accent"
                style={{ fontFamily: "var(--font-display)" }}
              >
                L
              </span>
            </div>
            <div>
              <h1
                className="text-xl font-bold leading-none tracking-tight"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Luxbase
              </h1>
              <p className="mt-0.5 text-xs text-muted">
                Remembers what matters, runs entirely on this machine
              </p>
            </div>
          </div>
        </header>

        <main className="grid flex-1 grid-cols-1 gap-5 overflow-hidden lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
          {/* Conversation */}
          <section className="flex min-h-0 flex-col rounded-2xl bg-surface shadow-sm ring-1 ring-border">
            <div className="flex-1 overflow-y-auto px-6 py-6">
              {messages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-2xl">
                    💬
                  </div>
                  <p className="max-w-xs text-sm text-muted">
                    Say something. Facts worth remembering are saved
                    automatically — nothing to configure.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-6">
                  {messages.map((m, i) => (
                    <div
                      key={i}
                      className={
                        m.role === "user"
                          ? "ml-auto max-w-[85%] animate-[fadeIn_0.2s_ease-out]"
                          : "mr-auto max-w-[85%] animate-[fadeIn_0.2s_ease-out]"
                      }
                    >
                      <div
                        className={
                          m.role === "user"
                            ? "rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-sm text-on-accent shadow-sm"
                            : "rounded-2xl rounded-bl-md bg-surface-sunken px-4 py-2.5 text-sm text-foreground"
                        }
                      >
                        <p className="whitespace-pre-wrap leading-relaxed">
                          {m.text}
                        </p>
                      </div>

                      {m.remembered && m.remembered.length > 0 && (
                        <p className="mt-2 flex items-start gap-1.5 px-1 text-xs text-muted">
                          <span aria-hidden className="text-accent">
                            ◆
                          </span>
                          <span>{m.remembered.join(" · ")}</span>
                        </p>
                      )}

                      {m.sources && m.sources.length > 0 && (
                        <details className="mt-2 px-1 text-xs text-muted">
                          <summary className="cursor-pointer select-none transition-colors hover:text-foreground">
                            {m.sources.length} source
                            {m.sources.length === 1 ? "" : "s"}
                          </summary>
                          <ul className="mt-1.5 flex flex-col gap-1 border-l-2 border-border pl-3">
                            {m.sources.map((s) => (
                              <li key={s.id}>
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
                    <div className="mr-auto flex max-w-[85%] flex-col gap-1.5 animate-[fadeIn_0.2s_ease-out]">
                      <div className="flex items-center gap-2.5 rounded-2xl rounded-bl-md bg-surface-sunken px-4 py-2.5 text-sm text-muted">
                        <span className="flex gap-1">
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted [animation-delay:-0.3s]" />
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted [animation-delay:-0.15s]" />
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted" />
                        </span>
                        <span className="text-xs">{currentStageLabel}…</span>
                      </div>
                      {completedSteps.length > 0 && (
                        <button
                          onClick={() => setShowTrace((v) => !v)}
                          className="px-1 text-left text-[11px] text-muted underline decoration-dotted underline-offset-2 hover:text-foreground"
                        >
                          {showTrace ? "Hide details" : "Show details"}
                        </button>
                      )}
                      {showTrace && (
                        <ul className="flex flex-col gap-1 px-1 text-[11px] text-muted">
                          {completedSteps.map((s, i) => (
                            <li key={i} className="flex items-baseline gap-1.5">
                              <span className="text-accent">✓</span>
                              <span>{STAGE_LABEL[s.stage]}</span>
                              {s.ms !== undefined && (
                                <span className="tabular-nums opacity-70">
                                  {s.ms}ms
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                  <div ref={logEndRef} />
                </div>
              )}
            </div>

            <div className="flex gap-2 border-t border-border p-4">
              <input
                ref={inputRef}
                className="flex-1 rounded-xl bg-surface-sunken px-4 py-3 text-sm outline-none ring-1 ring-transparent transition-shadow placeholder:text-muted focus:ring-2 focus:ring-accent"
                placeholder="Say something…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSend();
                }}
              />
              <Button
                className="h-auto rounded-xl px-6 py-3"
                disabled={asking || !input.trim()}
                onClick={handleSend}
              >
                {asking ? "…" : "Send"}
              </Button>
            </div>
          </section>

          {/* Stored data */}
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as TableKind)}
            className="flex min-h-0 flex-col rounded-2xl bg-surface p-5 shadow-sm ring-1 ring-border"
          >
            <div className="mb-4 flex items-center gap-1.5">
              <TabsList className="rounded-full bg-surface-sunken p-1">
                {(["memories", "records", "documents"] as TableKind[]).map(
                  (tab) => (
                    <TabsTab key={tab} value={tab}>
                      {tab}
                      <span className="ml-1 text-[10px] tabular-nums opacity-70">
                        {tabCount[tab]}
                      </span>
                    </TabsTab>
                  ),
                )}
              </TabsList>
              {docsLoading && (
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted" />
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => clearTable(activeTab)}
                disabled={tabCount[activeTab] === 0}
                className="ml-auto h-auto rounded-md px-2 py-1 font-normal hover:text-danger"
              >
                Clear
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
                    className="group flex items-start justify-between gap-2 rounded-lg px-2.5 py-2 transition-colors hover:bg-surface-sunken"
                  >
                    <p className="text-sm leading-snug">
                      <span className="capitalize">
                        {m.attribute.replace(/_/g, " ")}
                      </span>
                      <span className="text-muted">: </span>
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
                    className="group rounded-lg px-2.5 py-2 transition-colors hover:bg-surface-sunken"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {String((r.data as { title?: string }).title ?? r.type)}
                          {(r.data as { company?: string }).company && (
                            <span className="font-normal text-muted">
                              {" "}
                              at {(r.data as { company?: string }).company}
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 text-xs tabular-nums text-muted">
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
                    className="group rounded-lg px-2.5 py-2 transition-colors hover:bg-surface-sunken"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 flex-1 truncate text-sm text-foreground">
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
                    <p className="text-xs text-muted">
                      {d.source ?? "untitled"} · {fmtTime(d.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            </TabsPanel>
          </Tabs>
        </main>
      </div>
    </div>
  );
}
