package main

import (
	"context"
	"database/sql"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	_ "github.com/lib/pq"
	"github.com/termsinator/termsinator/internal/api"
	"github.com/termsinator/termsinator/internal/store"
)

func main() {
	dsn := required("DATABASE_URL")
	db, err := sql.Open("postgres", dsn)
	if err != nil { log.Fatal(err) }
	defer db.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	if err := store.Migrate(ctx, db); err != nil { cancel(); log.Fatal(err) }
	cancel()

	address := env("LISTEN_ADDR", ":8080")
	server := &http.Server{
		Addr: address, Handler: api.NewServer(db),
		ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second,
		WriteTimeout: 30 * time.Second, IdleTimeout: 60 * time.Second,
	}
	go func() {
		log.Printf("api listening on %s", address)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) { log.Fatal(err) }
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop
	shutdown, done := context.WithTimeout(context.Background(), 15*time.Second)
	defer done()
	if err := server.Shutdown(shutdown); err != nil { log.Printf("shutdown: %v", err) }
}

func env(name, fallback string) string {
	if value := os.Getenv(name); value != "" { return value }
	return fallback
}

func required(name string) string {
	value := os.Getenv(name)
	if value == "" { log.Fatalf("%s is required", name) }
	return value
}
