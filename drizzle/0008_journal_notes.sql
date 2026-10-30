CREATE TABLE "journal_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"treatment_id" uuid NOT NULL,
	"note_date" date NOT NULL,
	"body_enc" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "journal_notes" ADD CONSTRAINT "journal_notes_treatment_id_treatments_id_fk" FOREIGN KEY ("treatment_id") REFERENCES "public"."treatments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_notes" ADD CONSTRAINT "journal_notes_patient_fk" FOREIGN KEY ("patient_id","clinic_id") REFERENCES "public"."patients"("id","clinic_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "journal_notes_treatment_date_uq" ON "journal_notes" USING btree ("treatment_id","note_date");