import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { meetings, aiProjectPlans, tasks, subtasks, projectPhases } from "@/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

export async function POST(request: NextRequest) {
    try {
        const { meetingId } = await request.json();

        if (!meetingId) {
            return NextResponse.json(
                { error: "Meeting ID is required" },
                { status: 400 }
            );
        }

        // Get meeting details
        const [meeting] = await db
            .select()
            .from(meetings)
            .where(eq(meetings.id, meetingId));

        if (!meeting) {
            return NextResponse.json(
                { error: "Meeting not found" },
                { status: 404 }
            );
        }

        // Get conversation transcript
        const transcriptResponse = await fetch(`${request.nextUrl.origin}/api/conversation-sync?meetingId=${meetingId}&format=joined`);
        const transcriptData = await transcriptResponse.json();
        const transcript = transcriptData.transcript || "";

        // Generate AI project plan using Groq
        const aiResponse = await fetch(`${request.nextUrl.origin}/api/groq-chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: `Analyze this meeting transcript and create a structured project plan. 
                
                Meeting: ${meeting.name}
                
                Transcript: ${transcript}
                
                Please generate:
                1. Project phases (e.g., Planning, Design, Development, Testing, Launch)
                2. Specific tasks under each phase with descriptions
                3. Suggested assignees based on the conversation
                4. Priority levels and estimated hours for each task
                5. Workload analysis and recommendations
                
                Format the response as a JSON object with this structure:
                {
                  "phases": [
                    {
                      "name": "Phase Name",
                      "order": 1,
                      "color": "#3B82F6",
                      "tasks": [
                        {
                          "title": "Task Title",
                          "description": "Task description",
                          "priority": "high|medium|low",
                          "estimatedHours": 8,
                          "suggestedAssignee": "User Name",
                          "subtasks": [
                            {
                              "title": "Subtask title",
                              "description": "Subtask description"
                            }
                          ]
                        }
                      ]
                    }
                  ],
                  "suggestedAssignees": [
                    {
                      "userName": "User Name",
                      "role": "Role description",
                      "confidence": 0.9,
                      "reasoning": "Why this person should be assigned",
                      "currentWorkload": 20,
                      "maxWorkload": 40,
                      "emotionalState": "positive|neutral|negative",
                      "expertise": ["skill1", "skill2"]
                    }
                  ],
                  "workloadAnalysis": {
                    "totalTasks": 10,
                    "estimatedTotalHours": 80,
                    "workloadDistribution": {"User1": 20, "User2": 30},
                    "recommendations": ["Recommendation 1", "Recommendation 2"]
                  }
                }`,
                agentId: meeting.agentId,
            }),
        });

        if (!aiResponse.ok) {
            throw new Error('Failed to generate AI project plan');
        }

        const aiData = await aiResponse.json();
        let projectPlanData;

        try {
            // Try to parse the AI response as JSON
            projectPlanData = JSON.parse(aiData.response);
        } catch (parseError) {
            // If parsing fails, create a basic structure from the text
            projectPlanData = {
                phases: [
                    {
                        name: "Project Planning",
                        order: 1,
                        color: "#3B82F6",
                        tasks: [
                            {
                                title: "Review meeting outcomes",
                                description: "Analyze meeting transcript and create action items",
                                priority: "high",
                                estimatedHours: 4,
                                suggestedAssignee: "Team Lead",
                                subtasks: [
                                    {
                                        title: "Extract key decisions",
                                        description: "Identify and document key decisions made"
                                    },
                                    {
                                        title: "Create task breakdown",
                                        description: "Break down decisions into actionable tasks"
                                    }
                                ]
                            }
                        ]
                    }
                ],
                suggestedAssignees: [
                    {
                        userName: "Team Lead",
                        role: "Project Manager",
                        confidence: 0.8,
                        reasoning: "Based on meeting discussion and responsibilities",
                        currentWorkload: 20,
                        maxWorkload: 40,
                        emotionalState: "positive",
                        expertise: ["project management", "coordination"]
                    }
                ],
                workloadAnalysis: {
                    totalTasks: 1,
                    estimatedTotalHours: 4,
                    workloadDistribution: {"Team Lead": 4},
                    recommendations: ["Start with high-priority tasks", "Monitor workload distribution"]
                }
            };
        }

        // Save the AI project plan
        const [savedPlan] = await db
            .insert(aiProjectPlans)
            .values({
                id: nanoid(),
                meetingId,
                phases: JSON.stringify(projectPlanData.phases),
                suggestedAssignees: JSON.stringify(projectPlanData.suggestedAssignees),
                workloadAnalysis: JSON.stringify(projectPlanData.workloadAnalysis),
            })
            .returning();

        // Create project phases
        for (const phase of projectPlanData.phases) {
            const [savedPhase] = await db
                .insert(projectPhases)
                .values({
                    id: nanoid(),
                    name: phase.name,
                    order: phase.order,
                    color: phase.color,
                    meetingId,
                })
                .returning();

            // Create tasks for this phase
            for (const task of phase.tasks) {
                const [savedTask] = await db
                    .insert(tasks)
                    .values({
                        id: nanoid(),
                        title: task.title,
                        description: task.description,
                        phase: savedPhase.id,
                        priority: task.priority,
                        estimatedHours: task.estimatedHours,
                        aiGenerated: true,
                        meetingId,
                        tags: [],
                    })
                    .returning();

                // Create subtasks
                for (const subtask of task.subtasks || []) {
                    await db
                        .insert(subtasks)
                        .values({
                            id: nanoid(),
                            taskId: savedTask.id,
                            title: subtask.title,
                            aiGenerated: true,
                        });
                }
            }
        }

        return NextResponse.json({
            success: true,
            projectPlan: savedPlan,
            phases: projectPlanData.phases,
            suggestedAssignees: projectPlanData.suggestedAssignees,
            workloadAnalysis: projectPlanData.workloadAnalysis,
        });

    } catch (error) {
        console.error("Error generating AI project plan:", error);
        return NextResponse.json(
            { error: "Failed to generate AI project plan" },
            { status: 500 }
        );
    }
}

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

        // Get existing AI project plan
        const [existingPlan] = await db
            .select()
            .from(aiProjectPlans)
            .where(eq(aiProjectPlans.meetingId, meetingId));

        if (!existingPlan) {
            return NextResponse.json(
                { error: "No AI project plan found for this meeting" },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            projectPlan: existingPlan,
            phases: JSON.parse(existingPlan.phases),
            suggestedAssignees: JSON.parse(existingPlan.suggestedAssignees),
            workloadAnalysis: JSON.parse(existingPlan.workloadAnalysis),
        });

    } catch (error) {
        console.error("Error fetching AI project plan:", error);
        return NextResponse.json(
            { error: "Failed to fetch AI project plan" },
            { status: 500 }
        );
    }
} 