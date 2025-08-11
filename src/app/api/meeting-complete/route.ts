import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { meetings } from "@/db/schema";
import { eq } from "drizzle-orm";
import Groq from "groq-sdk";

const groqApiKey = process.env.GROQ_API_KEY;
const groq = groqApiKey ? new Groq({ apiKey: groqApiKey }) : null;

async function generateSummary(conversation: string): Promise<string> {
  const trimmed = (conversation || "").trim();
  if (!trimmed) return "No conversation captured.";

  // Use Groq if available
  if (groq) {
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
      return completion.choices[0]?.message?.content?.trim() || "";
    } catch (e) {
      console.error("Groq summarization failed, falling back:", e);
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

    const summary = await generateSummary(conversation || "");

    // Save summary and mark completed
    await db.update(meetings)
      .set({
        summary: summary || null,
        status: "completed",
        endedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(meetings.id, meetingId));

    return NextResponse.json({ success: true, summary });
  } catch (error) {
    console.error("meeting-complete error:", error);
    return NextResponse.json({ error: "Failed to complete meeting" }, { status: 500 });
  }
}
