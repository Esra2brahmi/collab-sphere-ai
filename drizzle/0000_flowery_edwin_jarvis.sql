-- Minimal migration: only create meeting_participants and its FKs
CREATE TABLE "meeting_participants" (
	"id" text PRIMARY KEY NOT NULL,
	"meeting_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text,
	"joined_at" timestamp DEFAULT now(),
	"left_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint