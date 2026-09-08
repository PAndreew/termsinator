package worker_test

import (
	"context"
	"database/sql"
	"encoding/json"
	"os"
	"testing"
	"time"

	_ "github.com/lib/pq"
	"github.com/termsinator/termsinator/internal/store"
	"github.com/termsinator/termsinator/internal/worker"
)

type recordingProcessor struct{ URL string }

func (p *recordingProcessor) Process(_ context.Context, request worker.Request) (json.RawMessage, error) {
	p.URL = request.URL
	return json.RawMessage(`{"schema_version":"1.0.0","result":"processed"}`), nil
}

func TestRunnerLeasesAndCompletesQueuedAnalysis(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL is required")
	}
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err := store.Migrate(context.Background(), db); err != nil {
		t.Fatal(err)
	}
	requestID := "10000000-0000-4000-8000-000000000001"
	jobID := "20000000-0000-4000-8000-000000000001"
	if _, err := db.Exec(`DELETE FROM analysis_requests WHERE id=$1`, requestID); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO analysis_requests(id,submitted_url,normalized_url,hostname,status) VALUES($1,$2,$2,'example.com','queued')`, requestID, "https://example.com/"); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO jobs(id,analysis_request_id,created_at) VALUES($1,$2,'2000-01-01')`, jobID, requestID); err != nil {
		t.Fatal(err)
	}

	processor := &recordingProcessor{}
	runner := worker.NewRunner(db, "test-worker", time.Minute, processor)
	processed, err := runner.RunOnce(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if !processed || processor.URL != "https://example.com/" {
		t.Fatalf("processed=%v url=%q", processed, processor.URL)
	}

	var status string
	var outputs int
	if err := db.QueryRow(`SELECT status FROM analysis_requests WHERE id=$1`, requestID).Scan(&status); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRow(`SELECT count(*) FROM processing_outputs WHERE job_id=$1`, jobID).Scan(&outputs); err != nil {
		t.Fatal(err)
	}
	if status != "complete" || outputs != 1 {
		t.Fatalf("status=%q outputs=%d, want complete/1", status, outputs)
	}
}
