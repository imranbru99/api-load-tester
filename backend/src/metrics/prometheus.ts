import client from 'prom-client';

const register = new client.Registry();
client.collectDefaultMetrics({ register, prefix: 'alt_' });

export const httpRequestsTotal = new client.Counter({
  name: 'alt_load_requests_total',
  help: 'Total HTTP/WS requests sent during load and functional testing',
  labelNames: ['run_id', 'status_code', 'method', 'target_host'],
});

export const requestDurationHistogram = new client.Histogram({
  name: 'alt_request_duration_seconds',
  help: 'Request duration in seconds',
  labelNames: ['run_id', 'method', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
});

export const activeVirtualUsersGauge = new client.Gauge({
  name: 'alt_active_virtual_users',
  help: 'Currently running virtual users across all workers',
  labelNames: ['run_id'],
});

export const activeWorkersGauge = new client.Gauge({
  name: 'alt_active_load_workers',
  help: 'Number of active connected load workers',
});

register.registerMetric(httpRequestsTotal);
register.registerMetric(requestDurationHistogram);
register.registerMetric(activeVirtualUsersGauge);
register.registerMetric(activeWorkersGauge);

export { register };
