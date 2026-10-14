DROP INDEX "files_uploader_created_idx";--> statement-breakpoint
DROP INDEX "files_created_idx";--> statement-breakpoint
CREATE INDEX "files_uploader_created_idx" ON "files" USING btree ("uploader_id","created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "files_created_idx" ON "files" USING btree ("created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);