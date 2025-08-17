-- Add task management tables
CREATE TABLE "project_phases" (
    "id" text PRIMARY KEY,
    "name" text NOT NULL,
    "order" integer NOT NULL,
    "color" text NOT NULL DEFAULT '#3B82F6',
    "meeting_id" text NOT NULL REFERENCES "meetings"("id") ON DELETE CASCADE,
    "created_at" timestamp NOT NULL DEFAULT NOW(),
    "updated_at" timestamp NOT NULL DEFAULT NOW()
);

CREATE TABLE "tasks" (
    "id" text PRIMARY KEY,
    "title" text NOT NULL,
    "description" text,
    "phase" text NOT NULL,
    "status" text NOT NULL DEFAULT 'todo',
    "assignee" text,
    "assignee_id" text REFERENCES "user"("id") ON DELETE SET NULL,
    "priority" text NOT NULL DEFAULT 'medium',
    "estimated_hours" integer,
    "due_date" timestamp,
    "ai_generated" boolean NOT NULL DEFAULT false,
    "meeting_id" text NOT NULL REFERENCES "meetings"("id") ON DELETE CASCADE,
    "tags" text[],
    "created_at" timestamp NOT NULL DEFAULT NOW(),
    "updated_at" timestamp NOT NULL DEFAULT NOW()
);

CREATE TABLE "subtasks" (
    "id" text PRIMARY KEY,
    "task_id" text NOT NULL REFERENCES "tasks"("id") ON DELETE CASCADE,
    "title" text NOT NULL,
    "completed" boolean NOT NULL DEFAULT false,
    "ai_generated" boolean NOT NULL DEFAULT false,
    "created_at" timestamp NOT NULL DEFAULT NOW(),
    "updated_at" timestamp NOT NULL DEFAULT NOW()
);

CREATE TABLE "ai_project_plans" (
    "id" text PRIMARY KEY,
    "meeting_id" text NOT NULL REFERENCES "meetings"("id") ON DELETE CASCADE,
    "phases" text NOT NULL,
    "suggested_assignees" text NOT NULL,
    "workload_analysis" text NOT NULL,
    "created_at" timestamp NOT NULL DEFAULT NOW(),
    "updated_at" timestamp NOT NULL DEFAULT NOW()
);

-- Add indexes for better performance
CREATE INDEX "idx_project_phases_meeting_id" ON "project_phases"("meeting_id");
CREATE INDEX "idx_tasks_meeting_id" ON "tasks"("meeting_id");
CREATE INDEX "idx_tasks_phase" ON "tasks"("phase");
CREATE INDEX "idx_tasks_status" ON "tasks"("status");
CREATE INDEX "idx_subtasks_task_id" ON "subtasks"("task_id");
CREATE INDEX "idx_ai_project_plans_meeting_id" ON "ai_project_plans"("meeting_id"); 