import axios from 'axios';
import pool from '../db';

export interface WebhookConfig {
  type: 'slack' | 'discord' | 'generic';
  url: string;
  secret?: string;
  onFailureOnly?: boolean;
}

export async function dispatchWebhooks(runId: string, runSummary: any): Promise<void> {
  try {
    // Check if the run has associated schedules or workspace webhooks
    const runRes = await pool.query(
      `SELECT tr.*, c.name as collection_name FROM test_runs tr
       LEFT JOIN collections c ON tr.collection_id = c.id
       WHERE tr.id = $1`,
      [runId]
    );

    if (runRes.rows.length === 0) return;
    const run = runRes.rows[0];
    const passed = run.status === 'completed' && run.threshold_passed !== false;

    // Check webhooks from schedules table
    const schedRes = await pool.query(
      `SELECT webhooks FROM schedules WHERE collection_id = $1 AND is_active = true`,
      [run.collection_id]
    );

    const webhookList: WebhookConfig[] = [];
    for (const r of schedRes.rows) {
      if (Array.isArray(r.webhooks)) {
        webhookList.push(...r.webhooks);
      }
    }

    // Default global webhook if set via env
    if (process.env.DEFAULT_WEBHOOK_URL) {
      webhookList.push({
        type: (process.env.DEFAULT_WEBHOOK_TYPE as any) || 'generic',
        url: process.env.DEFAULT_WEBHOOK_URL,
      });
    }

    for (const wh of webhookList) {
      if (wh.onFailureOnly && passed) continue;

      try {
        if (wh.type === 'slack') {
          await axios.post(wh.url, {
            text: `*API Load Tester Run Alert*: ${run.name || 'Test Run'}`,
            attachments: [
              {
                color: passed ? '#10b981' : '#ef4444',
                fields: [
                  { title: 'Status', value: passed ? 'PASSED ✅' : 'FAILED ❌', short: true },
                  { title: 'Type', value: run.type, short: true },
                  { title: 'Requests', value: String(runSummary.totalRequests || 0), short: true },
                  { title: 'Avg RPS', value: String(runSummary.avgRps || 0), short: true },
                  { title: 'p95 Latency', value: `${runSummary.p95Ms || 0}ms`, short: true },
                  { title: 'Error Rate', value: `${runSummary.errorRatePercent || 0}%`, short: true },
                ],
              },
            ],
          });
        } else if (wh.type === 'discord') {
          await axios.post(wh.url, {
            content: `**API Load Tester**: ${run.name || 'Test Run'} finished with status: **${passed ? 'PASSED ✅' : 'FAILED ❌'}**`,
            embeds: [
              {
                title: run.name,
                color: passed ? 0x10b981 : 0xef4444,
                fields: [
                  { name: 'Total Requests', value: String(runSummary.totalRequests || 0), inline: true },
                  { name: 'p95 Latency', value: `${runSummary.p95Ms || 0}ms`, inline: true },
                  { name: 'Error Rate', value: `${runSummary.errorRatePercent || 0}%`, inline: true },
                ],
              },
            ],
          });
        } else {
          // Generic webhook
          await axios.post(wh.url, {
            event: 'run_completed',
            runId,
            passed,
            summary: runSummary,
            timestamp: new Date().toISOString(),
          }, {
            headers: wh.secret ? { 'X-ALT-Signature': wh.secret } : undefined
          });
        }
      } catch (err: any) {
        console.warn(`[Webhooks] Failed delivering webhook to ${wh.url}:`, err.message);
      }
    }
  } catch (err: any) {
    console.warn(`[Webhooks] Error processing webhooks for run ${runId}:`, err.message);
  }
}
