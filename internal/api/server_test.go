package api_test

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	_ "github.com/lib/pq"
	"github.com/termsinator/termsinator/internal/api"
	"github.com/termsinator/termsinator/internal/store"
)

func TestHealthReflectsDatabaseReadiness(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL is required for integration test")
	}
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	server := httptest.NewServer(api.NewServer(db))
	defer server.Close()

	for path, want := range map[string]int{"/health/live": 200, "/health/ready": 200} {
		response, err := http.Get(server.URL + path)
		if err != nil {
			t.Fatal(err)
		}
		response.Body.Close()
		if response.StatusCode != want {
			t.Fatalf("GET %s status = %d, want %d", path, response.StatusCode, want)
		}
	}

	if err := db.Close(); err != nil {
		t.Fatal(err)
	}
	response, err := http.Get(server.URL + "/health/ready")
	if err != nil {
		t.Fatal(err)
	}
	response.Body.Close()
	if response.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("readiness after database close = %d, want 503", response.StatusCode)
	}
}

func TestCompletedProcessingPublishesHostnameSummary(t *testing.T) {
	db := testDB(t)
	if err := store.Migrate(context.Background(), db); err != nil {
		t.Fatal(err)
	}
	requestID := "30000000-0000-4000-8000-000000000001"
	jobID := "40000000-0000-4000-8000-000000000001"
	_, _ = db.Exec(`DELETE FROM analysis_requests WHERE id=$1`, requestID)
	if _, err := db.Exec(`INSERT INTO analysis_requests(id,submitted_url,normalized_url,hostname,status) VALUES($1,'https://summary.example/','https://summary.example/','summary.example','complete')`, requestID); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO jobs(id,analysis_request_id,status) VALUES($1,$2,'complete')`, jobID, requestID); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO processing_outputs(job_id,analysis_request_id,payload) VALUES($1,$2,$3)`, jobID, requestID, `{"summary":{"hostname":"summary.example","aggregate":{"score":72.5,"verdict":"low_concern","model_count":2}}}`); err != nil {
		t.Fatal(err)
	}

	server := httptest.NewServer(api.NewServer(db))
	defer server.Close()
	response, err := http.Get(server.URL + "/v1/sites/summary.example/summary")
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("summary status=%d, want 200", response.StatusCode)
	}
	var result struct {
		Hostname string `json:"hostname"`
	}
	if err := json.NewDecoder(response.Body).Decode(&result); err != nil {
		t.Fatal(err)
	}
	if result.Hostname != "summary.example" {
		t.Fatalf("hostname=%q", result.Hostname)
	}
}

func TestCompletedProcessingPublishesFullHostnameReport(t *testing.T) {
	db := testDB(t)
	if err := store.Migrate(context.Background(), db); err != nil {
		t.Fatal(err)
	}
	requestID := "30000000-0000-4000-8000-000000000002"
	jobID := "40000000-0000-4000-8000-000000000002"
	_, _ = db.Exec(`DELETE FROM analysis_requests WHERE id=$1`, requestID)
	if _, err := db.Exec(`INSERT INTO analysis_requests(id,submitted_url,normalized_url,hostname,status) VALUES($1,'https://report.example/','https://report.example/','report.example','complete')`, requestID); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO jobs(id,analysis_request_id,status) VALUES($1,$2,'complete')`, jobID, requestID); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO processing_outputs(job_id,analysis_request_id,payload) VALUES($1,$2,$3)`, jobID, requestID, `{"summary":{"hostname":"report.example"},"report":{"schema_version":"1.0.0","marker":"full"}}`); err != nil {
		t.Fatal(err)
	}

	server := httptest.NewServer(api.NewServer(db))
	defer server.Close()
	response, err := http.Get(server.URL + "/v1/sites/report.example/report")
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("report status=%d, want 200", response.StatusCode)
	}
	var result struct {
		Marker string `json:"marker"`
	}
	if err := json.NewDecoder(response.Body).Decode(&result); err != nil {
		t.Fatal(err)
	}
	if result.Marker != "full" {
		t.Fatalf("report marker=%q", result.Marker)
	}
}

func TestRankingsFilterComparableOfferingTypes(t *testing.T) {
	db := testDB(t)
	if err := store.Migrate(context.Background(), db); err != nil {
		t.Fatal(err)
	}
	for index, offering := range []string{"saas", "physical_product"} {
		requestID := fmt.Sprintf("50000000-0000-4000-8000-%012d", index+1)
		jobID := fmt.Sprintf("60000000-0000-4000-8000-%012d", index+1)
		host := fmt.Sprintf("ranking-%d.example", index)
		_, _ = db.Exec(`DELETE FROM analysis_requests WHERE id=$1`, requestID)
		_, err := db.Exec(`INSERT INTO analysis_requests(id,submitted_url,normalized_url,hostname,status) VALUES($1,$2,$2,$3,'complete')`, requestID, "https://"+host+"/", host)
		if err != nil {
			t.Fatal(err)
		}
		if _, err = db.Exec(`INSERT INTO jobs(id,analysis_request_id,status) VALUES($1,$2,'complete')`, jobID, requestID); err != nil {
			t.Fatal(err)
		}
		payload := fmt.Sprintf(`{"summary":{"hostname":%q,"classification":{"offering_type":%q,"sector":"business_software","subcategory":"productivity","confidence":"high","taxonomy_version":"1.0.0","facets":[]},"aggregate":{"score":%d,"verdict":"low_concern","model_count":2},"policy_revision":{"source_date":"2026-09-07T00:00:00Z"}}}`, host, offering, 80-index)
		if _, err = db.Exec(`INSERT INTO processing_outputs(job_id,analysis_request_id,payload) VALUES($1,$2,$3)`, jobID, requestID, payload); err != nil {
			t.Fatal(err)
		}
	}

	server := httptest.NewServer(api.NewServer(db))
	defer server.Close()
	response, err := http.Get(server.URL + "/v1/rankings?offering_type=saas")
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	var result struct {
		Results []struct {
			Hostname string `json:"hostname"`
		} `json:"results"`
	}
	if err := json.NewDecoder(response.Body).Decode(&result); err != nil {
		t.Fatal(err)
	}
	if len(result.Results) != 1 || result.Results[0].Hostname != "ranking-0.example" {
		t.Fatalf("ranking results=%+v", result.Results)
	}
}

func TestCategoriesExposeOfferingTypesAndSubcategories(t *testing.T) {
	db := testDB(t)
	server := httptest.NewServer(api.NewServer(db))
	defer server.Close()

	response, err := http.Get(server.URL + "/v1/categories")
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("categories status = %d, want 200", response.StatusCode)
	}
	var result struct {
		OfferingTypes []struct {
			ID string `json:"id"`
		} `json:"offering_types"`
		Sectors []struct {
			ID            string   `json:"id"`
			Subcategories []string `json:"subcategories"`
		} `json:"sectors"`
	}
	if err := json.NewDecoder(response.Body).Decode(&result); err != nil {
		t.Fatal(err)
	}
	if len(result.OfferingTypes) < 2 || result.OfferingTypes[0].ID != "saas" {
		t.Fatalf("unexpected offering types: %+v", result.OfferingTypes)
	}
	if len(result.Sectors) == 0 || len(result.Sectors[0].Subcategories) == 0 {
		t.Fatalf("expected sectors with subcategories")
	}
}

func TestAnonymousSubmissionsAreRateLimited(t *testing.T) {
	db := testDB(t)
	if err := store.Migrate(context.Background(), db); err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(api.NewServer(db))
	defer server.Close()
	for index := 0; index < 11; index++ {
		body := fmt.Sprintf(`{"url":"https://rate-%d-%d.example/"}`, time.Now().UnixNano(), index)
		response, err := http.Post(server.URL+"/v1/analysis-requests", "application/json", bytes.NewBufferString(body))
		if err != nil {
			t.Fatal(err)
		}
		response.Body.Close()
		want := http.StatusAccepted
		if index == 10 {
			want = http.StatusTooManyRequests
		}
		if response.StatusCode != want {
			t.Fatalf("submission %d status=%d, want %d", index+1, response.StatusCode, want)
		}
	}
}

func TestUnsafeURLIsRejectedBeforeQueueing(t *testing.T) {
	db := testDB(t)
	if err := store.Migrate(context.Background(), db); err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(api.NewServer(db))
	defer server.Close()

	for _, unsafe := range []string{"http://127.0.0.1/admin", "http://localhost", "file:///etc/passwd", "https://example.com:8443"} {
		body, _ := json.Marshal(map[string]string{"url": unsafe})
		response, err := http.Post(server.URL+"/v1/analysis-requests", "application/json", bytes.NewReader(body))
		if err != nil {
			t.Fatal(err)
		}
		response.Body.Close()
		if response.StatusCode != http.StatusBadRequest {
			t.Fatalf("submission of %q = %d, want 400", unsafe, response.StatusCode)
		}
	}
}

func TestVisitorSubmitsURLWithoutCredentialsAndDuplicateReusesJob(t *testing.T) {
	db := testDB(t)
	if err := store.Migrate(context.Background(), db); err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(api.NewServer(db))
	defer server.Close()

	host := fmt.Sprintf("api-%d.example.com", time.Now().UnixNano())
	first := submitURL(t, server.URL, fmt.Sprintf(`{"url":"https://%s/some/page?tracking=1"}`, host))
	if first.Status != "queued" || !first.Created {
		t.Fatalf("first submission = %+v, want newly queued", first)
	}
	second := submitURL(t, server.URL, fmt.Sprintf(`{"url":"https://%s/other"}`, host))
	if second.ID != first.ID || second.Created {
		t.Fatalf("duplicate submission = %+v, want existing id %s", second, first.ID)
	}

	response, err := http.Get(server.URL + "/v1/analysis-requests/" + first.ID)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("status response = %d, want 200", response.StatusCode)
	}
}

type submittedRequest struct {
	ID      string `json:"id"`
	Status  string `json:"status"`
	Created bool   `json:"created"`
}

func submitURL(t *testing.T, baseURL, body string) submittedRequest {
	t.Helper()
	response, err := http.Post(baseURL+"/v1/analysis-requests", "application/json", bytes.NewBufferString(body))
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusAccepted {
		t.Fatalf("submission status = %d, want 202", response.StatusCode)
	}
	var result submittedRequest
	if err := json.NewDecoder(response.Body).Decode(&result); err != nil {
		t.Fatal(err)
	}
	return result
}

func testDB(t *testing.T) *sql.DB {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL is required for integration test")
	}
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db
}
