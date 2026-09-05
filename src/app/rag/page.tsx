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
  remembered?: string | null;
};

export default function RagPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [asking, setAsking] = useState(false);

  async function handleSend() {
    if (!input.trim()) return;
    const text = input;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text }]);
    setAsking(true);
    try {
      const res = await fetch("/api/rag/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Chat failed");
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: data.answer,
          sources: data.sources,
          remembered: data.remembered,
        },
      ]);
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
      <main className="flex w-full max-w-2xl flex-col gap-6 px-6 py-12">
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
              {m.remembered && (
                <p className="text-xs italic text-zinc-500">
                  remembered: &ldquo;{m.remembered}&rdquo;
                </p>
              )}
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
          {asking && (
            <p className="text-sm text-zinc-500">Thinking...</p>
          )}
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
      </main>
    </div>
  );
}
