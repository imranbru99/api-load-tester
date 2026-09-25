package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"

	"api-load-tester/load-worker/internal/queue"
)

func main() {
	log.Println("=======================================================")
	log.Println("  ⚡ API Load Tester - High Concurrency Load Worker")
	log.Println("  ⚡ Protocol Support: HTTP/1.1, HTTP/2, WebSocket")
	log.Println("=======================================================")

	redisURL := os.Getenv("REDIS_URL")
	if redisURL == "" {
		redisURL = "redis://localhost:6379"
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	consumer := queue.NewWorkerConsumer(redisURL)
	consumer.Start(ctx)

	log.Println("[Worker] Shutting down load worker gracefully...")
}
