import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { tasks, subtasks, projectPhases, user } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { nanoid } from "nanoid";

// Get all tasks for a meeting
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

        // Get all tasks with their phases and assignees
        const allTasks = await db
            .select({
                id: tasks.id,
                title: tasks.title,
                description: tasks.description,
                phase: tasks.phase,
                status: tasks.status,
                assignee: tasks.assignee,
                assigneeId: tasks.assigneeId,
                priority: tasks.priority,
                estimatedHours: tasks.estimatedHours,
                dueDate: tasks.dueDate,
                aiGenerated: tasks.aiGenerated,
                meetingId: tasks.meetingId,
                tags: tasks.tags,
                createdAt: tasks.createdAt,
                updatedAt: tasks.updatedAt,
                phaseName: projectPhases.name,
                phaseColor: projectPhases.color,
                assigneeName: user.name,
            })
            .from(tasks)
            .leftJoin(projectPhases, eq(tasks.phase, projectPhases.id))
            .leftJoin(user, eq(tasks.assigneeId, user.id))
            .where(eq(tasks.meetingId, meetingId))
            .orderBy(desc(tasks.createdAt));

        // Get subtasks for each task
        const tasksWithSubtasks = await Promise.all(
            allTasks.map(async (task) => {
                const taskSubtasks = await db
                    .select()
                    .from(subtasks)
                    .where(eq(subtasks.taskId, task.id));

                return {
                    ...task,
                    subtasks: taskSubtasks,
                };
            })
        );

        return NextResponse.json({
            success: true,
            tasks: tasksWithSubtasks,
        });

    } catch (error) {
        console.error("Error fetching tasks:", error);
        return NextResponse.json(
            { error: "Failed to fetch tasks" },
            { status: 500 }
        );
    }
}

// Create a new task
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const {
            title,
            description,
            phase,
            assigneeId,
            priority,
            estimatedHours,
            dueDate,
            meetingId,
            tags,
        } = body;

        if (!title || !phase || !meetingId) {
            return NextResponse.json(
                { error: "Title, phase, and meetingId are required" },
                { status: 400 }
            );
        }

        // Get assignee name if assigneeId is provided
        let assignee = null;
        if (assigneeId) {
            const [userData] = await db
                .select({ name: user.name })
                .from(user)
                .where(eq(user.id, assigneeId));
            assignee = userData?.name;
        }

        // Resolve a valid phase for this meeting
        async function getOrCreateDefaultPhase(meetingId: string) {
            const existing = await db
                .select()
                .from(projectPhases)
                .where(eq(projectPhases.meetingId, meetingId))
                .orderBy(projectPhases.order)
                .limit(1);
            if (existing.length > 0) return existing[0];
            // Create a default phase if none exist
            const [created] = await db.insert(projectPhases).values({
                name: "Project Planning & Setup",
                order: 1,
                color: "#8B5CF6",
                meetingId,
            }).returning();
            return created;
        }

        async function resolvePhaseId(meetingId: string, requestedPhaseId?: string) {
            if (requestedPhaseId) {
                const found = await db
                    .select({ id: projectPhases.id })
                    .from(projectPhases)
                    .where(and(eq(projectPhases.meetingId, meetingId), eq(projectPhases.id, requestedPhaseId)))
                    .limit(1);
                if (found.length > 0) return requestedPhaseId;
            }
            const defPhase = await getOrCreateDefaultPhase(meetingId);
            return defPhase.id;
        }

        const phaseId = await resolvePhaseId(meetingId, phase);

        // Create the task
        const [newTask] = await db
            .insert(tasks)
            .values({
                id: nanoid(),
                title,
                description,
                phase: phaseId,
                assignee,
                assigneeId,
                priority: priority || "medium",
                estimatedHours,
                dueDate: dueDate ? new Date(dueDate) : null,
                aiGenerated: false,
                meetingId,
                tags: tags || [],
            })
            .returning();

        // Get AI suggestions for subtasks
        const subtaskSuggestions = await getAISubtaskSuggestions(title, description);

        return NextResponse.json({
            success: true,
            task: newTask,
            aiSubtaskSuggestions: subtaskSuggestions,
        });

    } catch (error) {
        console.error("Error creating task:", error);
        return NextResponse.json(
            { error: "Failed to create task" },
            { status: 500 }
        );
    }
}

// Update a task
export async function PUT(request: NextRequest) {
    try {
        const body = await request.json();
        const { id, ...updateData } = body;

        if (!id) {
            return NextResponse.json(
                { error: "Task ID is required" },
                { status: 400 }
            );
        }

        // Update assignee name if assigneeId is provided
        if (updateData.assigneeId) {
            const [userData] = await db
                .select({ name: user.name })
                .from(user)
                .where(eq(user.id, updateData.assigneeId));
            updateData.assignee = userData?.name;
        }

        // Load existing task to know meeting context and current phase
        const [existingTask] = await db
            .select({ id: tasks.id, meetingId: tasks.meetingId, phase: tasks.phase })
            .from(tasks)
            .where(eq(tasks.id, id))
            .limit(1);
        if (!existingTask) {
            return NextResponse.json({ error: "Task not found" }, { status: 404 });
        }

        // Normalize types to avoid serialization errors (e.g., toISOString on non-Date)
        const normalizedUpdates: any = { ...updateData };

        // dueDate: allow string | number | Date | null -> Date | null
        if (Object.prototype.hasOwnProperty.call(normalizedUpdates, 'dueDate')) {
            const v = normalizedUpdates.dueDate;
            if (!v) {
                normalizedUpdates.dueDate = null;
            } else {
                const d = new Date(v);
                normalizedUpdates.dueDate = isNaN(d.getTime()) ? null : d;
            }
        }

        // estimatedHours: coerce to number or null
        if (Object.prototype.hasOwnProperty.call(normalizedUpdates, 'estimatedHours')) {
            const n = Number(normalizedUpdates.estimatedHours);
            normalizedUpdates.estimatedHours = Number.isFinite(n) ? n : null;
        }

        // tags: ensure array of strings
        if (Object.prototype.hasOwnProperty.call(normalizedUpdates, 'tags')) {
            const t = normalizedUpdates.tags;
            if (Array.isArray(t)) {
                normalizedUpdates.tags = t.map(String);
            } else if (typeof t === 'string') {
                try {
                    const parsed = JSON.parse(t);
                    normalizedUpdates.tags = Array.isArray(parsed) ? parsed.map(String) : [];
                } catch {
                    normalizedUpdates.tags = [];
                }
            } else if (t == null) {
                normalizedUpdates.tags = [];
            }
        }

        // Prevent accidental overwrite of immutable fields
        delete normalizedUpdates.id;
        delete normalizedUpdates.createdAt;

        // Ensure phase is valid for this meeting. If an invalid phase is provided, auto-heal to a default phase.
        async function getOrCreateDefaultPhase(meetingId: string) {
            const existing = await db
                .select()
                .from(projectPhases)
                .where(eq(projectPhases.meetingId, meetingId))
                .orderBy(projectPhases.order)
                .limit(1);
            if (existing.length > 0) return existing[0];
            const [created] = await db.insert(projectPhases).values({
                name: "Project Planning & Setup",
                order: 1,
                color: "#8B5CF6",
                meetingId,
            }).returning();
            return created;
        }

        async function ensureValidPhase(meetingId: string, requestedPhaseId?: string, currentPhaseId?: string) {
            const candidate = requestedPhaseId ?? currentPhaseId;
            if (candidate) {
                const found = await db
                    .select({ id: projectPhases.id })
                    .from(projectPhases)
                    .where(and(eq(projectPhases.meetingId, meetingId), eq(projectPhases.id, candidate)))
                    .limit(1);
                if (found.length > 0) return candidate;
            }
            const def = await getOrCreateDefaultPhase(meetingId);
            return def.id;
        }

        const finalPhaseId = await ensureValidPhase(existingTask.meetingId, normalizedUpdates.phase, existingTask.phase);
        normalizedUpdates.phase = finalPhaseId;

        // Update the task
        const [updatedTask] = await db
            .update(tasks)
            .set({
                ...normalizedUpdates,
                updatedAt: new Date(),
            })
            .where(eq(tasks.id, id))
            .returning();

        return NextResponse.json({
            success: true,
            task: updatedTask,
        });

    } catch (error) {
        console.error("Error updating task:", error);
        return NextResponse.json(
            { error: "Failed to update task" },
            { status: 500 }
        );
    }
}

// Delete a task
export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const taskId = searchParams.get("taskId");

        if (!taskId) {
            return NextResponse.json(
                { error: "Task ID is required" },
                { status: 400 }
            );
        }

        // Delete subtasks first
        await db.delete(subtasks).where(eq(subtasks.taskId, taskId));

        // Delete the task
        await db.delete(tasks).where(eq(tasks.id, taskId));

        return NextResponse.json({
            success: true,
            message: "Task deleted successfully",
        });

    } catch (error) {
        console.error("Error deleting task:", error);
        return NextResponse.json(
            { error: "Failed to delete task" },
            { status: 500 }
        );
    }
}

// AI function to suggest subtasks
async function getAISubtaskSuggestions(title: string, description?: string): Promise<any[]> {
    try {
        const prompt = `Given this task: "${title}"${description ? ` - ${description}` : ''}, suggest 3-5 logical subtasks that would help break down this work. 
        
        Format as JSON array:
        [
          {
            "title": "Subtask title",
            "description": "Brief description of what needs to be done",
            "estimatedHours": 2
          }
        ]
        
        Keep subtasks specific, actionable, and realistic in scope.`;

        const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/groq-chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: prompt,
                agentId: null, // Use default agent
            }),
        });

        if (!response.ok) {
            return [];
        }

        const data = await response.json();
        
        try {
            return JSON.parse(data.response);
        } catch {
            return [];
        }
    } catch (error) {
        console.error("Error getting AI subtask suggestions:", error);
        return [];
    }
} 