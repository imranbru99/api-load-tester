package metrics

import (
	"math/rand"
	"sort"
	"sync"
	"sync/atomic"
	"time"
)

const ReservoirCapacity = 2048

// WindowMetrics tracks metrics for a rolling 1-second window without unbounded memory growth
type WindowMetrics struct {
	mu           sync.Mutex
	reservoir    []float64
	count        int64
	totalReqs    int64
	successReqs  int64
	failedReqs   int64
	totalBytes   int64
	statusCodes  map[string]int64
	lastSnapshot time.Time
}

type MetricSnapshot struct {
	Timestamp          int64            `json:"timestamp"`
	RunID              string           `json:"runId"`
	ActiveVUs          int              `json:"activeVUs"`
	RPS                int64            `json:"rps"`
	TotalRequests      int64            `json:"totalRequests"`
	SuccessfulRequests int64            `json:"successfulRequests"`
	FailedRequests     int64            `json:"failedRequests"`
	ErrorRate          float64          `json:"errorRate"`
	P50                float64          `json:"p50"`
	P90                float64          `json:"p90"`
	P95                float64          `json:"p95"`
	P99                float64          `json:"p99"`
	BytesTransferred   int64            `json:"bytesTransferred"`
	StatusCodes        map[string]int64 `json:"statusCodes"`
}

func NewWindowMetrics() *WindowMetrics {
	return &WindowMetrics{
		reservoir:    make([]float64, 0, ReservoirCapacity),
		statusCodes:  make(map[string]int64),
		lastSnapshot: time.Now(),
	}
}

// RecordResponse records a single request outcome with O(1) memory
func (m *WindowMetrics) RecordResponse(latencyMs float64, statusCode int, bytes int64, isSuccess bool) {
	atomic.AddInt64(&m.totalReqs, 1)
	if isSuccess {
		atomic.AddInt64(&m.successReqs, 1)
	} else {
		atomic.AddInt64(&m.failedReqs, 1)
	}
	atomic.AddInt64(&m.totalBytes, bytes)

	m.mu.Lock()
	defer m.mu.Unlock()

	// Vitter's reservoir sampling algorithm for fixed memory percentiles
	m.count++
	if len(m.reservoir) < ReservoirCapacity {
		m.reservoir = append(m.reservoir, latencyMs)
	} else {
		idx := rand.Int63n(m.count)
		if idx < ReservoirCapacity {
			m.reservoir[idx] = latencyMs
		}
	}

	codeKey := "200"
	if statusCode > 0 {
		codeKey = string(rune('0' + (statusCode / 100))) + "xx"
	} else {
		codeKey = "ERR"
	}
	m.statusCodes[codeKey]++
}

// ResetWindow takes a snapshot and resets the reservoir for the next rolling window
func (m *WindowMetrics) Snapshot(runID string, activeVUs int) MetricSnapshot {
	m.mu.Lock()
	defer m.mu.Unlock()

	now := time.Now()
	elapsed := now.Sub(m.lastSnapshot).Seconds()
	if elapsed <= 0 {
		elapsed = 1.0
	}

	total := atomic.LoadInt64(&m.totalReqs)
	success := atomic.LoadInt64(&m.successReqs)
	failed := atomic.LoadInt64(&m.failedReqs)
	bytes := atomic.LoadInt64(&m.totalBytes)

	// Calculate percentiles
	var p50, p90, p95, p99 float64
	if len(m.reservoir) > 0 {
		sorted := make([]float64, len(m.reservoir))
		copy(sorted, m.reservoir)
		sort.Float64s(sorted)

		p50 = sorted[int(float64(len(sorted))*0.50)]
		p90 = sorted[int(float64(len(sorted))*0.90)]
		p95 = sorted[int(float64(len(sorted))*0.95)]
		p99 = sorted[int(float64(len(sorted))*0.99)]
	}

	rps := int64(float64(m.count) / elapsed)
	var errorRate float64
	if total > 0 {
		errorRate = float64(failed) / float64(total)
	}

	codesCopy := make(map[string]int64, len(m.statusCodes))
	for k, v := range m.statusCodes {
		codesCopy[k] = v
	}

	// Reset rolling window
	m.reservoir = m.reservoir[:0]
	m.count = 0
	m.lastSnapshot = now

	return MetricSnapshot{
		Timestamp:          now.UnixMilli(),
		RunID:              runID,
		ActiveVUs:          activeVUs,
		RPS:                rps,
		TotalRequests:      total,
		SuccessfulRequests: success,
		FailedRequests:     failed,
		ErrorRate:          errorRate,
		P50:                p50,
		P90:                p90,
		P95:                p95,
		P99:                p99,
		BytesTransferred:   bytes,
		StatusCodes:        codesCopy,
	}
}
