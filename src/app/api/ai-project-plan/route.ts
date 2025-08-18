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

        // Generate AI project plan using Groq with improved prompt
        const aiResponse = await fetch(`${request.nextUrl.origin}/api/groq-chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: `You are an expert project manager. Analyze this meeting transcript and create a detailed, actionable project plan.

MEETING: ${meeting.name}
TRANSCRIPT: ${transcript}

Based on the conversation, create a structured project plan with:

1. PROJECT PHASES: Extract the actual phases mentioned in the conversation (e.g., "Implementation", "Frontend Development", "Backend Development" - use the exact names mentioned)
2. TASKS: Create specific, actionable tasks based on what was discussed
3. ASSIGNMENTS: Suggest team members based on the conversation context
4. TIMELINES: Estimate realistic hours for each task

IMPORTANT: 
- Use ONLY the phases and topics actually mentioned in the conversation
- Create tasks that directly relate to what was discussed
- Make task titles specific and actionable
- Base everything on the actual conversation content

Format your response as a valid JSON object exactly like this:

{
  "phases": [
    {
      "name": "Exact Phase Name from Conversation",
      "order": 1,
      "color": "#3B82F6",
      "tasks": [
        {
          "title": "Specific task title based on conversation",
          "description": "Detailed description of what needs to be done",
          "priority": "high|medium|low",
          "estimatedHours": 8,
          "suggestedAssignee": "Team Member Name",
          "subtasks": [
            {
              "title": "Specific subtask",
              "description": "What this subtask involves"
            }
          ]
        }
      ]
    }
  ],
  "suggestedAssignees": [
    {
      "userName": "Team Member Name",
      "role": "Their role from conversation",
      "confidence": 0.9,
      "reasoning": "Why this person should be assigned based on conversation",
      "currentWorkload": 20,
      "maxWorkload": 40,
      "emotionalState": "positive|neutral|negative",
      "expertise": ["skill1", "skill2"]
    }
  ],
  "workloadAnalysis": {
    "totalTasks": 5,
    "estimatedTotalHours": 40,
    "workloadDistribution": {"Team Member": 20},
    "recommendations": ["Start with frontend foundation", "Prioritize critical features"]
  }
}

Ensure the JSON is valid and all fields are properly filled based on the actual conversation content.`,
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
            
            // Validate the parsed data
            if (!projectPlanData.phases || !Array.isArray(projectPlanData.phases)) {
                throw new Error('Invalid phases data');
            }
            
            // Ensure each phase has a proper name and tasks
            projectPlanData.phases = projectPlanData.phases.map((phase: any, index: number) => ({
                ...phase,
                name: phase.name || `Phase ${index + 1}`,
                order: phase.order || index + 1,
                color: phase.color || "#3B82F6",
                tasks: Array.isArray(phase.tasks) ? phase.tasks : []
            }));
            
        } catch (parseError) {
            console.error('AI response parsing failed:', parseError);
            console.log('Raw AI response:', aiData.response);
            
            // Create a more intelligent fallback based on the transcript content
            projectPlanData = createFallbackPlan(transcript, meeting.name);
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
                        priority: task.priority || "medium",
                        estimatedHours: task.estimatedHours || 4,
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

// Improved fallback plan creation based on transcript content
function createFallbackPlan(transcript: string, meetingName: string) {
    // Extract key information from transcript
    const lowerTranscript = transcript.toLowerCase();
    console.log('Creating fallback plan for transcript:', transcript.substring(0, 200) + '...');
    
    // Detect common project phases from the transcript
    const detectedPhases = [];
    
    if (lowerTranscript.includes('frontend') || lowerTranscript.includes('ui') || lowerTranscript.includes('ux') || lowerTranscript.includes('user interface')) {
        detectedPhases.push({
            name: "Frontend Development",
            order: 1,
            color: "#3B82F6",
            tasks: [
                {
                    title: "Build responsive UI/UX foundation",
                    description: "Create solid UI/UX foundation with focus on responsiveness and accessibility as discussed in meeting",
                    priority: "high",
                    estimatedHours: 16,
                    suggestedAssignee: "Frontend Developer",
                    subtasks: [
                        { title: "Design system setup", description: "Establish design tokens and component library" },
                        { title: "Responsive layout implementation", description: "Implement mobile-first responsive design" },
                        { title: "Accessibility features", description: "Add ARIA labels and keyboard navigation support" },
                        { title: "State management setup", description: "Implement state management library as recommended" }
                    ]
                }
            ]
        });
    }
    
    if (lowerTranscript.includes('backend') || lowerTranscript.includes('api') || lowerTranscript.includes('database') || lowerTranscript.includes('server')) {
        detectedPhases.push({
            name: "Backend Development",
            order: 2,
            color: "#10B981",
            tasks: [
                {
                    title: "Implement robust backend architecture",
                    description: "Develop scalable backend system with authentication and authorization as discussed",
                    priority: "high",
                    estimatedHours: 20,
                    suggestedAssignee: "Backend Developer",
                    subtasks: [
                        { title: "Framework selection and setup", description: "Choose and configure suitable backend framework" },
                        { title: "Database design and implementation", description: "Design and implement robust database schema" },
                        { title: "API development", description: "Build RESTful API endpoints with proper documentation" },
                        { title: "Authentication system", description: "Implement secure user authentication and authorization" },
                        { title: "Scalability planning", description: "Design architecture for future growth and scaling" }
                    ]
                }
            ]
        });
    }
    
    if (lowerTranscript.includes('implementation') || lowerTranscript.includes('deployment') || lowerTranscript.includes('launch') || lowerTranscript.includes('delivery')) {
        detectedPhases.push({
            name: "Implementation & Launch",
            order: 3,
            color: "#F59E0B",
            tasks: [
                {
                    title: "Execute project implementation plan",
                    description: "Coordinate project execution and prepare for successful launch",
                    priority: "medium",
                    estimatedHours: 12,
                    suggestedAssignee: "Project Manager",
                    subtasks: [
                        { title: "Phase coordination", description: "Coordinate between frontend and backend development teams" },
                        { title: "Testing and QA", description: "Conduct thorough testing of all features and functionality" },
                        { title: "Deployment preparation", description: "Prepare production environment and deployment pipeline" },
                        { title: "Quality assurance", description: "Ensure high-quality product delivery as emphasized in meeting" }
                    ]
                }
            ]
        });
    }
    
    // If no specific phases detected, create a general planning phase
    if (detectedPhases.length === 0) {
        detectedPhases.push({
            name: "Project Planning & Setup",
            order: 1,
            color: "#8B5CF6",
            tasks: [
                {
                    title: "Analyze meeting outcomes and create action plan",
                    description: "Review meeting transcript to extract key decisions and create detailed project roadmap",
                    priority: "high",
                    estimatedHours: 6,
                    suggestedAssignee: "Project Lead",
                    subtasks: [
                        { title: "Extract key decisions", description: "Document all decisions and recommendations made during meeting" },
                        { title: "Create detailed task breakdown", description: "Break down project into specific, actionable tasks" },
                        { title: "Assign team responsibilities", description: "Distribute tasks among team members based on expertise" },
                        { title: "Set project milestones", description: "Establish clear milestones and delivery timelines" }
                    ]
                }
            ]
        });
    }

    console.log('Created fallback plan with phases:', detectedPhases);

    return {
        phases: detectedPhases,
        suggestedAssignees: [
            {
                userName: "Development Team",
                role: "Full-Stack Development Team",
                confidence: 0.9,
                reasoning: "Based on meeting discussion about frontend, backend, and implementation phases",
                currentWorkload: 20,
                maxWorkload: 40,
                emotionalState: "positive",
                expertise: ["frontend development", "backend development", "project management", "UI/UX design"]
            }
        ],
        workloadAnalysis: {
            totalTasks: detectedPhases.reduce((sum, phase) => sum + phase.tasks.length, 0),
            estimatedTotalHours: detectedPhases.reduce((sum, phase) => 
                sum + phase.tasks.reduce((taskSum, task) => taskSum + (task.estimatedHours || 0), 0), 0),
            workloadDistribution: {"Development Team": detectedPhases.reduce((sum, phase) => 
                sum + phase.tasks.reduce((taskSum, task) => taskSum + (task.estimatedHours || 0), 0), 0)},
            recommendations: [
                "Start with frontend foundation as it's the user-facing component",
                "Coordinate between frontend and backend teams for seamless integration",
                "Focus on delivering core features first to ensure quality",
                "Prioritize critical features as emphasized in the meeting discussion"
            ]
        }
    };
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

        // Get phases from the projectPhases table (which have proper IDs) instead of JSON
        const phases = await db
            .select()
            .from(projectPhases)
            .where(eq(projectPhases.meetingId, meetingId))
            .orderBy(projectPhases.order);

        return NextResponse.json({
            success: true,
            projectPlan: existingPlan,
            phases: phases,
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