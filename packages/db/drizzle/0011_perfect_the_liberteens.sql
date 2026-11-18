ALTER TABLE "scans" ADD COLUMN "is_demo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "scans" ADD COLUMN "scan_mode" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "scans" ADD COLUMN "severity_catalog_version" text DEFAULT '1.0' NOT NULL;--> statement-breakpoint
ALTER TABLE "scans" ADD CONSTRAINT "scans_scan_mode_check" CHECK ("scans"."scan_mode" IN ('passive', 'active'));