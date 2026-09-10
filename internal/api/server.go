package api

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/termsinator/termsinator/internal/taxonomy"
)

type Server struct {
	db      *sql.DB
	hashKey []byte
}

var (
	errRateLimited = errors.New("rate limited")
	errQueueFull   = errors.New("queue full")
)

func NewServer(db *sql.DB) http.Handler {
	key := []byte(os.Getenv("ABUSE_HASH_KEY"))
	if len(key) < 16 {
		key = make([]byte, 32)
		_, _ = rand.Read(key)
	}
	s := &Server{db: db, hashKey: key}
	mux := http.NewServeMux()
	mux.HandleFunc("/health/live", s.live)
	mux.HandleFunc("/health/ready", s.ready)
	mux.HandleFunc("/v1/analysis-requests", s.analysisRequests)
	mux.HandleFunc("/v1/analysis-requests/", s.analysisRequestStatus)
	mux.HandleFunc("/v1/categories", s.categories)
	mux.HandleFunc("/v1/analyses", s.analyses)
	mux.HandleFunc("/v1/rankings", s.rankings)
	mux.HandleFunc("/v1/sites/", s.siteRoutes)
	return mux
}

func (s *Server) live(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) ready(w http.ResponseWriter, r *http.Request) {
	if err := s.db.PingContext(r.Context()); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "unavailable"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ready"})
}

type analysisRequestResponse struct {
	ID            string `json:"id"`
	Status        string `json:"status"`
	Created       bool   `json:"created"`
	NormalizedURL string `json:"normalized_url,omitempty"`
	ErrorCode     string `json:"error_code,omitempty"`
}

func (s *Server) siteRoutes(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", http.MethodGet)
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method_not_allowed"})
		return
	}
	path := strings.TrimPrefix(r.URL.Path, "/v1/sites/")
	kind := ""
	for _, candidate := range []string{"summary", "report"} {
		if strings.HasSuffix(path, "/"+candidate) {
			kind = candidate
			path = strings.TrimSuffix(path, "/"+candidate)
			break
		}
	}
	hostname := strings.ToLower(path)
	if kind == "" || hostname == "" || strings.Contains(hostname, "/") {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not_found"})
		return
	}
	var document []byte
	err := s.db.QueryRowContext(r.Context(), `
SELECT po.payload->$2
FROM processing_outputs po
JOIN analysis_requests ar ON ar.id=po.analysis_request_id
WHERE ar.hostname=$1 AND ar.status='complete' AND po.payload ? $2
ORDER BY po.created_at DESC LIMIT 1`, hostname, kind).Scan(&document)
	if errors.Is(err, sql.ErrNoRows) {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "report_not_found"})
		return
	}
	if err != nil || !json.Valid(document) {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "request_failed"})
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "public, max-age=300")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(document)
}

func (s *Server) analyses(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", http.MethodGet)
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method_not_allowed"})
		return
	}
	rows, err := s.db.QueryContext(r.Context(), `
SELECT summary FROM (
  SELECT DISTINCT ON (ar.hostname) po.payload->'summary' AS summary, po.created_at
  FROM processing_outputs po JOIN analysis_requests ar ON ar.id=po.analysis_request_id
  WHERE ar.status='complete' AND po.payload ? 'summary'
  ORDER BY ar.hostname, po.created_at DESC
) current
ORDER BY created_at DESC
LIMIT 200`)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "request_failed"})
		return
	}
	defer rows.Close()
	results := make([]json.RawMessage, 0)
	for rows.Next() {
		var raw []byte
		if err := rows.Scan(&raw); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "request_failed"})
			return
		}
		results = append(results, json.RawMessage(raw))
	}
	if err := rows.Err(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "request_failed"})
		return
	}
	w.Header().Set("Cache-Control", "public, max-age=300")
	writeJSON(w, http.StatusOK, map[string]any{"results": results})
}

func (s *Server) rankings(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", http.MethodGet)
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method_not_allowed"})
		return
	}
	offering := r.URL.Query().Get("offering_type")
	sector := r.URL.Query().Get("sector")
	subcategory := r.URL.Query().Get("subcategory")
	grade := strings.ToUpper(r.URL.Query().Get("grade"))
	if grade != "" && (len(grade) != 1 || !strings.Contains("ABCDE", grade)) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_grade"})
		return
	}
	rows, err := s.db.QueryContext(r.Context(), `
SELECT summary FROM (
  SELECT DISTINCT ON (ar.hostname) po.payload->'summary' AS summary, po.created_at
  FROM processing_outputs po JOIN analysis_requests ar ON ar.id=po.analysis_request_id
  WHERE ar.status='complete' AND po.payload ? 'summary'
    AND ($1='' OR po.payload#>>'{summary,classification,offering_type}'=$1)
    AND ($2='' OR po.payload#>>'{summary,classification,sector}'=$2)
    AND ($3='' OR po.payload#>>'{summary,classification,subcategory}'=$3)
    AND COALESCE(po.payload#>>'{summary,classification,confidence}','low') IN ('medium','high')
    AND po.payload#>>'{summary,aggregate,score}' IS NOT NULL
    AND ($4='' OR CASE
      WHEN (po.payload#>>'{summary,aggregate,score}')::numeric >= 85 THEN 'A'
      WHEN (po.payload#>>'{summary,aggregate,score}')::numeric >= 70 THEN 'B'
      WHEN (po.payload#>>'{summary,aggregate,score}')::numeric >= 50 THEN 'C'
      WHEN (po.payload#>>'{summary,aggregate,score}')::numeric >= 30 THEN 'D'
      ELSE 'E' END = $4)
  ORDER BY ar.hostname, po.created_at DESC
) current
ORDER BY (summary#>>'{aggregate,score}')::numeric DESC, summary->>'hostname'
LIMIT 100`, offering, sector, subcategory, grade)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "request_failed"})
		return
	}
	defer rows.Close()
	results := make([]json.RawMessage, 0)
	for rows.Next() {
		var raw []byte
		if err := rows.Scan(&raw); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "request_failed"})
			return
		}
		results = append(results, json.RawMessage(raw))
	}
	if err := rows.Err(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "request_failed"})
		return
	}
	w.Header().Set("Cache-Control", "public, max-age=300")
	writeJSON(w, http.StatusOK, map[string]any{"offering_type": offering, "sector": sector,
		"subcategory": subcategory, "grade": grade, "results": results})
}

func (s *Server) categories(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", http.MethodGet)
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method_not_allowed"})
		return
	}
	w.Header().Set("Cache-Control", "public, max-age=3600")
	writeJSON(w, http.StatusOK, taxonomy.Current())
}

func (s *Server) analysisRequests(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method_not_allowed"})
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	var input struct {
		URL string `json:"url"`
	}
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_json"})
		return
	}
	normalized, hostname, err := normalizePublicURL(input.URL)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_public_url"})
		return
	}

	sourceHash := s.sourceHash(clientIP(r), time.Now().UTC())
	result, err := s.enqueue(r.Context(), input.URL, normalized, hostname, sourceHash)
	if errors.Is(err, errRateLimited) {
		w.Header().Set("Retry-After", "3600")
		writeJSON(w, http.StatusTooManyRequests, map[string]string{"error": "rate_limited"})
		return
	}
	if errors.Is(err, errQueueFull) {
		w.Header().Set("Retry-After", "300")
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "queue_full"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "request_failed"})
		return
	}
	writeJSON(w, http.StatusAccepted, result)
}

func (s *Server) enqueue(ctx context.Context, submitted, normalized, hostname, sourceHash string) (analysisRequestResponse, error) {
	var existing analysisRequestResponse
	err := s.db.QueryRowContext(ctx, `SELECT id, status, normalized_url FROM analysis_requests WHERE hostname=$1 AND status IN ('queued','running') ORDER BY created_at LIMIT 1`, hostname).
		Scan(&existing.ID, &existing.Status, &existing.NormalizedURL)
	if err == nil {
		return existing, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return analysisRequestResponse{}, err
	}

	var recent, pending int
	if err := s.db.QueryRowContext(ctx, `SELECT count(*) FROM analysis_requests WHERE source_hash=$1 AND created_at > now()-interval '1 hour'`, sourceHash).Scan(&recent); err != nil {
		return analysisRequestResponse{}, err
	}
	if recent >= 10 {
		return analysisRequestResponse{}, errRateLimited
	}
	if err := s.db.QueryRowContext(ctx, `SELECT count(*) FROM analysis_requests WHERE status IN ('queued','running')`).Scan(&pending); err != nil {
		return analysisRequestResponse{}, err
	}
	if pending >= 500 {
		return analysisRequestResponse{}, errQueueFull
	}

	requestID, err := newUUID()
	if err != nil {
		return analysisRequestResponse{}, err
	}
	jobID, err := newUUID()
	if err != nil {
		return analysisRequestResponse{}, err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return analysisRequestResponse{}, err
	}
	defer tx.Rollback()
	_, err = tx.ExecContext(ctx, `INSERT INTO analysis_requests(id, submitted_url, normalized_url, hostname, status, source_hash) VALUES($1,$2,$3,$4,'queued',$5)`, requestID, submitted, normalized, hostname, sourceHash)
	if err != nil {
		// A concurrent request may have won the partial unique index.
		_ = tx.Rollback()
		err = s.db.QueryRowContext(ctx, `SELECT id, status, normalized_url FROM analysis_requests WHERE hostname=$1 AND status IN ('queued','running') ORDER BY created_at LIMIT 1`, hostname).
			Scan(&existing.ID, &existing.Status, &existing.NormalizedURL)
		return existing, err
	}
	if _, err = tx.ExecContext(ctx, `INSERT INTO jobs(id, analysis_request_id) VALUES($1,$2)`, jobID, requestID); err != nil {
		return analysisRequestResponse{}, err
	}
	if err = tx.Commit(); err != nil {
		return analysisRequestResponse{}, err
	}
	return analysisRequestResponse{ID: requestID, Status: "queued", Created: true, NormalizedURL: normalized}, nil
}

func (s *Server) analysisRequestStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", http.MethodGet)
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method_not_allowed"})
		return
	}
	id := strings.TrimPrefix(r.URL.Path, "/v1/analysis-requests/")
	if id == "" || strings.Contains(id, "/") {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not_found"})
		return
	}
	var result analysisRequestResponse
	err := s.db.QueryRowContext(r.Context(), `SELECT id, status, normalized_url, COALESCE(error_code,'') FROM analysis_requests WHERE id=$1`, id).
		Scan(&result.ID, &result.Status, &result.NormalizedURL, &result.ErrorCode)
	if errors.Is(err, sql.ErrNoRows) {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not_found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "request_failed"})
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func clientIP(r *http.Request) string {
	if forwarded := r.Header.Get("X-Forwarded-For"); forwarded != "" {
		chain := strings.Split(forwarded, ",")
		return strings.TrimSpace(chain[len(chain)-1])
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil {
		return host
	}
	return r.RemoteAddr
}

func (s *Server) sourceHash(ip string, now time.Time) string {
	mac := hmac.New(sha256.New, s.hashKey)
	_, _ = mac.Write([]byte(now.Format("2006-01-02") + "\x00" + ip))
	return hex.EncodeToString(mac.Sum(nil))
}

func normalizePublicURL(raw string) (string, string, error) {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.User != nil || u.Hostname() == "" {
		return "", "", errors.New("invalid URL")
	}
	hostname := strings.ToLower(strings.TrimSuffix(u.Hostname(), "."))
	if hostname == "localhost" || strings.HasSuffix(hostname, ".localhost") {
		return "", "", errors.New("local URL")
	}
	if ip := net.ParseIP(hostname); ip != nil && (!ip.IsGlobalUnicast() || ip.IsPrivate() || ip.IsLoopback()) {
		return "", "", errors.New("private URL")
	}
	port := u.Port()
	if port != "" && !((u.Scheme == "http" && port == "80") || (u.Scheme == "https" && port == "443")) {
		return "", "", errors.New("non-default port")
	}
	u.Host = hostname
	u.Path = "/"
	u.RawPath, u.RawQuery, u.Fragment = "", "", ""
	return u.String(), hostname, nil
}

func newUUID() (string, error) {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	s := hex.EncodeToString(b[:])
	return s[0:8] + "-" + s[8:12] + "-" + s[12:16] + "-" + s[16:20] + "-" + s[20:32], nil
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	if w.Header().Get("Cache-Control") == "" {
		w.Header().Set("Cache-Control", "no-store")
	}
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
