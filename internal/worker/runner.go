package worker

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"
)

type Request struct {
	ID  string `json:"id"`
	URL string `json:"url"`
}

type Processor interface {
	Process(context.Context, Request) (json.RawMessage, error)
}

type Runner struct {
	db        *sql.DB
	owner     string
	lease     time.Duration
	processor Processor
}

func NewRunner(db *sql.DB, owner string, lease time.Duration, processor Processor) *Runner {
	return &Runner{db: db, owner: owner, lease: lease, processor: processor}
}

func (r *Runner) RunOnce(ctx context.Context) (bool, error) {
	var jobID string
	var request Request
	err := r.db.QueryRowContext(ctx, `
WITH candidate AS (
  SELECT id FROM jobs
  WHERE (status='queued' AND next_run_at <= now())
     OR (status='running' AND lease_expires_at < now())
  ORDER BY created_at
  FOR UPDATE SKIP LOCKED
  LIMIT 1
)
UPDATE jobs j
SET status='running', lease_owner=$1, lease_expires_at=now()+($2 * interval '1 second'), attempts=attempts+1, updated_at=now()
FROM candidate c, analysis_requests ar
WHERE j.id=c.id AND ar.id=j.analysis_request_id
RETURNING j.id, ar.id, ar.normalized_url`, r.owner, r.lease.Seconds()).Scan(&jobID, &request.ID, &request.URL)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if _, err := r.db.ExecContext(ctx, `UPDATE analysis_requests SET status='running', updated_at=now() WHERE id=$1`, request.ID); err != nil {
		return true, err
	}

	payload, processErr := r.processor.Process(ctx, request)
	if processErr != nil {
		return true, r.fail(ctx, jobID, request.ID, processErr)
	}
	if !json.Valid(payload) {
		return true, r.fail(ctx, jobID, request.ID, errors.New("processor returned invalid JSON"))
	}

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return true, err
	}
	defer tx.Rollback()
	if _, err = tx.ExecContext(ctx, `INSERT INTO processing_outputs(job_id,analysis_request_id,payload) VALUES($1,$2,$3) ON CONFLICT(job_id) DO UPDATE SET payload=EXCLUDED.payload`, jobID, request.ID, []byte(payload)); err != nil {
		return true, err
	}
	if _, err = tx.ExecContext(ctx, `UPDATE jobs SET status='complete', lease_owner=NULL, lease_expires_at=NULL, updated_at=now() WHERE id=$1 AND lease_owner=$2`, jobID, r.owner); err != nil {
		return true, err
	}
	if _, err = tx.ExecContext(ctx, `UPDATE analysis_requests SET status='complete', error_code=NULL, updated_at=now() WHERE id=$1`, request.ID); err != nil {
		return true, err
	}
	return true, tx.Commit()
}

func (r *Runner) fail(ctx context.Context, jobID, requestID string, cause error) error {
	var attempts int
	if err := r.db.QueryRowContext(ctx, `SELECT attempts FROM jobs WHERE id=$1`, jobID).Scan(&attempts); err != nil {
		return err
	}
	if attempts >= 3 {
		_, err := r.db.ExecContext(ctx, `
UPDATE jobs SET status='failed', lease_owner=NULL, lease_expires_at=NULL, updated_at=now() WHERE id=$1;
UPDATE analysis_requests SET status='failed', error_code='processing_failed', updated_at=now() WHERE id=$2`, jobID, requestID)
		if err != nil {
			return err
		}
		return fmt.Errorf("processing failed permanently: %w", cause)
	}
	_, err := r.db.ExecContext(ctx, `
UPDATE jobs SET status='queued', lease_owner=NULL, lease_expires_at=NULL, next_run_at=now()+interval '30 seconds', updated_at=now() WHERE id=$1;
UPDATE analysis_requests SET status='queued', error_code='processing_retry', updated_at=now() WHERE id=$2`, jobID, requestID)
	if err != nil {
		return err
	}
	return fmt.Errorf("processing will retry: %w", cause)
}
