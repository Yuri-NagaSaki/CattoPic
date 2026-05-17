-- Durable R2 deletion retry queue.
-- Metadata deletes write jobs here before background R2 cleanup starts.
CREATE TABLE IF NOT EXISTS deletion_jobs (
    id TEXT PRIMARY KEY,
    image_id TEXT NOT NULL UNIQUE,
    paths_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_deletion_jobs_created_at
ON deletion_jobs(attempts, created_at);
