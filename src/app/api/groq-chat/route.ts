import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import { db } from "@/db";
import { agents } from "@/db/schema";
import { eq } from "drizzle-orm";

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
});

export async function POST(req: NextRequest) {
    try {
        const { message, agentId } = await req.json();

        if (!message || !agentId) {
            return NextResponse.json(
                { error: "Missing message or agentId" },
                { status: 400 }
            );
        }

        // Get agent instructions from database
        const [agent] = await db
            .select()
            .from(agents)
            .where(eq(agents.id, agentId));

        if (!agent) {
            return NextResponse.json(
                { error: "Agent not found" },
                { status: 404 }
            );
        }

        // Generate response using Groq
        const completion = await groq.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: agent.instructions || "You are a helpful assistant in a video call. Respond naturally and conversationally."
                },
                {
                    role: "user",
                    content: message
                }
            ],
            model: "llama3-8b-8192", // Free Groq model
            temperature: 0.5,
            max_tokens: 800,
        });

        const response = completion.choices[0]?.message?.content || "I'm sorry, I didn't understand that.";

        return NextResponse.json({
            response,
            agent: agent.name,
        });

    } catch (error) {
        console.error("Groq API error:", error);
        return NextResponse.json(
            { error: "Failed to generate response", details: error instanceof Error ? error.message : String(error) },
            { status: 500 }
        );
    }
} 