package store

import (
	"context"
	"database/sql"
)

const schema = `
CREATE TABLE IF NOT EXISTS analysis_requests (
    id UUID PRIMARY KEY,
    submitted_url TEXT NOT NULL,
    normalized_url TEXT NOT NULL,
    hostname TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('queued','running','complete','failed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    error_code TEXT,
    source_hash TEXT
);
ALTER TABLE analysis_requests ADD COLUMN IF NOT EXISTS source_hash TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS one_active_request_per_host
    ON analysis_requests(hostname) WHERE status IN ('queued','running');
CREATE INDEX IF NOT EXISTS analysis_requests_created_at ON analysis_requests(created_at);
CREATE INDEX IF NOT EXISTS analysis_requests_abuse_window ON analysis_requests(source_hash, created_at);

CREATE TABLE IF NOT EXISTS jobs (
    id UUID PRIMARY KEY,
    analysis_request_id UUID NOT NULL REFERENCES analysis_requests(id) ON DELETE CASCADE,
    stage TEXT NOT NULL DEFAULT 'analyze',
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','complete','failed')),
    lease_owner TEXT,
    lease_expires_at TIMESTAMPTZ,
    attempts INTEGER NOT NULL DEFAULT 0,
    next_run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jobs_claimable ON jobs(status, next_run_at, created_at);

CREATE TABLE IF NOT EXISTS processing_outputs (
    id BIGSERIAL PRIMARY KEY,
    job_id UUID NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE CASCADE,
    analysis_request_id UUID NOT NULL REFERENCES analysis_requests(id) ON DELETE CASCADE,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`

func Migrate(ctx context.Context, db *sql.DB) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err = tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock(837641029)`); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, schema); err != nil {
		return err
	}
	return tx.Commit()
}
