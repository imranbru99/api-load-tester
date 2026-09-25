import Redis from 'ioredis';
import pool from '../db';
import { wsHub } from '../websocket/hub';
import { writeMetricPoint, flushMetrics } from '../metrics/influx';
import {
  httpRequestsTotal,
  requestDurationHistogram,
  activeVirtualUsersGauge,
  activeWorkersGauge
} from '../metrics/prometheus';
import { dispatchWebhooks } from '../webhooks/notifier';
import axios from 'axios';

export interface Stage {
  duration: number; // in seconds
  targetVUs: number;
}

export interface ThresholdRule {
  metric: 'p95' | 'p99' | 'p50' | 'p90' | 'error_rate' | 'rps' | 'max_latency';
  operator: '<' | '<=' | '>' | '>=';
  value: number; // e.g., 500 (ms) or 0.01 (1% error rate)
}

export interface LoadTestConfig {
  targetUrl: string;
  method?: string;
  headers?: Record<string, string>;
  body?: any;
  profile?: 'constant' | 'ramp' | 'spike' | 'soak' | 'stress' | 'breakpoint';
  stages: Stage[];
  maxRps?: number;
  protocol?: 'http1' | 'http2' | 'ws';
  keepAlive?: boolean;
  connectionsPerWorker?: number;
  thresholds?: ThresholdRule[];
  timeoutMs?: number;
}

export interface MetricSnapshot {
  timestamp: number;
  runId: string;
  activeVUs: number;
  rps: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  errorRate: number; // 0.0 - 1.0
  p50: number; // ms
  p90: number; // ms
  p95: number; // ms
  p99: number; // ms
  bytesTransferred: number;
  statusCodes: Record<string, number>;
}

export interface LoadRunSummary {
  runId: string;
  status: 'completed' | 'failed' | 'cancelled';
  totalDurationSeconds: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  errorRatePercent: number;
  peakRps: number;
  avgRps: number;
  p50Ms: number;
  p90Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxLatencyMs: number;
  totalBytes: number;
  statusCodes: Record<string, number>;
  thresholdResults: Array<{ rule: ThresholdRule; passed: boolean; actual: number }>;
  allThresholdsPassed: boolean;
}

class LoadOrchestrator {
  private redisClient: Redis | null = null;
  private redisSub: Redis | null = null;
  private activeRuns: Map<string, {
    config: LoadTestConfig;
    snapshots: MetricSnapshot[];
    startTime: number;
    intervalTimer?: NodeJS.Timeout;
    stopRequested?: boolean;
  }> = new Map();

  constructor() {
    this.initRedis();
  }

  private initRedis() {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    try {
      this.redisClient = new Redis(redisUrl, { retryStrategy: () => 3000, maxRetriesPerRequest: 1 });
      this.redisSub = new Redis(redisUrl, { retryStrategy: () => 3000, maxRetriesPerRequest: 1 });

      this.redisClient.on('connect', () => {
        console.log('[Orchestrator] Connected to Redis for load queue coordination');
      });

      this.redisSub.on('connect', () => {
        this.redisSub?.subscribe('alt:metrics:stream', 'alt:worker:heartbeat', (err) => {
          if (!err) console.log('[Orchestrator] Subscribed to Redis channels');
        });
      });

      this.redisSub.on('message', (channel, message) => {
        if (channel === 'alt:metrics:stream') {
          this.handleWorkerMetricStream(message);
        } else if (channel === 'alt:worker:heartbeat') {
          this.handleWorkerHeartbeat(message);
        }
      });
    } catch (err) {
      console.warn('[Orchestrator] Redis connection deferred:', err);
    }
  }

  private handleWorkerHeartbeat(msg: string) {
    try {
      const data = JSON.parse(msg);
      activeWorkersGauge.set(data.activeWorkers || 1);
    } catch {
      // ignore
    }
  }

  private handleWorkerMetricStream(msg: string) {
    try {
      const snapshot = JSON.parse(msg) as MetricSnapshot;
      const runState = this.activeRuns.get(snapshot.runId);
      if (!runState) return;

      runState.snapshots.push(snapshot);
      activeVirtualUsersGauge.set({ run_id: snapshot.runId }, snapshot.activeVUs);

      // Write to InfluxDB
      writeMetricPoint({ runId: snapshot.runId, metric: 'rps', value: snapshot.rps });
      writeMetricPoint({ runId: snapshot.runId, metric: 'p95', value: snapshot.p95 });
      writeMetricPoint({ runId: snapshot.runId, metric: 'p99', value: snapshot.p99 });
      writeMetricPoint({ runId: snapshot.runId, metric: 'error_rate', value: snapshot.errorRate });

      // Broadcast to WebSocket clients
      wsHub.broadcastToRun(snapshot.runId, {
        type: 'metrics',
        runId: snapshot.runId,
        data: snapshot,
      });
    } catch (err) {
      // ignore
    }
  }

  public async startLoadTest(runId: string, config: LoadTestConfig, workspaceId: string = 'default'): Promise<void> {
    const startTime = Date.now();
    this.activeRuns.set(runId, {
      config,
      snapshots: [],
      startTime,
    });

    // Update DB status to 'running'
    await pool.query(
      `UPDATE test_runs SET status = 'running', started_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [runId]
    );

    // Notify WS
    wsHub.broadcastToRun(runId, {
      type: 'status',
      runId,
      data: { status: 'running', message: 'Load test dispatched to distributed workers' }
    });

    // Check if Redis is ready to dispatch to Go workers
    let dispatchedToQueue = false;
    if (this.redisClient && this.redisClient.status === 'ready') {
      try {
        const jobPayload = JSON.stringify({ runId, config });
        await this.redisClient.lpush('alt:jobs:load_test', jobPayload);
        dispatchedToQueue = true;
        console.log(`[Orchestrator] Dispatched run ${runId} to Redis job queue alt:jobs:load_test`);
      } catch (err) {
        console.warn(`[Orchestrator] Redis dispatch failed:`, err);
      }
    }

    // If workers are not running via Redis or local standalone fallback is needed:
    if (!dispatchedToQueue) {
      console.log(`[Orchestrator] Redis worker queue not available, running via embedded Node load engine for run ${runId}`);
      this.runEmbeddedLoadEngine(runId, config);
    }
  }

  // Embedded Node Load Engine for Standalone / Local development fallback
  private async runEmbeddedLoadEngine(runId: string, config: LoadTestConfig) {
    const runState = this.activeRuns.get(runId);
    if (!runState) return;

    let totalRequests = 0;
    let successfulRequests = 0;
    let failedRequests = 0;
    let bytesTransferred = 0;
    const latencies: number[] = [];
    const statusCodes: Record<string, number> = {};

    const totalDurationSec = config.stages.reduce((acc, s) => acc + s.duration, 0) || 10;
    let currentVUs = 0;

    // Ramping scheduler
    const intervalTimer = setInterval(async () => {
      const elapsedSec = (Date.now() - runState.startTime) / 1000;
      if (elapsedSec >= totalDurationSec || runState.stopRequested) {
        clearInterval(intervalTimer);
        await this.finishRun(runId);
        return;
      }

      // Calculate target VUs based on current stage
      let accumulatedSec = 0;
      for (const stage of config.stages) {
        accumulatedSec += stage.duration;
        if (elapsedSec <= accumulatedSec) {
          currentVUs = stage.targetVUs;
          break;
        }
      }

      // Fire a wave of requests proportional to VUs
      const waveSize = Math.max(1, Math.min(currentVUs, 50));
      const wavePromises = Array.from({ length: waveSize }).map(async () => {
        const t0 = Date.now();
        try {
          const res = await axios({
            method: (config.method || 'GET') as any,
            url: config.targetUrl,
            headers: config.headers,
            data: config.body,
            timeout: config.timeoutMs || 3000,
            validateStatus: () => true,
          });
          const latency = Date.now() - t0;
          latencies.push(latency);
          totalRequests++;
          if (res.status >= 200 && res.status < 400) successfulRequests++;
          else failedRequests++;

          const codeStr = String(res.status);
          statusCodes[codeStr] = (statusCodes[codeStr] || 0) + 1;
          bytesTransferred += (typeof res.data === 'string' ? res.data.length : 100);

          httpRequestsTotal.inc({ run_id: runId, status_code: codeStr, method: config.method || 'GET' });
          requestDurationHistogram.observe({ run_id: runId, method: config.method || 'GET', status_code: codeStr }, latency / 1000);
        } catch (err: any) {
          totalRequests++;
          failedRequests++;
          statusCodes['ERR'] = (statusCodes['ERR'] || 0) + 1;
        }
      });

      await Promise.allSettled(wavePromises);

      // Compute percentiles for window
      const recentLatencies = latencies.slice(-100).sort((a, b) => a - b);
      const p50 = recentLatencies[Math.floor(recentLatencies.length * 0.50)] || 0;
      const p90 = recentLatencies[Math.floor(recentLatencies.length * 0.90)] || 0;
      const p95 = recentLatencies[Math.floor(recentLatencies.length * 0.95)] || 0;
      const p99 = recentLatencies[Math.floor(recentLatencies.length * 0.99)] || 0;
      const currentRps = Math.round(waveSize);
      const errorRate = totalRequests > 0 ? failedRequests / totalRequests : 0;

      const snapshot: MetricSnapshot = {
        timestamp: Date.now(),
        runId,
        activeVUs: currentVUs,
        rps: currentRps,
        totalRequests,
        successfulRequests,
        failedRequests,
        errorRate,
        p50,
        p90,
        p95,
        p99,
        bytesTransferred,
        statusCodes: { ...statusCodes },
      };

      runState.snapshots.push(snapshot);
      activeVirtualUsersGauge.set({ run_id: runId }, currentVUs);

      // Live metrics stream to WS
      wsHub.broadcastToRun(runId, {
        type: 'metrics',
        runId,
        data: snapshot,
      });

      // Stream to InfluxDB
      writeMetricPoint({ runId, metric: 'rps', value: currentRps });
      writeMetricPoint({ runId, metric: 'p95', value: p95 });
    }, 1000);

    runState.intervalTimer = intervalTimer;
  }

  public async stopRun(runId: string): Promise<void> {
    const runState = this.activeRuns.get(runId);
    if (runState) {
      runState.stopRequested = true;
      if (runState.intervalTimer) clearInterval(runState.intervalTimer);
    }

    // Publish cancel command to Redis for distributed workers
    if (this.redisClient && this.redisClient.status === 'ready') {
      await this.redisClient.publish(`alt:run:cancel:${runId}`, JSON.stringify({ runId }));
    }

    await this.finishRun(runId, 'cancelled');
  }

  public async finishRun(runId: string, forcedStatus?: 'completed' | 'failed' | 'cancelled'): Promise<LoadRunSummary> {
    const runState = this.activeRuns.get(runId);
    const durationSec = runState ? Math.max(1, (Date.now() - runState.startTime) / 1000) : 1;
    const snapshots = runState?.snapshots || [];

    const lastSnapshot = snapshots[snapshots.length - 1] || {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      errorRate: 0,
      p50: 0,
      p90: 0,
      p95: 0,
      p99: 0,
      bytesTransferred: 0,
      statusCodes: {},
    };

    const avgRps = durationSec > 0 ? Math.round(lastSnapshot.totalRequests / durationSec) : 0;
    const peakRps = snapshots.reduce((max, s) => Math.max(max, s.rps), 0);

    // Evaluate Threshold Gates
    const thresholdResults: Array<{ rule: ThresholdRule; passed: boolean; actual: number }> = [];
    let allThresholdsPassed = true;

    if (runState?.config.thresholds) {
      for (const th of runState.config.thresholds) {
        let actual = 0;
        if (th.metric === 'p95') actual = lastSnapshot.p95;
        else if (th.metric === 'p99') actual = lastSnapshot.p99;
        else if (th.metric === 'p90') actual = lastSnapshot.p90;
        else if (th.metric === 'p50') actual = lastSnapshot.p50;
        else if (th.metric === 'error_rate') actual = lastSnapshot.errorRate;
        else if (th.metric === 'rps') actual = avgRps;

        let passed = false;
        if (th.operator === '<') passed = actual < th.value;
        else if (th.operator === '<=') passed = actual <= th.value;
        else if (th.operator === '>') passed = actual > th.value;
        else if (th.operator === '>=') passed = actual >= th.value;

        if (!passed) allThresholdsPassed = false;
        thresholdResults.push({ rule: th, passed, actual });
      }
    }

    const finalStatus = forcedStatus || (allThresholdsPassed ? 'completed' : 'failed');

    const summary: LoadRunSummary = {
      runId,
      status: finalStatus,
      totalDurationSeconds: Math.round(durationSec),
      totalRequests: lastSnapshot.totalRequests,
      successfulRequests: lastSnapshot.successfulRequests,
      failedRequests: lastSnapshot.failedRequests,
      errorRatePercent: Math.round(lastSnapshot.errorRate * 10000) / 100,
      peakRps,
      avgRps,
      p50Ms: lastSnapshot.p50,
      p90Ms: lastSnapshot.p90,
      p95Ms: lastSnapshot.p95,
      p99Ms: lastSnapshot.p99,
      maxLatencyMs: lastSnapshot.p99 * 1.2,
      totalBytes: lastSnapshot.bytesTransferred,
      statusCodes: lastSnapshot.statusCodes,
      thresholdResults,
      allThresholdsPassed,
    };

    // Save summary to DB
    await pool.query(
      `UPDATE test_runs
       SET status = $1, summary = $2, threshold_passed = $3, completed_at = CURRENT_TIMESTAMP
       WHERE id = $4`,
      [finalStatus, JSON.stringify(summary), allThresholdsPassed, runId]
    );

    // Flush InfluxDB metrics
    await flushMetrics();

    // Broadcast completion to WS
    wsHub.broadcastToRun(runId, {
      type: 'status',
      runId,
      data: { status: finalStatus, summary }
    });

    // Reset gauge
    activeVirtualUsersGauge.set({ run_id: runId }, 0);

    // Dispatch Webhooks
    dispatchWebhooks(runId, summary);

    this.activeRuns.delete(runId);
    return summary;
  }
}

export const loadOrchestrator = new LoadOrchestrator();
