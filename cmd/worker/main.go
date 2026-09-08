package main

import (
	"context"
	"database/sql"
	"log"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	_ "github.com/lib/pq"
	"github.com/termsinator/termsinator/internal/store"
	"github.com/termsinator/termsinator/internal/worker"
)

func main() {
	dsn := required("DATABASE_URL")
	executable := required("PROCESSOR_EXECUTABLE")
	db, err := sql.Open("postgres", dsn)
	if err != nil { log.Fatal(err) }
	defer db.Close()
	if err := store.Migrate(context.Background(), db); err != nil { log.Fatal(err) }

	hostname, _ := os.Hostname()
	processor := worker.CommandProcessor{
		Executable: executable,
		Args: strings.Fields(os.Getenv("PROCESSOR_ARGS")),
		Timeout: duration("PROCESSOR_TIMEOUT", 15*time.Minute),
		MaxOutput: 5 << 20,
	}
	runner := worker.NewRunner(db, hostname, 20*time.Minute, processor)
	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	for ctx.Err() == nil {
		processed, err := runner.RunOnce(ctx)
		if err != nil { log.Printf("job: %v", err) }
		if !processed {
			select { case <-ctx.Done(): case <-time.After(2 * time.Second): }
		}
	}
}

func required(name string) string {
	value := os.Getenv(name)
	if value == "" { log.Fatalf("%s is required", name) }
	return value
}

func duration(name string, fallback time.Duration) time.Duration {
	value := os.Getenv(name)
	if value == "" { return fallback }
	parsed, err := time.ParseDuration(value)
	if err != nil { log.Fatalf("invalid %s: %v", name, err) }
	return parsed
}
