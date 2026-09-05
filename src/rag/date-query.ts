const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "llama3.1";

const DATE_HINT =
  /\b(19|20)\d{2}\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i;

export function mightReferenceDate(message: string): boolean {
  return DATE_HINT.test(message);
}

const DATE_RANGE_HINT =
  /\b(19|20)\d{2}\s*-\s*(19|20)\d{2}\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4}\s*[-–]\s*(present|(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4})\b/i;

export function looksLikeStructuredPaste(message: string): boolean {
  const lineCount = message.split("\n").filter((l) => l.trim()).length;
  return lineCount >= 6 && DATE_RANGE_HINT.test(message);
}

export async function extractDateFromQuery(
  message: string,
): Promise<string | null> {
  const prompt = `Extract the single date being asked about in this question, as an ISO date "YYYY-MM-DD". If only a month and year are given, use day 01. If no specific date/month/year is mentioned, respond with null.

Question: "${message}"

Respond with only JSON, no other text: {"date": "YYYY-MM-DD" or null}`;

  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt,
      stream: false,
      format: "json",
      options: { temperature: 0 },
    }),
  });

  if (!res.ok) return null;

  const data = (await res.json()) as { response: string };
  try {
    const parsed = JSON.parse(data.response) as { date?: string | null };
    return typeof parsed.date === "string" ? parsed.date : null;
  } catch {
    return null;
  }
}
