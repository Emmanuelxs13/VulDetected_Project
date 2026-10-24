CREATE TYPE "public"."finding_status" AS ENUM('open', 'false_positive', 'resolved');--> statement-breakpoint
ALTER TABLE "findings" ADD COLUMN "status" "finding_status" DEFAULT 'open' NOT NULL;