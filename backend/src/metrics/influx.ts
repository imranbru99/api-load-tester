import { InfluxDB, Point, WriteApi } from '@influxdata/influxdb-client';

const url = process.env.INFLUXDB_URL || 'http://localhost:8086';
const token = process.env.INFLUXDB_TOKEN || 'alt-secret-token-super-secure';
const org = process.env.INFLUXDB_ORG || 'alt';
const bucket = process.env.INFLUXDB_BUCKET || 'metrics';

let writeApi: WriteApi | null = null;
let influxAvailable = false;

try {
  const influx = new InfluxDB({ url, token });
  writeApi = influx.getWriteApi(org, bucket, 'ns');
  influxAvailable = true;
  console.log(`[InfluxDB] Initialized client for ${url}, bucket: ${bucket}`);
} catch (err) {
  console.warn('[InfluxDB] Not configured or error initializing, continuing with fallback:', err);
}

export interface MetricPoint {
  runId: string;
  metric: string;
  value: number;
  tags?: Record<string, string>;
  timestamp?: number;
}

export async function writeMetricPoint(pointData: MetricPoint): Promise<void> {
  if (!writeApi || !influxAvailable) return;
  try {
    const point = new Point(pointData.metric)
      .tag('runId', pointData.runId)
      .floatField('value', pointData.value);

    if (pointData.tags) {
      for (const [k, v] of Object.entries(pointData.tags)) {
        point.tag(k, String(v));
      }
    }

    if (pointData.timestamp) {
      point.timestamp(new Date(pointData.timestamp));
    }

    writeApi.writePoint(point);
  } catch (err) {
    // Ignore time-series write errors to protect main execution
  }
}

export async function flushMetrics(): Promise<void> {
  if (writeApi) {
    try {
      await writeApi.flush();
    } catch {
      // ignore
    }
  }
}
