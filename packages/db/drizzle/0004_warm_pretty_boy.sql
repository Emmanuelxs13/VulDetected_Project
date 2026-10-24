CREATE TABLE "scan_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"interval" text DEFAULT 'daily' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_run_at" timestamp with time zone,
	"next_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scan_schedules" ADD CONSTRAINT "scan_schedules_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_schedules" ADD CONSTRAINT "scan_schedules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scan_schedules_domain_idx" ON "scan_schedules" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "scan_schedules_user_idx" ON "scan_schedules" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "scan_schedules_next_run_idx" ON "scan_schedules" USING btree ("next_run_at");