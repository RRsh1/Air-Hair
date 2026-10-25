ALTER TABLE "capture_rules" DROP CONSTRAINT "capture_rules_shape_ck";--> statement-breakpoint
ALTER TABLE "consents" DROP CONSTRAINT "consents_patient_id_patients_id_fk";--> statement-breakpoint
ALTER TABLE "consents" DROP CONSTRAINT "consents_document_id_legal_documents_id_fk";--> statement-breakpoint
ALTER TABLE "patient_assignments" DROP CONSTRAINT "patient_assignments_patient_id_patients_id_fk";--> statement-breakpoint
ALTER TABLE "patient_assignments" DROP CONSTRAINT "patient_assignments_staff_id_staff_users_id_fk";--> statement-breakpoint
ALTER TABLE "staff_users" DROP CONSTRAINT "staff_users_role_id_roles_id_fk";--> statement-breakpoint
ALTER TABLE "treatments" DROP CONSTRAINT "treatments_patient_id_patients_id_fk";--> statement-breakpoint
ALTER TABLE "treatments" DROP CONSTRAINT "treatments_template_id_timeline_templates_id_fk";--> statement-breakpoint
ALTER TABLE "treatments" DROP CONSTRAINT "treatments_version_id_timeline_versions_id_fk";--> statement-breakpoint
DROP INDEX "patients_login_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "legal_documents_id_clinic_uq" ON "legal_documents" USING btree ("id","clinic_id");--> statement-breakpoint
CREATE UNIQUE INDEX "patients_id_clinic_uq" ON "patients" USING btree ("id","clinic_id");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_id_clinic_uq" ON "roles" USING btree ("id","clinic_id");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_users_id_clinic_uq" ON "staff_users" USING btree ("id","clinic_id");--> statement-breakpoint
CREATE UNIQUE INDEX "timeline_templates_id_clinic_uq" ON "timeline_templates" USING btree ("id","clinic_id");--> statement-breakpoint
CREATE UNIQUE INDEX "timeline_versions_id_template_uq" ON "timeline_versions" USING btree ("id","template_id");--> statement-breakpoint
ALTER TABLE "consents" ADD COLUMN "clinic_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "patient_assignments" ADD COLUMN "clinic_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_patient_fk" FOREIGN KEY ("patient_id","clinic_id") REFERENCES "public"."patients"("id","clinic_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_document_fk" FOREIGN KEY ("document_id","clinic_id") REFERENCES "public"."legal_documents"("id","clinic_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_assignments" ADD CONSTRAINT "patient_assignments_patient_fk" FOREIGN KEY ("patient_id","clinic_id") REFERENCES "public"."patients"("id","clinic_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_assignments" ADD CONSTRAINT "patient_assignments_staff_fk" FOREIGN KEY ("staff_id","clinic_id") REFERENCES "public"."staff_users"("id","clinic_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_users" ADD CONSTRAINT "staff_users_role_fk" FOREIGN KEY ("role_id","clinic_id") REFERENCES "public"."roles"("id","clinic_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treatments" ADD CONSTRAINT "treatments_patient_fk" FOREIGN KEY ("patient_id","clinic_id") REFERENCES "public"."patients"("id","clinic_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treatments" ADD CONSTRAINT "treatments_template_fk" FOREIGN KEY ("template_id","clinic_id") REFERENCES "public"."timeline_templates"("id","clinic_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treatments" ADD CONSTRAINT "treatments_version_fk" FOREIGN KEY ("version_id","template_id") REFERENCES "public"."timeline_versions"("id","template_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "clinic_themes_one_published_uq" ON "clinic_themes" USING btree ("clinic_id") WHERE "clinic_themes"."status" = 'published';--> statement-breakpoint
CREATE UNIQUE INDEX "clinic_themes_one_draft_uq" ON "clinic_themes" USING btree ("clinic_id") WHERE "clinic_themes"."status" = 'draft';--> statement-breakpoint
CREATE UNIQUE INDEX "timeline_versions_one_published_uq" ON "timeline_versions" USING btree ("template_id") WHERE "timeline_versions"."status" = 'published';--> statement-breakpoint
CREATE UNIQUE INDEX "timeline_versions_one_draft_uq" ON "timeline_versions" USING btree ("template_id") WHERE "timeline_versions"."status" = 'draft';--> statement-breakpoint
CREATE INDEX "patients_login_idx" ON "patients" USING btree ("clinic_id","national_id_idx","phone_idx");--> statement-breakpoint
ALTER TABLE "capture_rules" ADD CONSTRAINT "capture_rules_shape_ck" CHECK (("capture_rules"."phase" = 'pre_op' and "capture_rules"."max_count" is not null and "capture_rules"."max_count" >= 1
            and "capture_rules"."from_day" is null and "capture_rules"."to_day" is null and "capture_rules"."every_days" is null)
       or ("capture_rules"."phase" = 'post_op' and "capture_rules"."max_count" is null
            and "capture_rules"."from_day" is not null and "capture_rules"."to_day" is not null and "capture_rules"."every_days" is not null
            and "capture_rules"."from_day" >= 0 and "capture_rules"."to_day" >= "capture_rules"."from_day" and "capture_rules"."every_days" >= 1));--> statement-breakpoint
ALTER TABLE "role_capabilities" ADD CONSTRAINT "role_capabilities_known_ck" CHECK ("role_capabilities"."capability" in ('patient.view', 'patient.view_all', 'patient.create', 'patient.edit', 'patient.delete', 'patient.assign', 'treatment.mark_performed', 'timeline.edit', 'settings.manage', 'branding.manage', 'legal.manage', 'staff.manage', 'audit.view'));
