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

        const systemPrompt = (
            (agent.instructions || "You are a helpful assistant in a video call.") +
            "\nStyle rules:" +
            "\n- Be clear, natural, and human. Avoid robotic phrasing." +
            "\n- Answer completely but be concise. Use short paragraphs." +
            "\n- Use lists when helpful (keep them focused)."
        );

        type Msg = { role: "system" | "user" | "assistant"; content: string };
        const baseMessages: Msg[] = [
            { role: "system", content: systemPrompt },
            { role: "user", content: message },
        ];

        const model = "llama3-8b-8192"; // Free Groq model
        const maxTokensInitial = 1024;
        const maxTokensContinue = 768;
        const maxContinuations = 3;

        const callGroq = async (messages: Msg[], maxTokens: number) => {
            const completion = await groq.chat.completions.create({
                messages,
                model,
                temperature: 0.3,
                max_tokens: maxTokens,
                top_p: 0.9,
                presence_penalty: 0.1,
                frequency_penalty: 0.2,
            });
            const choice = completion.choices?.[0];
            const text = choice?.message?.content || "";
            const finishReason = (choice as any)?.finish_reason || completion.choices?.[0]?.finish_reason || "stop";
            return { text, finishReason } as const;
        };

        // First response
        const parts: string[] = [];
        let messages: Msg[] = [...baseMessages];
        let { text, finishReason } = await callGroq(messages, maxTokensInitial);
        parts.push(text);

        // If truncated, request continuation up to N times
        let loops = 0;
        while (finishReason === "length" && loops < maxContinuations) {
            loops += 1;
            messages = [
                { role: "system", content: systemPrompt },
                { role: "user", content: message },
                { role: "assistant", content: parts.join("\n") },
                { role: "user", content: "Please continue the previous answer. Do not repeat content." },
            ];
            const res = await callGroq(messages, maxTokensContinue);
            parts.push(res.text);
            finishReason = res.finishReason;
        }

        const response = parts.join("\n").trim() || "I'm sorry, I didn't understand that.";

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