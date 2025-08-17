import { pgTable, text, timestamp, boolean, integer, pgEnum } from "drizzle-orm/pg-core";
import {nanoid} from "nanoid";

export const user = pgTable("user", {
		id: text('id').primaryKey(),
		name: text('name').notNull(),
    email: text('email').notNull().unique(),
    emailVerified: boolean('email_verified').$defaultFn(() => false).notNull(),
    image: text('image'),
    createdAt: timestamp('created_at').$defaultFn(() => /* @__PURE__ */ new Date()).notNull(),
    updatedAt: timestamp('updated_at').$defaultFn(() => /* @__PURE__ */ new Date()).notNull()
});

export const session = pgTable("session", {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at').notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id').notNull().references(()=> user.id, { onDelete: 'cascade' })
});

export const account = pgTable("account", {
		id: text('id').primaryKey(),
		accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id').notNull().references(()=> user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull()
});

export const verification = pgTable("verification", {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').$defaultFn(() => /* @__PURE__ */ new Date()),
    updatedAt: timestamp('updated_at').$defaultFn(() => /* @__PURE__ */ new Date())
});

export const agents =pgTable("agents",{
    id: text("id")
     .primaryKey()
     .$defaultFn(() => nanoid()),
    name: text("name").notNull(),
    userId: text("user_id")
       .notNull()
       .references(()=>user.id,{onDelete:"cascade"}),
    instructions:text("instructions").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),

});

export const meetingStatus = pgEnum ("meeting_status",[
    "upcoming",
    "active",
    "completed",
    "processing",
    "cancelled",
]);

export const meetings =pgTable("meetings",{
    id: text("id")
     .primaryKey()
     .$defaultFn(() => nanoid()),
    name: text("name").notNull(),
    userId: text("user_id")
       .notNull()
       .references(()=>user.id,{onDelete:"cascade"}),
    agentId: text("agent_id")
        .notNull()
        .references(()=>agents.id,{onDelete:"cascade"}),
    status: meetingStatus("status").notNull().default("upcoming"),
    startedAt: timestamp("started_at"),
    endedAt: timestamp("ended_at"),
    transcriptUrl: text("transcript_url"),
    recordingUrl: text("recording_url"),
    summary: text("summary"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),

});

// Meeting participants table (for multi-user access control)
export const meetingParticipants = pgTable("meeting_participants", {
    id: text("id").primaryKey().$defaultFn(() => nanoid()),
    meetingId: text("meeting_id").notNull().references(() => meetings.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    role: text("role"),
    joinedAt: timestamp("joined_at").defaultNow(),
    leftAt: timestamp("left_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Conversation chunks captured per meeting, merged later for summary/insights
export const conversationChunks = pgTable("conversation_chunks", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  meetingId: text("meeting_id").notNull().references(() => meetings.id, { onDelete: "cascade" }),
  speaker: text("speaker").notNull(), // 'user' | 'ai'
  userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
  userName: text("user_name"),
  text: text("text").notNull(),
  ts: timestamp("ts").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Project phases for task management
export const projectPhases = pgTable("project_phases", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  name: text("name").notNull(),
  order: integer("order").notNull(),
  color: text("color").notNull().default("#3B82F6"),
  meetingId: text("meeting_id").notNull().references(() => meetings.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Tasks for project management
export const tasks = pgTable("tasks", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  title: text("title").notNull(),
  description: text("description"),
  phase: text("phase").notNull(),
  status: text("status").notNull().default("todo"), // 'todo' | 'in-progress' | 'done'
  assignee: text("assignee"),
  assigneeId: text("assignee_id").references(() => user.id, { onDelete: "set null" }),
  priority: text("priority").notNull().default("medium"), // 'low' | 'medium' | 'high'
  estimatedHours: integer("estimated_hours"),
  dueDate: timestamp("due_date"),
  aiGenerated: boolean("ai_generated").notNull().default(false),
  meetingId: text("meeting_id").notNull().references(() => meetings.id, { onDelete: "cascade" }),
  tags: text("tags").array(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Subtasks for detailed task breakdown
export const subtasks = pgTable("subtasks", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  taskId: text("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  completed: boolean("completed").notNull().default(false),
  aiGenerated: boolean("ai_generated").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// AI-generated project plans
export const aiProjectPlans = pgTable("ai_project_plans", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  meetingId: text("meeting_id").notNull().references(() => meetings.id, { onDelete: "cascade" }),
  phases: text("phases").notNull(), // JSON string of ProjectPhase[]
  suggestedAssignees: text("suggested_assignees").notNull(), // JSON string of SuggestedAssignee[]
  workloadAnalysis: text("workload_analysis").notNull(), // JSON string of WorkloadAnalysis
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
