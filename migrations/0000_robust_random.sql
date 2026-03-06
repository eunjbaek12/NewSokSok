CREATE TABLE "curated_themes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"icon" text,
	"category" text,
	"level" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "curated_words" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"theme_id" varchar,
	"term" text NOT NULL,
	"definition" text NOT NULL,
	"meaning_kr" text NOT NULL,
	"example_en" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "curated_words" ADD CONSTRAINT "curated_words_theme_id_curated_themes_id_fk" FOREIGN KEY ("theme_id") REFERENCES "public"."curated_themes"("id") ON DELETE cascade ON UPDATE no action;