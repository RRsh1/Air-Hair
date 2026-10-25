CREATE TABLE "patient_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" text,
	"user_agent" text,
	CONSTRAINT "patient_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "rate_limit_buckets" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"window_start" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clinics" ADD COLUMN "slug" text;--> statement-breakpoint
-- Backfill existing clinics: the first gets "demo", any others a slug from their id.
UPDATE "clinics" SET "slug" = CASE WHEN "id" = (SELECT "id" FROM "clinics" ORDER BY "created_at" LIMIT 1) THEN 'demo' ELSE 'clinic-' || substr("id"::text, 1, 8) END WHERE "slug" IS NULL;--> statement-breakpoint
ALTER TABLE "clinics" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "patient_sessions" ADD CONSTRAINT "patient_sessions_patient_fk" FOREIGN KEY ("patient_id","clinic_id") REFERENCES "public"."patients"("id","clinic_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "patient_sessions_patient_idx" ON "patient_sessions" USING btree ("patient_id");--> statement-breakpoint
CREATE UNIQUE INDEX "clinics_slug_uq" ON "clinics" USING btree ("slug");--> statement-breakpoint
ALTER TABLE "clinics" ADD CONSTRAINT "clinics_slug_ck" CHECK ("clinics"."slug" ~ '^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$');