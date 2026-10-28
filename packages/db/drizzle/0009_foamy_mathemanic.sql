CREATE TYPE "public"."mail_status" AS ENUM('pending', 'sending', 'sent', 'failed');--> statement-breakpoint
CREATE TABLE "mail_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"to_email" text NOT NULL,
	"subject" text NOT NULL,
	"html" text NOT NULL,
	"text" text NOT NULL,
	"template" text NOT NULL,
	"status" "mail_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "scan_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"label" text NOT NULL,
	"kind" text DEFAULT 'basic' NOT NULL,
	"ciphertext" text NOT NULL,
	"key_version" integer DEFAULT 1 NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scan_credentials_kind_check" CHECK ("scan_credentials"."kind" IN ('basic', 'bearer', 'header'))
);
--> statement-breakpoint
ALTER TABLE "findings" ADD COLUMN "owasp_category" text;--> statement-breakpoint
ALTER TABLE "findings" ADD COLUMN "is_new" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "scan_schedules" ADD COLUMN "alert_on_new_critical" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "scans" ADD COLUMN "source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "scans" ADD COLUMN "credential_id" uuid;--> statement-breakpoint
ALTER TABLE "scan_credentials" ADD CONSTRAINT "scan_credentials_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_credentials" ADD CONSTRAINT "scan_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mail_outbox_due_idx" ON "mail_outbox" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "mail_outbox_recipient_idx" ON "mail_outbox" USING btree ("to_email","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "scan_credentials_active_domain_unique" ON "scan_credentials" USING btree ("domain_id") WHERE "scan_credentials"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "scan_credentials_user_idx" ON "scan_credentials" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "scans" ADD CONSTRAINT "scans_credential_id_scan_credentials_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."scan_credentials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scans" ADD CONSTRAINT "scans_source_check" CHECK ("scans"."source" IN ('manual', 'schedule'));