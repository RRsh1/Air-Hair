DROP INDEX "clinic_themes_one_published_uq";--> statement-breakpoint
DROP INDEX "clinic_themes_one_draft_uq";--> statement-breakpoint
ALTER TABLE "clinic_assets" ADD COLUMN "branch_id" uuid;--> statement-breakpoint
ALTER TABLE "clinic_themes" ADD COLUMN "branch_id" uuid;--> statement-breakpoint
ALTER TABLE "clinic_assets" ADD CONSTRAINT "clinic_assets_branch_fk" FOREIGN KEY ("branch_id","clinic_id") REFERENCES "public"."branches"("id","clinic_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_themes" ADD CONSTRAINT "clinic_themes_branch_fk" FOREIGN KEY ("branch_id","clinic_id") REFERENCES "public"."branches"("id","clinic_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "clinic_themes_branch_published_uq" ON "clinic_themes" USING btree ("branch_id") WHERE "clinic_themes"."status" = 'published' and "clinic_themes"."branch_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "clinic_themes_branch_draft_uq" ON "clinic_themes" USING btree ("branch_id") WHERE "clinic_themes"."status" = 'draft' and "clinic_themes"."branch_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "clinic_themes_one_published_uq" ON "clinic_themes" USING btree ("clinic_id") WHERE "clinic_themes"."status" = 'published' and "clinic_themes"."branch_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "clinic_themes_one_draft_uq" ON "clinic_themes" USING btree ("clinic_id") WHERE "clinic_themes"."status" = 'draft' and "clinic_themes"."branch_id" is null;