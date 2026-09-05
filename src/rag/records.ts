const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "llama3.1";

export type ExtractedRecord = {
  type: string;
  startDate: string | null;
  endDate: string | null;
  data: Record<string, unknown>;
};

export async function extractRecords(
  rawText: string,
): Promise<ExtractedRecord[]> {
  const prompt = `Extract structured records from the pasted text below. This may be a LinkedIn "Experience" section, a list of jobs, education, projects, or similar. For each distinct entry (e.g. each job), produce one record.

Each record has:
- "type": a short snake_case category, e.g. "work_experience", "education", "project"
- "startDate": ISO date "YYYY-MM-DD" (use day 01 if only month/year is known), or null if unknown
- "endDate": ISO date "YYYY-MM-DD" similarly, or null if the entry is ongoing/current ("Present")
- "data": an object with the relevant fields for that type, e.g. for work_experience: {"company": "...", "title": "...", "description": "...", "skills": ["..."]}

Rules:
- One record per role/entry, even if the same company appears multiple times with different titles.
- Ignore duration text like "3 yrs 11 mos" — derive dates only from explicit date ranges.
- Ignore the "+N skills" text, just list the skills that are explicitly named.

Text:
"""
${rawText}
"""

Respond with only a JSON object containing a "records" array, no other text — include every entry found, not just the first one. Example shape:
{"records":[{"type":"work_experience","startDate":"2021-10-01","endDate":"2022-11-01","data":{"company":"Endava","title":"Software Engineer","description":"Performance tuning, Fullstack development","skills":["React.js","Next.js"]}}]}`;

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

  if (!res.ok) {
    throw new Error(
      `Ollama request failed (${res.status}): ${await res.text()}`,
    );
  }

  const data = (await res.json()) as { response: string };

  const normalizeDate = (value: unknown): string | null => {
    if (typeof value !== "string") return null;
    return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
  };

  try {
    const parsed = JSON.parse(data.response);
    const list = Array.isArray(parsed) ? parsed : parsed.records;
    if (!Array.isArray(list)) return [];

    return list
      .filter(
        (r): r is Record<string, unknown> =>
          typeof r?.type === "string" &&
          r.type.length > 0 &&
          typeof r?.data === "object" &&
          r.data !== null,
      )
      .map((r) => ({
        type: r.type as string,
        startDate: normalizeDate(r.startDate),
        endDate: normalizeDate(r.endDate),
        data: r.data as Record<string, unknown>,
      }));
  } catch {
    return [];
  }
}
