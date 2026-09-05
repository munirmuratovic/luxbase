"use client";

import { useState } from "react";

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
};

export default function RagPage() {
  const [docText, setDocText] = useState("");
  const [docSource, setDocSource] = useState("");
  const [ingesting, setIngesting] = useState(false);
  const [ingestStatus, setIngestStatus] = useState<string | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);

  async function handleIngest() {
    if (!docText.trim()) return;
    setIngesting(true);
    setIngestStatus(null);
    try {
      const res = await fetch("/api/rag/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: docText, source: docSource || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ingest failed");
      setIngestStatus(`Ingested ${data.chunksInserted} chunk(s).`);
      setDocText("");
      setDocSource("");
    } catch (err) {
      setIngestStatus(err instanceof Error ? err.message : "Ingest failed");
    } finally {
      setIngesting(false);
    }
  }

  async function handleAsk() {
    if (!question.trim()) return;
    const q = question;
    setQuestion("");
    setMessages((prev) => [...prev, { role: "user", text: q }]);
    setAsking(true);
    try {
      const res = await fetch("/api/rag/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Query failed");
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: data.answer, sources: data.sources },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: err instanceof Error ? err.message : "Query failed",
        },
      ]);
    } finally {
      setAsking(false);
    }
  }

  return (
    <div className="flex min-h-full flex-1 justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-3xl flex-col gap-8 px-6 py-12">
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
          Local RAG
        </h1>

        <section className="flex flex-col gap-3 rounded-lg border border-black/[.08] p-4 dark:border-white/[.145]">
          <h2 className="font-medium text-black dark:text-zinc-50">
            Ingest a document
          </h2>
          <input
            className="rounded border border-black/[.08] bg-transparent px-3 py-2 text-sm dark:border-white/[.145]"
            placeholder="Source name (optional)"
            value={docSource}
            onChange={(e) => setDocSource(e.target.value)}
          />
          <textarea
            className="min-h-32 rounded border border-black/[.08] bg-transparent px-3 py-2 text-sm dark:border-white/[.145]"
            placeholder="Paste document text here..."
            value={docText}
            onChange={(e) => setDocText(e.target.value)}
          />
          <button
            className="self-start rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
            disabled={ingesting || !docText.trim()}
            onClick={handleIngest}
          >
            {ingesting ? "Ingesting..." : "Ingest"}
          </button>
          {ingestStatus && (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {ingestStatus}
            </p>
          )}
        </section>

        <section className="flex flex-col gap-3 rounded-lg border border-black/[.08] p-4 dark:border-white/[.145]">
          <h2 className="font-medium text-black dark:text-zinc-50">Ask</h2>
          <div className="flex flex-col gap-4">
            {messages.map((m, i) => (
              <div key={i} className="flex flex-col gap-1">
                <span className="text-xs font-medium uppercase text-zinc-500">
                  {m.role}
                </span>
                <p className="whitespace-pre-wrap text-sm text-black dark:text-zinc-50">
                  {m.text}
                </p>
                {m.sources && m.sources.length > 0 && (
                  <details className="text-xs text-zinc-500">
                    <summary>{m.sources.length} source(s)</summary>
                    <ul className="mt-1 flex flex-col gap-1">
                      {m.sources.map((s) => (
                        <li key={s.id}>
                          {s.source ?? "untitled"} (distance{" "}
                          {s.distance.toFixed(3)}): {s.content.slice(0, 120)}...
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
              placeholder="Ask a question..."
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAsk();
              }}
            />
            <button
              className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
              disabled={asking || !question.trim()}
              onClick={handleAsk}
            >
              {asking ? "Asking..." : "Ask"}
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
