CREATE TYPE "public"."scan_status" AS ENUM('queued', 'running', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."severity" AS ENUM('unclassified', 'info', 'low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TABLE "domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"hostname" text NOT NULL,
	"normalized_hostname" text NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"verification_method" text,
	"verification_record" text,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "domains_normalized_hostname_key" UNIQUE("normalized_hostname"),
	CONSTRAINT "domains_verification_method_check" CHECK ("domains"."verification_method" IN ('dns_txt', 'well_known'))
);
--> statement-breakpoint
CREATE TABLE "findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scan_id" uuid NOT NULL,
	"finding_key" text NOT NULL,
	"severity" "severity" DEFAULT 'unclassified' NOT NULL,
	"check_name" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"affected_url" text NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scan_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "scan_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"scan_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scan_events_scan_seq_unique" UNIQUE("scan_id","seq")
);
--> statement-breakpoint
CREATE TABLE "scans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain_id" uuid NOT NULL,
	"target_url" text NOT NULL,
	"status" "scan_status" DEFAULT 'queued' NOT NULL,
	"checks" jsonb DEFAULT '["security_headers","tls","cookies","redirects"]'::jsonb NOT NULL,
	"celery_task_id" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "domains" ADD CONSTRAINT "domains_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_events" ADD CONSTRAINT "scan_events_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scans" ADD CONSTRAINT "scans_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "domains_user_id_idx" ON "domains" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "findings_scan_key_unique" ON "findings" USING btree ("scan_id","finding_key");--> statement-breakpoint
CREATE INDEX "findings_key_idx" ON "findings" USING btree ("finding_key");--> statement-breakpoint
CREATE INDEX "scan_events_poll_idx" ON "scan_events" USING btree ("scan_id","id");--> statement-breakpoint
CREATE INDEX "scan_events_created_at_idx" ON "scan_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "scans_domain_created_idx" ON "scans" USING btree ("domain_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "scans_status_idx" ON "scans" USING btree ("status");