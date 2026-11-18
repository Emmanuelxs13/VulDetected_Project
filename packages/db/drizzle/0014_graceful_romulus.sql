CREATE TYPE "public"."checkout_status" AS ENUM('pending', 'paid', 'declined');--> statement-breakpoint
CREATE TYPE "public"."payment_event_outcome" AS ENUM('applied', 'duplicate', 'stale', 'ignored');--> statement-breakpoint
CREATE TABLE "checkout_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plan" "subscription_plan" NOT NULL,
	"status" "checkout_status" DEFAULT 'pending' NOT NULL,
	"provider" text NOT NULL,
	"amount_cents" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"event_id" text NOT NULL,
	"type" text NOT NULL,
	"outcome" "payment_event_outcome" NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "subscription_provider" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "subscription_last_event_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "subscription_period_end" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "subscription_cancel_at_period_end" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "checkout_sessions_user_idx" ON "checkout_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_events_provider_event_unique" ON "payment_events" USING btree ("provider","event_id");