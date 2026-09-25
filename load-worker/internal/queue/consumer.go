package queue

import (
	"context"
	"encoding/json"
	"log"
	"os"
	"time"

	"api-load-tester/load-worker/internal/engine"
	"api-load-tester/load-worker/internal/metrics"

	"github.com/redis/go-redis/v9"
)

type WorkerConsumer struct {
	rdb        *redis.Client
	workerID   string
	cancelChan chan struct{}
}

func NewWorkerConsumer(redisURL string) *WorkerConsumer {
	opt, err := redis.ParseURL(redisURL)
	if err != nil {
		log.Printf("[Worker] Warning: could not parse redis URL %s, defaulting to localhost:6379", redisURL)
		opt = &redis.Options{Addr: "localhost:6379"}
	}

	hostname, _ := os.Hostname()
	workerID := "worker-" + hostname

	return &WorkerConsumer{
		rdb:        redis.NewClient(opt),
		workerID:   workerID,
		cancelChan: make(chan struct{}),
	}
}

func (w *WorkerConsumer) Start(ctx context.Context) {
	log.Printf("[Worker] Starting load worker instance %s, waiting for jobs...", w.workerID)

	// Heartbeat ticker
	go func() {
		ticker := time.NewTicker(5 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				_ = w.rdb.Publish(ctx, "alt:worker:heartbeat", `{"workerId":"`+w.workerID+`","status":"alive"}`).Err()
			}
		}
	}()

	for {
		select {
		case <-ctx.Done():
			return
		default:
			// BRPOP waits up to 2 seconds for a job
			res, err := w.rdb.BRPop(ctx, 2*time.Second, "alt:jobs:load_test").Result()
			if err != nil {
				if err != redis.Nil && ctx.Err() == nil {
					time.Sleep(1 * time.Second)
				}
				continue
			}

			if len(res) < 2 {
				continue
			}

			rawJob := res[1]
			var job engine.JobPayload
			if err := json.Unmarshal([]byte(rawJob), &job); err != nil {
				log.Printf("[Worker] Error parsing job payload: %v", err)
				continue
			}

			w.executeJob(ctx, job)
		}
	}
}

func (w *WorkerConsumer) executeJob(parentCtx context.Context, job engine.JobPayload) {
	runCtx, cancel := context.WithCancel(parentCtx)
	defer cancel()

	// Subscribe to cancellation for this run
	pubsub := w.rdb.Subscribe(runCtx, "alt:run:cancel:"+job.RunID)
	defer pubsub.Close()

	go func() {
		ch := pubsub.Channel()
		select {
		case <-runCtx.Done():
			return
		case msg, ok := <-ch:
			if ok && msg != nil {
				log.Printf("[Worker] Received cancellation request for run %s", job.RunID)
				cancel()
			}
		}
	}()

	// Metric publisher callback
	publisher := func(snapshot metrics.MetricSnapshot) {
		payload, err := json.Marshal(snapshot)
		if err == nil {
			_ = w.rdb.Publish(runCtx, "alt:metrics:stream", payload).Err()
		}
	}

	exec := engine.NewExecutor(job, publisher)
	if err := exec.Run(runCtx); err != nil {
		log.Printf("[Worker] Error running job %s: %v", job.RunID, err)
	}
}
