-- Platform foundation: branches, the procedure catalog, and the treatment lifecycle
-- (completed / cancelled, one active treatment per procedure, so a returning patient opens a new one).
-- Hand-edited from drizzle-kit output: backfills, catalog seed, a type swap instead of ADD VALUE
-- (new enum values can't be used in the same transaction), and unique indexes before the
-- composite foreign keys that need them.

CREATE TYPE "public"."vertical" AS ENUM('hair', 'dental', 'wound');--> statement-breakpoint

-- ─── Treatment status: scheduled | performed | completed | cancelled ──────────
ALTER TABLE "treatments" DROP CONSTRAINT "treatments_performed_ck";--> statement-breakpoint
ALTER TYPE "public"."treatment_status" RENAME TO "treatment_status_old";--> statement-breakpoint
CREATE TYPE "public"."treatment_status" AS ENUM('scheduled', 'performed', 'completed', 'cancelled');--> statement-breakpoint
ALTER TABLE "treatments" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "treatments" ALTER COLUMN "status" TYPE "public"."treatment_status" USING "status"::text::"public"."treatment_status";--> statement-breakpoint
ALTER TABLE "treatments" ALTER COLUMN "status" SET DEFAULT 'scheduled';--> statement-breakpoint
DROP TYPE "public"."treatment_status_old";--> statement-breakpoint

-- ─── Branches ─────────────────────────────────────────────────────────────────
CREATE TABLE "branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_main" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "branches_main_active_ck" CHECK (not ("branches"."is_main" and "branches"."archived_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "branches_id_clinic_uq" ON "branches" USING btree ("id","clinic_id");--> statement-breakpoint
CREATE UNIQUE INDEX "branches_one_main_uq" ON "branches" USING btree ("clinic_id") WHERE "branches"."is_main";--> statement-breakpoint
-- Every existing clinic gets its main branch.
INSERT INTO "branches" ("clinic_id", "name", "is_main") SELECT "id", 'סניף ראשי', true FROM "clinics";--> statement-breakpoint

-- ─── Staff branch assignments ─────────────────────────────────────────────────
ALTER TABLE "staff_users" ADD COLUMN "all_branches" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE TABLE "staff_branches" (
	"clinic_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_branches_staff_id_branch_id_pk" PRIMARY KEY("staff_id","branch_id")
);
--> statement-breakpoint
ALTER TABLE "staff_branches" ADD CONSTRAINT "staff_branches_staff_fk" FOREIGN KEY ("staff_id","clinic_id") REFERENCES "public"."staff_users"("id","clinic_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_branches" ADD CONSTRAINT "staff_branches_branch_fk" FOREIGN KEY ("branch_id","clinic_id") REFERENCES "public"."branches"("id","clinic_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "staff_branches_branch_idx" ON "staff_branches" USING btree ("branch_id");--> statement-breakpoint

-- ─── Procedure catalog ────────────────────────────────────────────────────────
CREATE TABLE "procedure_library" (
	"key" text PRIMARY KEY NOT NULL,
	"vertical" "vertical" NOT NULL,
	"name_he" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "procedure_library_key_ck" CHECK ("procedure_library"."key" ~ '^[a-z]+\.[a-z_]+$')
);
--> statement-breakpoint
INSERT INTO "procedure_library" ("key", "vertical", "name_he", "sort_order") VALUES
	('hair.scalp', 'hair', 'השתלת שיער', 0),
	('hair.beard', 'hair', 'השתלת זקן', 1),
	('hair.mustache', 'hair', 'השתלת שפם', 2),
	('hair.eyebrows', 'hair', 'השתלת גבות', 3);--> statement-breakpoint
ALTER TABLE "timeline_templates" ADD COLUMN "library_key" text;--> statement-breakpoint
ALTER TABLE "timeline_templates" ADD CONSTRAINT "timeline_templates_library_key_procedure_library_key_fk" FOREIGN KEY ("library_key") REFERENCES "public"."procedure_library"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Until now every clinic had one hair transplant protocol.
UPDATE "timeline_templates" SET "library_key" = 'hair.scalp';--> statement-breakpoint

-- ─── Treatments: branch and lifecycle ─────────────────────────────────────────
ALTER TABLE "treatments" ADD COLUMN "branch_id" uuid;--> statement-breakpoint
UPDATE "treatments" SET "branch_id" = "branches"."id" FROM "branches" WHERE "branches"."clinic_id" = "treatments"."clinic_id" AND "branches"."is_main";--> statement-breakpoint
ALTER TABLE "treatments" ALTER COLUMN "branch_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "treatments" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "treatments" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "treatments" ADD CONSTRAINT "treatments_branch_fk" FOREIGN KEY ("branch_id","clinic_id") REFERENCES "public"."branches"("id","clinic_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "treatments_branch_status_idx" ON "treatments" USING btree ("branch_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "treatments_one_active_per_procedure_uq" ON "treatments" USING btree ("patient_id","template_id") WHERE "treatments"."status" in ('scheduled', 'performed');--> statement-breakpoint
ALTER TABLE "treatments" ADD CONSTRAINT "treatments_status_ck" CHECK (("treatments"."status" = 'scheduled' and "treatments"."actual_surgery_date" is null and "treatments"."completed_at" is null and "treatments"."cancelled_at" is null)
       or ("treatments"."status" = 'performed' and "treatments"."actual_surgery_date" is not null and "treatments"."completed_at" is null and "treatments"."cancelled_at" is null)
       or ("treatments"."status" = 'completed' and "treatments"."actual_surgery_date" is not null and "treatments"."completed_at" is not null and "treatments"."cancelled_at" is null)
       or ("treatments"."status" = 'cancelled' and "treatments"."cancelled_at" is not null and "treatments"."completed_at" is null));
