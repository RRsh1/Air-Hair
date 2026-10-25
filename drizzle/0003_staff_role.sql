CREATE TYPE "public"."staff_role" AS ENUM('admin', 'doctor');--> statement-breakpoint
ALTER TABLE "staff_users" ADD COLUMN "role" "staff_role" NOT NULL;