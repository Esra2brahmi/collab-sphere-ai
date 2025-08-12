import { NextRequest, NextResponse } from "next/server";
// Ensure Node.js runtime so process.env is available (not Edge)
export const runtime = "nodejs";
import { db } from "@/db";
import { meetings } from "@/db/schema";
import { eq } from "drizzle-orm";
import Groq from "groq-sdk";

const groqApiKey = process.env.GROQ_API_KEY;
const groq = groqApiKey ? new Groq({ apiKey: groqApiKey }) : null;
if (!groqApiKey) {
  console.warn("[meeting-complete] GROQ_API_KEY is not set. Using heuristic analysis.");
}
const hfApiKey = process.env.HUGGINGFACE_API_KEY;
const hfModel = "distilbert-base-uncased-finetuned-sst-2-english";
if (!hfApiKey) {
  console.warn("[meeting-complete] HUGGINGFACE_API_KEY not set. Skipping HF SST-2 sentiment.");
}

type Insights = {
  source?: "groq" | "heuristic" | "hf-sst2" | "hybrid";
  sentiment_analysis: {
    overall_score: number; // 0..1
    trend?: number[];
    participants?: Record<string, { avg_sentiment: number; confidence_level?: number }>;
    notes?: string[];
  };
  expertise_detection: Record<string, Record<string, number>>; // user -> skill -> confidence 0..1
  role_suggestions: Array<{ role: string; user: string; confidence: number; reasoning?: string }>;
};

async function computeHFSentiment(text: string): Promise<{ score: number; label: string } | null> {
  if (!hfApiKey) return null;
  try {
    const res = await fetch(`https://api-inference.huggingface.co/models/${hfModel}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${hfApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ inputs: text.slice(0, 8000) }),
    });
    if (!res.ok) {
      console.warn("[meeting-complete] HF sentiment HTTP", res.status, await res.text());
      return null;
    }
    const data = await res.json();
    // Expected: [[{label: 'NEGATIVE', score: 0.1}, {label:'POSITIVE', score:0.9}]] or [{...}]
    const arr = Array.isArray(data) ? data : [];
    const first = Array.isArray(arr[0]) ? arr[0] : arr;
    const pos = first.find((x: any) => x.label === "POSITIVE");
    const neg = first.find((x: any) => x.label === "NEGATIVE");
    if (!pos && !neg) return null;
    const label = (pos?.score ?? 0) >= (neg?.score ?? 0) ? "POSITIVE" : "NEGATIVE";
    const score = label === "POSITIVE" ? (pos?.score ?? 0.5) : 1 - (neg?.score ?? 0.5);
    return { score, label };
  } catch (e) {
    console.error("[meeting-complete] HF sentiment error:", e);
    return null;
  }
}

async function generateSummary(conversation: string): Promise<string> {
  const trimmed = (conversation || "").trim();
  if (!trimmed) return "No conversation captured.";

  // Use Groq if available
  if (groq) {
    console.log("[meeting-complete] Attempting Groq summary...");
    try {
      const completion = await groq.chat.completions.create({
        messages: [
          { role: "system", content: "You are an assistant that writes concise meeting summaries. Keep it under 120 words. Use bullet points only if necessary." },
          { role: "user", content: `Summarize this conversation succinctly so someone who missed it can catch up quickly.\n\nConversation:\n${trimmed}` },
        ],
        model: "llama3-8b-8192",
        temperature: 0.3,
        max_tokens: 240,
      });
      const out = completion.choices[0]?.message?.content?.trim() || "";
      console.log("[meeting-complete] Groq summary succeeded (length:", out.length, ")");
      return out;
    } catch (e) {
      console.error("[meeting-complete] Groq summarization failed, falling back:", e);
    }
  }

  // Fallback: simple heuristic summary
  const lines = trimmed.split(/\n+/).slice(-12); // last few turns
  const fallback = lines
    .map((l) => l.replace(/^User:\s*/, ""))
    .filter(Boolean)
    .slice(-5)
    .join(". ");
  return fallback ? `Key points: ${fallback}` : "Summary unavailable.";
}

async function generateInsights(conversation: string, participants?: string[]): Promise<Insights> {
  const base: Insights = {
    sentiment_analysis: { overall_score: 0.5, notes: [] },
    expertise_detection: {},
    role_suggestions: [],
  };

  const text = (conversation || "").trim();
  if (!text) return base;

  // Try HuggingFace SST-2 sentiment first (fast & accurate) and record in base
  let hfSent: { score: number; label: string } | null = null;
  if (hfApiKey) {
    hfSent = await computeHFSentiment(text);
    if (hfSent) {
      base.sentiment_analysis.overall_score = Math.min(0.95, Math.max(0.05, hfSent.score));
      base.sentiment_analysis.notes = [
        ...(base.sentiment_analysis.notes || []),
        `HF SST-2 sentiment (${hfSent.label}) score: ${hfSent.score.toFixed(2)}`,
      ];
      base.source = "hf-sst2";
    }
  }

  if (groq) {
    console.log("[meeting-complete] Attempting Groq insights...");
    try {
      const completion = await groq.chat.completions.create({
        messages: [
          { role: "system", content: [
            "You analyze team conversations and return STRICT JSON with keys: sentiment_analysis, expertise_detection, role_suggestions.",
            "- sentiment_analysis.overall_score must be 0..1 with 0.5 as neutral baseline. Avoid extreme 0 or 1 unless overwhelmingly negative/positive.",
            "- expertise_detection is a map: user -> { skill: confidence(0..1) }.",
            "- role_suggestions is an array of { role, user, confidence(0..1), reasoning }.",
            "- If explicit roles are not stated, infer from skills. Prefer at least one suggestion when expertise is detected.",
            "- Output JSON only; no prose."
          ].join("\n") },
          { role: "user", content: [
            `Participants: ${participants?.join(", ") || "Unknown"}`,
            "Conversation (speaker prefixed lines):",
            text,
            "Return JSON only."
          ].join("\n") },
        ],
        model: "llama3-8b-8192",
        temperature: 0.2,
        max_tokens: 400,
      });
      const raw = completion.choices[0]?.message?.content?.trim() || "";
      const jsonStart = raw.indexOf('{');
      const jsonEnd = raw.lastIndexOf('}');
      const json = jsonStart >= 0 && jsonEnd > jsonStart ? raw.slice(jsonStart, jsonEnd + 1) : raw;
      const parsed = JSON.parse(json) as Insights;
      // Basic sanity checks
      if (!parsed.sentiment_analysis || !parsed.expertise_detection || !parsed.role_suggestions) {
        throw new Error("Malformed insights JSON");
      }
      // Merge HF sentiment if available, else keep Groq's
      if (hfSent) {
        parsed.sentiment_analysis = parsed.sentiment_analysis || { overall_score: 0.5 } as any;
        parsed.sentiment_analysis.overall_score = Math.min(0.95, Math.max(0.05, hfSent.score));
        parsed.sentiment_analysis.notes = [
          ...(parsed.sentiment_analysis.notes || []),
          `HF SST-2 sentiment (${hfSent.label}) score: ${hfSent.score.toFixed(2)}`,
        ];
        parsed.source = parsed.source ? "hybrid" : "hf-sst2";
      } else {
        parsed.source = "groq";
      }
      // Post-process: clamp extreme sentiment and backfill roles if empty
      const s = parsed.sentiment_analysis.overall_score;
      if (typeof s === 'number') {
        const clamped = Math.min(0.95, Math.max(0.05, s));
        if (clamped !== s) {
          parsed.sentiment_analysis.notes = [
            ...(parsed.sentiment_analysis.notes || []),
            `Adjusted extreme LLM sentiment from ${s.toFixed?.(2) ?? s} to ${clamped.toFixed(2)}`,
          ];
          parsed.sentiment_analysis.overall_score = clamped;
        }
      }
      if (Array.isArray(parsed.role_suggestions) && parsed.role_suggestions.length === 0) {
        const roleMap: Record<string, string> = {
          react: "Frontend Lead",
          "react native": "Mobile Lead",
          node: "Backend Lead",
          "node.js": "Backend Lead",
          backend: "Backend Lead",
          database: "Database Design",
          sql: "Database Design",
          devops: "DevOps",
          testing: "QA",
          python: "Backend Lead",
          architecture: "Tech Lead / Architect",
          "software development": "Engineering Lead",
          "best practices": "Quality Champion",
        };
        for (const [user, skills] of Object.entries(parsed.expertise_detection || {})) {
          for (const [skill, conf] of Object.entries(skills || {})) {
            const key = skill.toLowerCase();
            const role = roleMap[key];
            if (role) {
              parsed.role_suggestions.push({ role, user, confidence: Math.min(1, (conf as number) + 0.1), reasoning: `Inferred from skill '${skill}'.` });
            }
          }
        }
      }
      console.log("[meeting-complete] Groq insights succeeded.");
      return parsed;
    } catch (e) {
      console.error("[meeting-complete] Groq insights parsing failed, falling back:", e);
    }
  }

  // Fallback heuristic insights
  const lower = text.toLowerCase();
  const pos = (lower.match(/\b(good|great|cool|nice|love|awesome|works)\b/g) || []).length;
  const neg = (lower.match(/\b(bad|problem|issue|don't|cant|confused|stuck)\b/g) || []).length;
  const score = Math.max(0, Math.min(1, (pos + 1) / (pos + neg + 2)));
  base.sentiment_analysis.overall_score = score;
  base.sentiment_analysis.notes = [
    `Heuristic sentiment score: ${score.toFixed(2)}`,
  ];
  base.source = "heuristic";
  // Very simple expertise extraction from "I'm good at X" pattern
  const skillRegex = /(i\s*(am|'m)\s*(good|experienced|comfortable)\s*(with|at)\s+([a-zA-Z0-9#.+\-_/ ]{2,}))/gi;
  const stopwords = new Set([
    "the","a","an","and","or","to","of","in","on","for","with","at","by","from","about","as","into","like","through","after","over","between","out","against","during","without","before","under","around","among",
    "what","which","who","whom","this","that","these","those","is","are","was","were","be","been","being","have","has","had","do","does","did","will","would","shall","should","can","could","may","might","must",
    "so","just","really","very","you","i","im","i'm","we","they","he","she","it","my","our","your","their","me","us","them"
  ]);
  const users: Record<string, Record<string, number>> = {};
  const lines = text.split(/\n+/);
  for (const line of lines) {
    const speaker = line.split(":")[0].trim();
    let m: RegExpExecArray | null;
    while ((m = skillRegex.exec(line)) !== null) {
      const raw = (m[5] || "").toLowerCase();
      // sanitize: keep alphanumerics and common tech symbols, collapse spaces
      const cleaned = raw.replace(/[^a-z0-9#+._\-/ ]+/g, " ").replace(/\s+/g, " ").trim();
      if (!cleaned) continue;
      // reduce to up to 3 non-stopword tokens
      const tokens = cleaned.split(" ").filter(t => t && !stopwords.has(t));
      if (tokens.length === 0 || tokens.length > 3) continue;
      const skill = tokens.join(" ");
      if (skill.length < 2 || skill.length > 30) continue;
      const userKey = speaker || "Unknown";
      users[userKey] = users[userKey] || {};
      users[userKey][skill] = Math.min(1, (users[userKey][skill] || 0.5) + 0.2);
    }
  }
  base.expertise_detection = users;
  // Rudimentary role suggestion: map common skills to roles
  const roleMap: Record<string, string> = {
    react: "Frontend Lead",
    "react native": "Mobile Lead",
    node: "Backend Lead",
    "node.js": "Backend Lead",
    backend: "Backend Lead",
    database: "Database Design",
    sql: "Database Design",
    devops: "DevOps",
    testing: "QA",
    python: "Backend Lead",
  };
  for (const [user, skills] of Object.entries(users)) {
    for (const [skill, conf] of Object.entries(skills)) {
      const role = roleMap[skill] || undefined;
      if (role) base.role_suggestions.push({ role, user, confidence: Math.min(1, conf + 0.1) });
    }
  }
  return base;
}

export async function POST(req: NextRequest) {
  try {
    const { meetingId, conversation } = await req.json();

    if (!meetingId) {
      return NextResponse.json({ error: "Missing meetingId" }, { status: 400 });
    }

    // Set meeting to processing while we summarize
    await db.update(meetings)
      .set({ status: "processing", updatedAt: new Date() })
      .where(eq(meetings.id, meetingId));

    const convo = conversation || "";
    const participantList: string[] = convo
      .split(/\n+/)
      .map((l: string) => l.split(":")[0].trim())
      .filter((s: string) => Boolean(s));
    const participants: string[] = Array.from(new Set<string>(participantList));
    const summaryText = await generateSummary(convo);
    const insights = await generateInsights(convo, participants);
    const payload = {
      summaryText,
      insights,
    };

    // Save as JSON string in summary for backward compatibility
    await db.update(meetings)
      .set({
        summary: JSON.stringify(payload),
        status: "completed",
        endedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(meetings.id, meetingId));

    return NextResponse.json({ success: true, summary: payload, source: insights?.source ?? "unknown" });
  } catch (error) {
    console.error("[meeting-complete] error:", error);
    return NextResponse.json({ error: "Failed to complete meeting" }, { status: 500 });
  }
}
