import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { subtasks } from "@/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

// Get subtasks for a task
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const taskId = searchParams.get("taskId");

        if (!taskId) {
            return NextResponse.json(
                { error: "Task ID is required" },
                { status: 400 }
            );
        }

        const taskSubtasks = await db
            .select()
            .from(subtasks)
            .where(eq(subtasks.taskId, taskId))
            .orderBy(subtasks.createdAt);

        return NextResponse.json({
            success: true,
            subtasks: taskSubtasks,
        });

    } catch (error) {
        console.error("Error fetching subtasks:", error);
        return NextResponse.json(
            { error: "Failed to fetch subtasks" },
            { status: 500 }
        );
    }
}

// Create a new subtask
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { taskId, title, aiGenerated = false } = body;

        if (!taskId || !title) {
            return NextResponse.json(
                { error: "Task ID and title are required" },
                { status: 400 }
            );
        }

        const [newSubtask] = await db
            .insert(subtasks)
            .values({
                id: nanoid(),
                taskId,
                title,
                completed: false,
                aiGenerated,
            })
            .returning();

        return NextResponse.json({
            success: true,
            subtask: newSubtask,
        });

    } catch (error) {
        console.error("Error creating subtask:", error);
        return NextResponse.json(
            { error: "Failed to create subtask" },
            { status: 500 }
        );
    }
}

// Update a subtask
export async function PUT(request: NextRequest) {
    try {
        const body = await request.json();
        const { id, ...updateData } = body;

        if (!id) {
            return NextResponse.json(
                { error: "Subtask ID is required" },
                { status: 400 }
            );
        }

        const [updatedSubtask] = await db
            .update(subtasks)
            .set({
                ...updateData,
                updatedAt: new Date(),
            })
            .where(eq(subtasks.id, id))
            .returning();

        return NextResponse.json({
            success: true,
            subtask: updatedSubtask,
        });

    } catch (error) {
        console.error("Error updating subtask:", error);
        return NextResponse.json(
            { error: "Failed to update subtask" },
            { status: 500 }
        );
    }
}

// Delete a subtask
export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const subtaskId = searchParams.get("subtaskId");

        if (!subtaskId) {
            return NextResponse.json(
                { error: "Subtask ID is required" },
                { status: 400 }
            );
        }

        await db.delete(subtasks).where(eq(subtasks.id, subtaskId));

        return NextResponse.json({
            success: true,
            message: "Subtask deleted successfully",
        });

    } catch (error) {
        console.error("Error deleting subtask:", error);
        return NextResponse.json(
            { error: "Failed to delete subtask" },
            { status: 500 }
        );
    }
} 