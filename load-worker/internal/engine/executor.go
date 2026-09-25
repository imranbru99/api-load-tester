package engine

import (
	"context"
	"encoding/json"
	"log"
	"sync"
	"sync/atomic"
	"time"

	"api-load-tester/load-worker/internal/metrics"
	"api-load-tester/load-worker/internal/sender"

	"golang.org/x/time/rate"
)

type Stage struct {
	Duration  int `json:"duration"`  // Seconds
	TargetVUs int `json:"targetVUs"` // Target concurrent virtual users
}

type LoadConfig struct {
	TargetURL            string            `json:"targetUrl"`
	Method               string            `json:"method"`
	Headers              map[string]string `json:"headers"`
	Body                 interface{}       `json:"body"`
	Stages               []Stage           `json:"stages"`
	MaxRPS               int               `json:"maxRps"`
	KeepAlive            bool              `json:"keepAlive"`
	ConnectionsPerWorker int               `json:"connectionsPerWorker"`
	TimeoutMs            int               `json:"timeoutMs"`
}

type JobPayload struct {
	RunID  string     `json:"runId"`
	Config LoadConfig `json:"config"`
}

type MetricPublisher func(snapshot metrics.MetricSnapshot)

type Executor struct {
	job        JobPayload
	clientMgr  *sender.ClientManager
	metrics    *metrics.WindowMetrics
	publisher  MetricPublisher
	bodyBytes  []byte
	limiter    *rate.Limiter
	activeVUs  int32
	cancelFunc context.CancelFunc
}

func NewExecutor(job JobPayload, publisher MetricPublisher) *Executor {
	timeout := time.Duration(job.Config.TimeoutMs) * time.Millisecond
	if timeout <= 0 {
		timeout = 10 * time.Second
	}

	cm := sender.NewClientManager(
		job.Config.KeepAlive,
		job.Config.ConnectionsPerWorker,
		timeout,
	)

	var body []byte
	if job.Config.Body != nil {
		switch b := job.Config.Body.(type) {
		case string:
			body = []byte(b)
		default:
			body, _ = json.Marshal(b)
		}
	}

	var limiter *rate.Limiter
	if job.Config.MaxRPS > 0 {
		limiter = rate.NewLimiter(rate.Limit(job.Config.MaxRPS), job.Config.MaxRPS*2)
	}

	return &Executor{
		job:       job,
		clientMgr: cm,
		metrics:   metrics.NewWindowMetrics(),
		publisher: publisher,
		bodyBytes: body,
		limiter:   limiter,
	}
}

// Run executes the staged load test
func (e *Executor) Run(ctx context.Context) error {
	ctx, cancel := context.WithCancel(ctx)
	e.cancelFunc = cancel
	defer cancel()

	log.Printf("[Worker Executor] Starting load test run %s -> %s", e.job.RunID, e.job.Config.TargetURL)

	// Start 1-second metric emission ticker
	metricTicker := time.NewTicker(1 * time.Second)
	defer metricTicker.Stop()

	go func() {
		for {
			select {
			case <-ctx.Done():
				return
			case <-metricTicker.C:
				snapshot := e.metrics.Snapshot(e.job.RunID, int(atomic.LoadInt32(&e.activeVUs)))
				if e.publisher != nil {
					e.publisher(snapshot)
				}
			}
		}
	}()

	var vuWG sync.WaitGroup
	vuControlChans := make([]chan struct{}, 0)
	var vuMu sync.Mutex

	isWS := sender.IsWebSocketURL(e.job.Config.TargetURL)
	method := e.job.Config.Method
	if method == "" {
		method = "GET"
	}

	adjustVUs := func(target int) {
		vuMu.Lock()
		defer vuMu.Unlock()

		current := len(vuControlChans)
		if target > current {
			for i := 0; i < target-current; i++ {
				stopCh := make(chan struct{})
				vuControlChans = append(vuControlChans, stopCh)
				atomic.AddInt32(&e.activeVUs, 1)

				vuWG.Add(1)
				go func(ch chan struct{}) {
					defer vuWG.Done()
					defer atomic.AddInt32(&e.activeVUs, -1)

					for {
						select {
						case <-ctx.Done():
							return
						case <-ch:
							return
						default:
							// Apply RPS rate limiter if set
							if e.limiter != nil {
								_ = e.limiter.Wait(ctx)
							}

							var statusCode int
							var latency float64
							var bytesRead int64
							var err error

							if isWS {
								statusCode, latency, bytesRead, err = e.clientMgr.SendWebSocketProbe(
									ctx,
									e.job.Config.TargetURL,
									e.job.Config.Headers,
									e.bodyBytes,
								)
							} else {
								statusCode, latency, bytesRead, err = e.clientMgr.SendHTTPRequest(
									ctx,
									method,
									e.job.Config.TargetURL,
									e.job.Config.Headers,
									e.bodyBytes,
								)
							}

							isSuccess := err == nil && statusCode >= 200 && statusCode < 400
							e.metrics.RecordResponse(latency, statusCode, bytesRead, isSuccess)
						}
					}
				}(stopCh)
			}
		} else if target < current {
			toRemove := current - target
			for i := 0; i < toRemove; i++ {
				lastIdx := len(vuControlChans) - 1
				close(vuControlChans[lastIdx])
				vuControlChans = vuControlChans[:lastIdx]
			}
		}
	}

	// Iterate through stages
	for stageIdx, stage := range e.job.Config.Stages {
		select {
		case <-ctx.Done():
			break
		default:
			log.Printf("[Worker Executor] Run %s: entering Stage %d/%d (target %d VUs for %ds)",
				e.job.RunID, stageIdx+1, len(e.job.Config.Stages), stage.TargetVUs, stage.Duration)

			adjustVUs(stage.TargetVUs)

			stageTimer := time.NewTimer(time.Duration(stage.Duration) * time.Second)
			select {
			case <-ctx.Done():
				stageTimer.Stop()
				break
			case <-stageTimer.C:
			}
		}
	}

	// Wind down all remaining VUs
	adjustVUs(0)
	vuWG.Wait()

	// Final snapshot
	finalSnapshot := e.metrics.Snapshot(e.job.RunID, 0)
	if e.publisher != nil {
		e.publisher(finalSnapshot)
	}

	log.Printf("[Worker Executor] Finished run %s. Total requests: %d", e.job.RunID, finalSnapshot.TotalRequests)
	return nil
}

func (e *Executor) Stop() {
	if e.cancelFunc != nil {
		e.cancelFunc()
	}
}
