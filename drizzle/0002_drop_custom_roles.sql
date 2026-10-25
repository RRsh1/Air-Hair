ALTER TABLE "staff_users" DROP CONSTRAINT "staff_users_role_fk";--> statement-breakpoint
ALTER TABLE "staff_users" DROP COLUMN "role_id";--> statement-breakpoint
DROP TABLE "role_capabilities";--> statement-breakpoint
DROP TABLE "roles";
