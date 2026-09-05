CREATE TABLE "records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"start_date" date,
	"end_date" date,
	"data" jsonb NOT NULL,
	"embedding" vector(384),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "records_type_dates_idx" ON "records" USING btree ("type","start_date","end_date");--> statement-breakpoint
CREATE INDEX "records_embedding_idx" ON "records" USING hnsw ("embedding" vector_cosine_ops);