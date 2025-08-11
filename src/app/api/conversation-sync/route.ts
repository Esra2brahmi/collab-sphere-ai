import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { meetings } from "@/db/schema";
import { eq } from "drizzle-orm";

// In-memory storage for conversation data (in production, use Redis or database)
const conversationStore = new Map<string, {
    transcript: string;
    agentResponse: string;
    isAgentSpeaking: boolean;
    lastUpdated: number;
}>();

export async function POST(req: NextRequest) {
    try {
        const { meetingId, transcript, agentResponse, isAgentSpeaking } = await req.json();

        if (!meetingId) {
            return NextResponse.json(
                { error: "Missing meetingId" },
                { status: 400 }
            );
        }

        // Store conversation data
        conversationStore.set(meetingId, {
            transcript: transcript || '',
            agentResponse: agentResponse || '',
            isAgentSpeaking: isAgentSpeaking || false,
            lastUpdated: Date.now()
        });

        console.log(`[ConversationSync] Updated conversation for meeting ${meetingId}:`, {
            transcript,
            agentResponse,
            isAgentSpeaking
        });

        return NextResponse.json({ success: true });

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
        const meetingId = searchParams.get('meetingId');

        if (!meetingId) {
            return NextResponse.json(
                { error: "Missing meetingId" },
                { status: 400 }
            );
        }

        // Get conversation data
        const conversationData = conversationStore.get(meetingId);
        
        if (!conversationData) {
            return NextResponse.json({
                transcript: '',
                agentResponse: '',
                isAgentSpeaking: false
            });
        }

        // Clean up old data (older than 5 minutes)
        const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
        if (conversationData.lastUpdated < fiveMinutesAgo) {
            conversationStore.delete(meetingId);
            return NextResponse.json({
                transcript: '',
                agentResponse: '',
                isAgentSpeaking: false
            });
        }

        return NextResponse.json({
            transcript: conversationData.transcript,
            agentResponse: conversationData.agentResponse,
            isAgentSpeaking: conversationData.isAgentSpeaking
        });

    } catch (error) {
        console.error("Conversation sync error:", error);
        return NextResponse.json(
            { error: "Failed to get conversation data" },
            { status: 500 }
        );
    }
} 