import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { meetingParticipants, user } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const meetingId = searchParams.get("meetingId");

        if (!meetingId) {
            return NextResponse.json(
                { error: "Meeting ID is required" },
                { status: 400 }
            );
        }

        // Get all participants for the meeting with their user information
        const participants = await db
            .select({
                id: user.id,
                name: user.name,
                email: user.email,
                image: user.image,
                joinedAt: meetingParticipants.joinedAt,
                role: meetingParticipants.role,
            })
            .from(meetingParticipants)
            .innerJoin(user, eq(meetingParticipants.userId, user.id))
            .where(eq(meetingParticipants.meetingId, meetingId));

        return NextResponse.json({ participants });
    } catch (error) {
        console.error("Error fetching meeting participants:", error);
        return NextResponse.json(
            { error: "Failed to fetch meeting participants" },
            { status: 500 }
        );
    }
} 