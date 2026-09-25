import cron from 'node-cron';
import pool from '../db';
import { runFunctionalCollection } from '../engine/functionalRunner';
import { loadOrchestrator } from '../load/orchestrator';
import { v4 as uuidv4 } from 'uuid';

class TestScheduler {
  private activeJobs: Map<string, cron.ScheduledTask> = new Map();

  public async start(): Promise<void> {
    console.log('[Scheduler] Initializing automated test scheduler...');
    await this.refreshSchedules();

    // Check for schedule changes every 60 seconds
    setInterval(() => {
      this.refreshSchedules();
    }, 60000);
  }

  public async refreshSchedules(): Promise<void> {
    try {
      const res = await pool.query(`SELECT * FROM schedules WHERE is_active = true`);
      const dbScheduleIds = new Set(res.rows.map(r => r.id));

      // Cancel removed jobs
      for (const [id, task] of this.activeJobs.entries()) {
        if (!dbScheduleIds.has(id)) {
          task.stop();
          this.activeJobs.delete(id);
          console.log(`[Scheduler] Removed cancelled schedule ${id}`);
        }
      }

      // Schedule or update active jobs
      for (const row of res.rows) {
        if (!this.activeJobs.has(row.id)) {
          if (!cron.validate(row.cron_expression)) {
            console.warn(`[Scheduler] Invalid cron expression: "${row.cron_expression}" for schedule ${row.id}`);
            continue;
          }

          const task = cron.schedule(row.cron_expression, async () => {
            await this.executeScheduledRun(row);
          });

          this.activeJobs.set(row.id, task);
          console.log(`[Scheduler] Scheduled job "${row.name}" with cron ${row.cron_expression}`);
        }
      }
    } catch (err: any) {
      console.warn('[Scheduler] Error refreshing schedules from DB:', err.message);
    }
  }

  private async executeScheduledRun(schedule: any): Promise<void> {
    const runId = uuidv4();
    console.log(`[Scheduler] Firing scheduled run ${runId} for "${schedule.name}"`);

    try {
      await pool.query(
        `UPDATE schedules SET last_run_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [schedule.id]
      );

      // Get collection data
      const colRes = await pool.query(
        `SELECT * FROM collections WHERE id = $1`,
        [schedule.collection_id]
      );

      if (colRes.rows.length === 0) {
        console.warn(`[Scheduler] Collection ${schedule.collection_id} not found for schedule ${schedule.id}`);
        return;
      }

      const collection = colRes.rows[0];

      if (schedule.type === 'load') {
        await pool.query(
          `INSERT INTO test_runs (id, workspace_id, collection_id, name, type, status, config)
           VALUES ($1, $2, $3, $4, 'load', 'queued', $5)`,
          [runId, schedule.workspace_id, schedule.collection_id, `[Scheduled] ${schedule.name}`, JSON.stringify(schedule.config)]
        );
        await loadOrchestrator.startLoadTest(runId, schedule.config, schedule.workspace_id);
      } else {
        await pool.query(
          `INSERT INTO test_runs (id, workspace_id, collection_id, name, type, status, config)
           VALUES ($1, $2, $3, $4, 'functional', 'running', $5)`,
          [runId, schedule.workspace_id, schedule.collection_id, `[Scheduled] ${schedule.name}`, JSON.stringify(schedule.config)]
        );

        const report = await runFunctionalCollection(collection.data, runId, schedule.config);

        await pool.query(
          `UPDATE test_runs SET status = $1, summary = $2, completed_at = CURRENT_TIMESTAMP WHERE id = $3`,
          [report.success ? 'completed' : 'failed', JSON.stringify(report), runId]
        );
      }
    } catch (err: any) {
      console.error(`[Scheduler] Execution error on schedule ${schedule.id}:`, err);
    }
  }
}

export const testScheduler = new TestScheduler();
