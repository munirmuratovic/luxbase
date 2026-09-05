"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { cn } from "@/lib/cn";

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

type Conversation = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function groupConversations(items: Conversation[]) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const weekAgo = new Date(startOfToday);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const groups: { label: string; items: Conversation[] }[] = [
    { label: "Today", items: [] },
    { label: "Yesterday", items: [] },
    { label: "Previous 7 days", items: [] },
    { label: "Older", items: [] },
  ];

  for (const c of items) {
    const updated = new Date(c.updatedAt);
    if (updated >= startOfToday) groups[0].items.push(c);
    else if (updated >= startOfYesterday) groups[1].items.push(c);
    else if (updated >= weekAgo) groups[2].items.push(c);
    else groups[3].items.push(c);
  }

  return groups.filter((g) => g.items.length > 0);
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
  const [panelOpen, setPanelOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const logEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const conversationIdRef = useRef<string | null>(null);

  async function loadConversations() {
    const res = await fetch("/api/rag/conversations");
    const data = await res.json();
    setConversations(data.conversations ?? []);
  }

  async function loadConversation(id: string) {
    conversationIdRef.current = id;
    setConversationId(id);
    setMessages([]);
    setSteps([]);
    const res = await fetch(`/api/rag/conversations/${id}`);
    const data = await res.json();
    type StoredMessage = {
      role: "user" | "assistant";
      text: string;
      sources: Source[] | null;
      remembered: string[] | null;
    };
    setMessages(
      (data.messages ?? []).map((m: StoredMessage) => ({
        role: m.role,
        text: m.text,
        sources: m.sources ?? undefined,
        remembered: m.remembered ?? undefined,
      })),
    );
  }

  function startNewChat() {
    conversationIdRef.current = null;
    setConversationId(null);
    setMessages([]);
    setSteps([]);
    inputRef.current?.focus();
  }

  async function removeConversation(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    await fetch(`/api/rag/conversations/${id}`, { method: "DELETE" });
    if (conversationIdRef.current === id) startNewChat();
    loadConversations();
  }

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
    loadConversations();
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
        body: JSON.stringify({
          message: text,
          history,
          conversationId: conversationIdRef.current,
        }),
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

          if (event === "conversation") {
            conversationIdRef.current = data.conversationId;
            setConversationId(data.conversationId);
            loadConversations();
          } else if (event === "step") {
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
            loadConversations();
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
  const conversationGroups = groupConversations(conversations);

  return (
    <div className="flex h-screen bg-background font-sans text-foreground">
      {/* Chat history sidebar — width animates like ChatGPT's, content reflows alongside it */}
      <div
        className={cn(
          "hidden shrink-0 overflow-hidden bg-surface transition-[width] duration-300 ease-in-out md:block",
          sidebarOpen ? "w-64" : "w-14",
        )}
      >
        <div className="flex h-full w-64 flex-col border-r border-border/60 p-3">
          <div className="mb-3 flex items-center gap-2 py-1">
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-accent-2 text-on-accent shadow-[0_6px_14px_-6px_var(--ring)] transition-transform active:scale-90"
            >
              <span
                className="text-xs font-bold leading-none"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {sidebarOpen ? "«" : "L"}
              </span>
            </button>
            <h1
              className={cn(
                "whitespace-nowrap text-sm font-bold leading-none tracking-tight transition-opacity duration-200",
                sidebarOpen ? "opacity-100 delay-100" : "opacity-0",
              )}
              style={{ fontFamily: "var(--font-display)" }}
            >
              Luxbase
            </h1>
          </div>

          <button
            onClick={startNewChat}
            aria-label="New chat"
            className="mb-4 flex w-full items-center gap-2 whitespace-nowrap rounded-2xl border border-border/60 bg-surface px-2.5 py-2.5 text-left text-sm font-medium shadow-sm transition-all duration-200 hover:border-accent/40 hover:shadow-[0_8px_20px_-12px_var(--ring)] active:scale-[0.98]"
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm leading-none text-accent">
              +
            </span>
            <span
              className={cn(
                "transition-opacity duration-200",
                sidebarOpen ? "opacity-100 delay-100" : "opacity-0",
              )}
            >
              New chat
            </span>
          </button>

          <div
            className={cn(
              "flex-1 overflow-y-auto transition-opacity duration-200",
              sidebarOpen ? "opacity-100 delay-100" : "pointer-events-none opacity-0",
            )}
          >
            {conversationGroups.length === 0 && (
              <p className="px-2 py-1.5 text-xs text-muted">
                No conversations yet — say something to start one.
              </p>
            )}
            {conversationGroups.map((group) => (
              <div key={group.label} className="mb-3">
                <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted/80">
                  {group.label}
                </p>
                <ul className="flex flex-col gap-0.5">
                  {group.items.map((c) => {
                    const active = conversationId === c.id;
                    return (
                      <li key={c.id} className="relative">
                        {active && (
                          <span className="absolute left-0 top-1/2 h-4 w-1 -translate-y-1/2 rounded-full bg-accent" />
                        )}
                        <button
                          onClick={() => loadConversation(c.id)}
                          className={cn(
                            "group flex w-full items-center gap-1.5 rounded-xl py-2 pl-3.5 pr-2 text-left text-[13px] transition-all duration-150",
                            active
                              ? "bg-surface-sunken font-medium text-foreground shadow-sm"
                              : "text-muted hover:bg-surface-sunken/70 hover:text-foreground",
                          )}
                        >
                          <span className="min-w-0 flex-1 truncate">
                            {c.title}
                          </span>
                          <span
                            onClick={(e) => removeConversation(c.id, e)}
                            role="button"
                            aria-label="Delete chat"
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted opacity-0 transition-all hover:bg-danger/10 hover:text-danger group-hover:opacity-100"
                          >
                            ✕
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="relative flex h-screen flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header
          className="relative z-10 flex shrink-0 items-center justify-end gap-4 px-5 py-4"
          style={{ animation: "popIn 0.5s ease-out" }}
        >
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPanelOpen((v) => !v)}
            className="gap-2 text-xs"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
            Memory
            <span className="tabular-nums text-muted">
              {memoryRows.length + recordRows.length + docs.length}
            </span>
          </Button>
        </header>

        {/* Conversation */}
        <main className="relative z-10 flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-5 pb-6">
          {messages.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
              <div
                className="flex h-14 w-14 items-center justify-center rounded-full border border-accent/30 bg-accent-soft"
                style={{ animation: "popIn 0.4s ease-out" }}
              >
                <span
                  className="text-xl font-semibold text-accent"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  L
                </span>
              </div>
              <div>
                <h2
                  className="text-[28px] italic leading-tight tracking-tight text-foreground"
                  style={{ fontFamily: "var(--font-serif)" }}
                >
                  What's on your mind?
                </h2>
                <p className="mx-auto mt-2.5 max-w-sm text-sm text-muted">
                  Say anything — facts worth remembering are saved
                  automatically, nothing to configure.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-1 flex-col gap-7 py-6">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={m.role === "user" ? "ml-auto max-w-[80%]" : "w-full"}
                  style={{ animation: "popIn 0.35s cubic-bezier(0.22,1,0.36,1) both" }}
                >
                  {m.role === "user" ? (
                    <div className="rounded-3xl rounded-br-lg bg-accent px-4 py-2.5 text-sm text-on-accent shadow-[0_10px_24px_-12px_var(--ring)]">
                      <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>
                    </div>
                  ) : (
                    <div className="flex gap-3">
                      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent-2 text-xs font-bold text-on-accent">
                        L
                      </div>
                      <p className="mt-1 flex-1 whitespace-pre-wrap text-sm leading-relaxed">
                        {m.text}
                      </p>
                    </div>
                  )}

                  {m.remembered && m.remembered.length > 0 && (
                    <p className="mt-2 flex items-start gap-1.5 pl-10 text-xs text-muted">
                      <span aria-hidden className="text-accent">
                        ◆
                      </span>
                      <span>{m.remembered.join(" · ")}</span>
                    </p>
                  )}

                  {m.sources && m.sources.length > 0 && (
                    <details className="mt-2 pl-10 text-xs text-muted">
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
                <div
                  className="flex w-full flex-col gap-1.5"
                  style={{ animation: "popIn 0.3s ease-out" }}
                >
                  <div className="flex gap-3">
                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent-2 text-xs font-bold text-on-accent">
                      L
                    </div>
                    <div className="mt-1 flex items-center gap-2.5 text-sm text-muted">
                      <span className="flex gap-1">
                        <span
                          className="h-1.5 w-1.5 rounded-full bg-accent"
                          style={{ animation: "softBounce 1.1s ease-in-out infinite", animationDelay: "-0.3s" }}
                        />
                        <span
                          className="h-1.5 w-1.5 rounded-full bg-accent"
                          style={{ animation: "softBounce 1.1s ease-in-out infinite", animationDelay: "-0.15s" }}
                        />
                        <span
                          className="h-1.5 w-1.5 rounded-full bg-accent"
                          style={{ animation: "softBounce 1.1s ease-in-out infinite" }}
                        />
                      </span>
                      <span className="text-xs">{currentStageLabel}…</span>
                    </div>
                  </div>
                  {completedSteps.length > 0 && (
                    <button
                      onClick={() => setShowTrace((v) => !v)}
                      className="pl-10 text-left text-[11px] text-muted underline decoration-dotted underline-offset-2 hover:text-foreground"
                    >
                      {showTrace ? "Hide details" : "Show details"}
                    </button>
                  )}
                  {showTrace && (
                    <ul className="flex flex-col gap-1 pl-10 text-[11px] text-muted">
                      {completedSteps.map((s, i) => (
                        <li key={i} className="flex items-baseline gap-1.5">
                          <span className="text-accent">✓</span>
                          <span>{STAGE_LABEL[s.stage]}</span>
                          {s.ms !== undefined && (
                            <span className="tabular-nums opacity-70">{s.ms}ms</span>
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
      </main>

      {/* Composer */}
      <div className="relative z-10 mx-auto w-full max-w-3xl shrink-0 px-5 pb-5">
        <div
          className="pointer-events-none absolute left-1/2 top-0 h-24 w-[70%] -translate-x-1/2 rounded-full bg-accent/20 blur-3xl"
          style={{ animation: "glowPulse 6s ease-in-out infinite" }}
          aria-hidden
        />
        <div className="relative flex gap-2 rounded-full border border-border/60 bg-surface p-1.5 pl-5 shadow-[0_16px_40px_-20px_var(--ring)] backdrop-blur-sm transition-shadow focus-within:border-accent/50 focus-within:shadow-[0_0_0_4px_var(--ring)]">
          <input
            ref={inputRef}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
            placeholder="Say something…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSend();
            }}
          />
          <Button
            className="h-auto px-6 py-2.5"
            disabled={asking || !input.trim()}
            onClick={handleSend}
          >
            {asking ? "…" : "Send"}
          </Button>
        </div>
        <p className="mt-2 text-center text-[11px] text-muted">
          Runs fully on-device — nothing leaves this machine.
        </p>
      </div>

      {/* Memory panel (slide-over) */}
      <div
        className={cn(
          "fixed inset-0 z-20 transition-opacity duration-300",
          panelOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <div
          className="absolute inset-0 bg-black/20 backdrop-blur-[2px]"
          onClick={() => setPanelOpen(false)}
        />
        <div
          className={cn(
            "absolute right-0 top-0 flex h-full w-full max-w-sm flex-col border-l border-border/60 bg-surface p-5 shadow-2xl transition-transform duration-300 ease-out",
            panelOpen ? "translate-x-0" : "translate-x-full",
          )}
        >
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as TableKind)}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="mb-4 flex items-center gap-1.5">
              <TabsList className="rounded-full bg-surface-sunken p-1 shadow-inner">
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
              <button
                onClick={() => setPanelOpen(false)}
                aria-label="Close panel"
                className="text-muted transition-colors hover:text-foreground"
              >
                ✕
              </button>
            </div>

            <TabsPanel value="memories" className="overflow-y-auto">
              <ul className="flex flex-col gap-0.5">
                {memoryRows.length === 0 && (
                  <li className="py-1 text-xs text-muted">No memories yet.</li>
                )}
                {memoryRows.map((m) => (
                  <li
                    key={m.id}
                    className="group flex items-start justify-between gap-2 rounded-2xl px-3 py-2.5 transition-all duration-200 hover:bg-surface-sunken hover:translate-x-0.5"
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
                    className="group rounded-2xl px-3 py-2.5 transition-all duration-200 hover:bg-surface-sunken hover:translate-x-0.5"
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
                    className="group rounded-2xl px-3 py-2.5 transition-all duration-200 hover:bg-surface-sunken hover:translate-x-0.5"
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
        </div>
      </div>
      </div>
    </div>
  );
}
