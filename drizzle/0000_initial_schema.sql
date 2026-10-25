CREATE TYPE "public"."actor_kind" AS ENUM('staff', 'patient', 'system');--> statement-breakpoint
CREATE TYPE "public"."asset_kind" AS ENUM('logo', 'background', 'document', 'signature');--> statement-breakpoint
CREATE TYPE "public"."content_type" AS ENUM('tip', 'recommendation', 'instruction');--> statement-breakpoint
CREATE TYPE "public"."legal_document_format" AS ENUM('file', 'text');--> statement-breakpoint
CREATE TYPE "public"."legal_document_kind" AS ENUM('privacy_policy', 'consent');--> statement-breakpoint
CREATE TYPE "public"."photo_angle" AS ENUM('front', 'top', 'back');--> statement-breakpoint
CREATE TYPE "public"."publish_status" AS ENUM('draft', 'published', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."timeline_phase" AS ENUM('pre_op', 'post_op');--> statement-breakpoint
CREATE TYPE "public"."treatment_status" AS ENUM('scheduled', 'performed');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"clinic_id" uuid NOT NULL,
	"actor_kind" "actor_kind" NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"patient_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "capture_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"phase" timeline_phase NOT NULL,
	"from_day" integer,
	"to_day" integer,
	"every_days" integer,
	"max_count" integer,
	"angles" "photo_angle"[] NOT NULL,
	CONSTRAINT "capture_rules_shape_ck" CHECK (("capture_rules"."phase" = 'pre_op' and "capture_rules"."max_count" >= 1)
       or ("capture_rules"."phase" = 'post_op' and "capture_rules"."from_day" >= 0 and "capture_rules"."to_day" >= "capture_rules"."from_day" and "capture_rules"."every_days" >= 1))
);
--> statement-breakpoint
CREATE TABLE "clinic_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"kind" "asset_kind" NOT NULL,
	"storage_key" text NOT NULL,
	"content_type" text NOT NULL,
	"bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clinic_settings" (
	"clinic_id" uuid PRIMARY KEY NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "clinic_themes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"status" "publish_status" DEFAULT 'draft' NOT NULL,
	"version" integer NOT NULL,
	"tokens" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "clinics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"time_zone" text DEFAULT 'Asia/Jerusalem' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"content_hash" text NOT NULL,
	"signature_storage_key" text NOT NULL,
	"signed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" text,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"treatment_id" uuid NOT NULL,
	"phase" timeline_phase NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "legal_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"kind" "legal_document_kind" NOT NULL,
	"version" integer NOT NULL,
	"format" "legal_document_format" NOT NULL,
	"storage_key" text,
	"body_text" text,
	"content_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	CONSTRAINT "legal_documents_format_ck" CHECK (("legal_documents"."format" = 'file' and "legal_documents"."storage_key" is not null) or ("legal_documents"."format" = 'text' and "legal_documents"."body_text" is not null))
);
--> statement-breakpoint
CREATE TABLE "otp_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"consumed_at" timestamp with time zone,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patient_assignments" (
	"patient_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "patient_assignments_patient_id_staff_id_pk" PRIMARY KEY("patient_id","staff_id")
);
--> statement-breakpoint
CREATE TABLE "patients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"full_name_enc" text NOT NULL,
	"national_id_enc" text NOT NULL,
	"national_id_idx" text NOT NULL,
	"phone_enc" text NOT NULL,
	"phone_idx" text NOT NULL,
	"key_version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"angle" "photo_angle" NOT NULL,
	"storage_key" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "photos_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "role_capabilities" (
	"role_id" uuid NOT NULL,
	"capability" text NOT NULL,
	CONSTRAINT "role_capabilities_role_id_capability_pk" PRIMARY KEY("role_id","capability")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"name" text NOT NULL,
	"system_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_system_key_ck" CHECK ("roles"."system_key" is null or "roles"."system_key" in ('admin', 'doctor'))
);
--> statement-breakpoint
CREATE TABLE "staff_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"auth_user_id" text,
	"email" text NOT NULL,
	"full_name" text NOT NULL,
	"totp_secret_enc" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"disabled_at" timestamp with time zone,
	CONSTRAINT "staff_users_auth_user_id_unique" UNIQUE("auth_user_id")
);
--> statement-breakpoint
CREATE TABLE "timeline_content" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"phase" timeline_phase NOT NULL,
	"from_day" integer,
	"to_day" integer,
	"content_type" "content_type" NOT NULL,
	"title" text NOT NULL,
	"body" jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "timeline_phases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"phase" timeline_phase NOT NULL,
	"from_day" integer,
	"to_day" integer,
	"name" text NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "timeline_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"name" text NOT NULL,
	"technique" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "timeline_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" "publish_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"published_by" uuid
);
--> statement-breakpoint
CREATE TABLE "treatments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"status" "treatment_status" DEFAULT 'scheduled' NOT NULL,
	"planned_surgery_date" date NOT NULL,
	"actual_surgery_date" date,
	"performed_marked_at" timestamp with time zone,
	"performed_marked_by" uuid,
	"template_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "treatments_performed_ck" CHECK (("treatments"."status" = 'scheduled' and "treatments"."actual_surgery_date" is null)
       or ("treatments"."status" = 'performed' and "treatments"."actual_surgery_date" is not null))
);
--> statement-breakpoint
ALTER TABLE "capture_rules" ADD CONSTRAINT "capture_rules_version_id_timeline_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."timeline_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_assets" ADD CONSTRAINT "clinic_assets_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_settings" ADD CONSTRAINT "clinic_settings_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_themes" ADD CONSTRAINT "clinic_themes_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_document_id_legal_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."legal_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_treatment_id_treatments_id_fk" FOREIGN KEY ("treatment_id") REFERENCES "public"."treatments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_documents" ADD CONSTRAINT "legal_documents_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "otp_challenges" ADD CONSTRAINT "otp_challenges_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_assignments" ADD CONSTRAINT "patient_assignments_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_assignments" ADD CONSTRAINT "patient_assignments_staff_id_staff_users_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patients" ADD CONSTRAINT "patients_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patients" ADD CONSTRAINT "patients_created_by_staff_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."staff_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_entry_id_journal_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_capabilities" ADD CONSTRAINT "role_capabilities_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_users" ADD CONSTRAINT "staff_users_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_users" ADD CONSTRAINT "staff_users_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeline_content" ADD CONSTRAINT "timeline_content_version_id_timeline_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."timeline_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeline_phases" ADD CONSTRAINT "timeline_phases_version_id_timeline_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."timeline_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeline_templates" ADD CONSTRAINT "timeline_templates_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeline_versions" ADD CONSTRAINT "timeline_versions_template_id_timeline_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."timeline_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeline_versions" ADD CONSTRAINT "timeline_versions_published_by_staff_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."staff_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treatments" ADD CONSTRAINT "treatments_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treatments" ADD CONSTRAINT "treatments_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treatments" ADD CONSTRAINT "treatments_performed_marked_by_staff_users_id_fk" FOREIGN KEY ("performed_marked_by") REFERENCES "public"."staff_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treatments" ADD CONSTRAINT "treatments_template_id_timeline_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."timeline_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treatments" ADD CONSTRAINT "treatments_version_id_timeline_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."timeline_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_clinic_created_idx" ON "audit_log" USING btree ("clinic_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_patient_idx" ON "audit_log" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "capture_rules_version_idx" ON "capture_rules" USING btree ("version_id");--> statement-breakpoint
CREATE INDEX "clinic_assets_clinic_kind_idx" ON "clinic_assets" USING btree ("clinic_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "clinic_themes_clinic_version_uq" ON "clinic_themes" USING btree ("clinic_id","version");--> statement-breakpoint
CREATE INDEX "consents_patient_idx" ON "consents" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "journal_entries_treatment_captured_idx" ON "journal_entries" USING btree ("treatment_id","captured_at");--> statement-breakpoint
CREATE UNIQUE INDEX "legal_documents_clinic_kind_version_uq" ON "legal_documents" USING btree ("clinic_id","kind","version");--> statement-breakpoint
CREATE INDEX "otp_challenges_patient_created_idx" ON "otp_challenges" USING btree ("patient_id","created_at");--> statement-breakpoint
CREATE INDEX "patient_assignments_staff_idx" ON "patient_assignments" USING btree ("staff_id");--> statement-breakpoint
CREATE UNIQUE INDEX "patients_clinic_national_id_uq" ON "patients" USING btree ("clinic_id","national_id_idx");--> statement-breakpoint
CREATE INDEX "patients_login_idx" ON "patients" USING btree ("national_id_idx","phone_idx");--> statement-breakpoint
CREATE UNIQUE INDEX "photos_entry_angle_uq" ON "photos" USING btree ("entry_id","angle");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_clinic_name_uq" ON "roles" USING btree ("clinic_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_clinic_system_key_uq" ON "roles" USING btree ("clinic_id","system_key");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_users_clinic_email_uq" ON "staff_users" USING btree ("clinic_id",lower("email"));--> statement-breakpoint
CREATE INDEX "timeline_content_version_idx" ON "timeline_content" USING btree ("version_id");--> statement-breakpoint
CREATE INDEX "timeline_phases_version_idx" ON "timeline_phases" USING btree ("version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "timeline_versions_template_version_uq" ON "timeline_versions" USING btree ("template_id","version");--> statement-breakpoint
CREATE INDEX "treatments_patient_idx" ON "treatments" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "treatments_clinic_status_idx" ON "treatments" USING btree ("clinic_id","status");