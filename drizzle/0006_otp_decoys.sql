-- Login codes live 5 minutes; clear them so the new NOT NULL columns need no backfill.
DELETE FROM "otp_challenges";--> statement-breakpoint
ALTER TABLE "otp_challenges" DROP CONSTRAINT "otp_challenges_patient_id_patients_id_fk";
--> statement-breakpoint
DROP INDEX "otp_challenges_patient_created_idx";--> statement-breakpoint
ALTER TABLE "otp_challenges" ALTER COLUMN "patient_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "otp_challenges" ADD COLUMN "clinic_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "otp_challenges" ADD COLUMN "subject_key" text NOT NULL;--> statement-breakpoint
ALTER TABLE "otp_challenges" ADD CONSTRAINT "otp_challenges_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "otp_challenges" ADD CONSTRAINT "otp_challenges_patient_clinic_fk" FOREIGN KEY ("patient_id","clinic_id") REFERENCES "public"."patients"("id","clinic_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "otp_challenges_subject_created_idx" ON "otp_challenges" USING btree ("clinic_id","subject_key","created_at");--> statement-breakpoint
CREATE INDEX "otp_challenges_created_idx" ON "otp_challenges" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "rate_limit_buckets_window_idx" ON "rate_limit_buckets" USING btree ("window_start");