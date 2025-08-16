import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { conversationChunks, user as users } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

// Types for API payload compatibility
type ConversationChunk = {
  speaker: "user" | "ai";
  userId?: string;
  userName?: string;
  text: string;
  ts: number; // epoch ms
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { meetingId } = body || {};

    if (!meetingId) {
      return NextResponse.json(
        { error: "Missing meetingId" },
        { status: 400 }
      );
    }
    // Support two modes:
    // 1) Legacy overwrite mode (transcript/agentResponse/isAgentSpeaking)
    // 2) Append chunk mode: { mode: 'append', chunk: ConversationChunk }
    if (body?.mode === "append" && body?.chunk) {
      const chunk = body.chunk as ConversationChunk;
      if (!chunk?.text || typeof chunk.text !== "string") {
        return NextResponse.json({ error: "Invalid chunk" }, { status: 400 });
      }
      // Normalize timestamp and enrich username if needed
      const ts = typeof chunk.ts === "number" && chunk.ts > 0 ? new Date(chunk.ts) : new Date();
      let finalUserName = chunk.userName;
      if (!finalUserName && chunk.userId) {
        try {
          const rows = await db.select({ name: users.name }).from(users).where(eq(users.id, chunk.userId)).limit(1);
          finalUserName = rows?.[0]?.name || undefined;
        } catch {}
      }

      await db.insert(conversationChunks).values({
        meetingId,
        speaker: chunk.speaker === "ai" ? "ai" : "user",
        userId: chunk.userId,
        userName: finalUserName,
        text: chunk.text,
        ts,
      });
      return NextResponse.json({ success: true });
    } else {
      // Legacy no-op with DB approach; accept but do nothing.
      return NextResponse.json({ success: true, note: "legacy fields ignored" });
    }
  } catch (error) {
    console.error("Conversation sync error:", error);
    return NextResponse.json(
      { error: "Failed to sync conversation" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const meetingId = searchParams.get("meetingId");
    const format = searchParams.get("format"); // e.g., 'joined'

    if (!meetingId) {
      return NextResponse.json(
        { error: "Missing meetingId" },
        { status: 400 }
      );
    }
    // Read chunks from DB, ordered by ts ascending
    const rows = await db.select().from(conversationChunks).where(eq(conversationChunks.meetingId, meetingId)).orderBy(conversationChunks.ts);

    if (format === "joined") {
      const joined = rows
        .map((c) => `${c.speaker === "ai" ? "AI" : (c.userName || "User")}: ${c.text}`)
        .join("\n");
      return NextResponse.json({ transcript: joined });
    }

    return NextResponse.json({
      transcript: "",
      agentResponse: "",
      isAgentSpeaking: false,
      chunks: rows,
      lastUpdated: rows.length ? new Date(rows[rows.length - 1].ts as Date).getTime() : 0,
    });
  } catch (error) {
    console.error("Conversation sync error:", error);
    return NextResponse.json(
      { error: "Failed to get conversation data" },
      { status: 500 }
    );
  }
}
 