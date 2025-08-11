import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { agents } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const agentId = searchParams.get('agentId');

        if (!agentId) {
            return NextResponse.json(
                { error: "Missing agentId" },
                { status: 400 }
            );
        }

        // Get agent from database
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

        return NextResponse.json({
            id: agent.id,
            name: agent.name,
            instructions: agent.instructions
        });

    } catch (error) {
        console.error("Agent info error:", error);
        return NextResponse.json(
            { error: "Failed to get agent info" },
            { status: 500 }
        );
    }
} 