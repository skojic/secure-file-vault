// Deletes uploads still pending well past the upload timeout, with their bytes (F1). Run on a schedule.
import { env } from "@/env";
import { pool } from "@/server/db/client";
import { defaultStorage, sweepStalePending } from "@/server/files/upload";
import { log } from "@/server/log";

const olderThanSeconds = Math.ceil(env.UPLOAD_TIMEOUT_MS / 1000) + 300;

sweepStalePending(defaultStorage(), olderThanSeconds)
  .then(({ removed, blobsFailed }) => {
    log.info("files.sweep.done", { removed, blobsFailed, olderThanSeconds });
    if (blobsFailed > 0) process.exitCode = 1;
  })
  .catch((err: unknown) => {
    const e = err as { code?: string; message?: string };
    log.error("files.sweep.failed", { code: e.code, message: e.message });
    process.exitCode = 1;
  })
  .finally(() => pool.end());
