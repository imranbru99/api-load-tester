import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db';
import { runFunctionalCollection } from '../engine/functionalRunner';
import { loadOrchestrator } from '../load/orchestrator';
import { importPostmanCollection } from '../importers/postman';
import { importOpenApiSpec } from '../importers/openapi';
import { generateJUnitXml, generateHtmlReport } from '../exporters/reports';
import { register } from '../metrics/prometheus';
import { testScheduler } from '../scheduler/cron';

export const apiRouter = Router();

// ==========================================
// 1. HEALTH & METRICS
// ==========================================
apiRouter.get('/health', async (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'api-load-tester-backend',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

apiRouter.get('/metrics', async (_req: Request, res: Response) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// ==========================================
// 2. WORKSPACES
// ==========================================
apiRouter.get('/workspaces', async (_req: Request, res: Response) => {
  const result = await pool.query('SELECT * FROM workspaces ORDER BY created_at ASC');
  res.json(result.rows);
});

// ==========================================
// 3. ENVIRONMENTS
// ==========================================
apiRouter.get('/environments', async (req: Request, res: Response) => {
  const workspaceId = (req.query.workspaceId as string) || 'default';
  const result = await pool.query(
    'SELECT * FROM environments WHERE workspace_id = $1 ORDER BY created_at DESC',
    [workspaceId]
  );
  res.json(result.rows);
});

apiRouter.post('/environments', async (req: Request, res: Response) => {
  const { workspaceId = 'default', name, variables, isActive = false } = req.body;
  const id = uuidv4();
  const result = await pool.query(
    `INSERT INTO environments (id, workspace_id, name, variables, is_active)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [id, workspaceId, name || 'New Environment', JSON.stringify(variables || {}), isActive]
  );
  res.status(201).json(result.rows[0]);
});

apiRouter.put('/environments/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, variables, is_active } = req.body;
  const result = await pool.query(
    `UPDATE environments
     SET name = COALESCE($1, name),
         variables = COALESCE($2, variables),
         is_active = COALESCE($3, is_active),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $4 RETURNING *`,
    [name, variables ? JSON.stringify(variables) : null, is_active, id]
  );
  res.json(result.rows[0]);
});

apiRouter.delete('/environments/:id', async (req: Request, res: Response) => {
  await pool.query('DELETE FROM environments WHERE id = $1', [req.params.id]);
  res.json({ success: true });
});

// ==========================================
// 4. COLLECTIONS
// ==========================================
apiRouter.get('/collections', async (req: Request, res: Response) => {
  const workspaceId = (req.query.workspaceId as string) || 'default';
  const result = await pool.query(
    'SELECT id, workspace_id, name, description, created_at, updated_at FROM collections WHERE workspace_id = $1 ORDER BY updated_at DESC',
    [workspaceId]
  );
  res.json(result.rows);
});

apiRouter.get('/collections/:id', async (req: Request, res: Response) => {
  const result = await pool.query('SELECT * FROM collections WHERE id = $1', [req.params.id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Collection not found' });
  res.json(result.rows[0]);
});

apiRouter.post('/collections', async (req: Request, res: Response) => {
  const { workspaceId = 'default', name, description, data } = req.body;
  const id = uuidv4();
  const collectionData = data || { id, name: name || 'New Collection', items: [] };
  const result = await pool.query(
    `INSERT INTO collections (id, workspace_id, name, description, data)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [id, workspaceId, name || 'New Collection', description || '', JSON.stringify(collectionData)]
  );
  res.status(201).json(result.rows[0]);
});

apiRouter.put('/collections/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, description, data } = req.body;
  const result = await pool.query(
    `UPDATE collections
     SET name = COALESCE($1, name),
         description = COALESCE($2, description),
         data = COALESCE($3, data),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $4 RETURNING *`,
    [name, description, data ? JSON.stringify(data) : null, id]
  );
  res.json(result.rows[0]);
});

apiRouter.delete('/collections/:id', async (req: Request, res: Response) => {
  await pool.query('DELETE FROM collections WHERE id = $1', [req.params.id]);
  res.json({ success: true });
});

// ==========================================
// 5. TEST RUNS & EXECUTION
// ==========================================
apiRouter.get('/runs', async (req: Request, res: Response) => {
  const workspaceId = (req.query.workspaceId as string) || 'default';
  const type = req.query.type as string;
  let query = 'SELECT * FROM test_runs WHERE workspace_id = $1';
  const params: any[] = [workspaceId];

  if (type) {
    params.push(type);
    query += ` AND type = $2`;
  }
  query += ' ORDER BY started_at DESC LIMIT 50';

  const result = await pool.query(query, params);
  res.json(result.rows);
});

apiRouter.get('/runs/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const runRes = await pool.query('SELECT * FROM test_runs WHERE id = $1', [id]);
  if (runRes.rows.length === 0) return res.status(404).json({ error: 'Run not found' });

  const run = runRes.rows[0];
  const stepResults = await pool.query(
    'SELECT * FROM test_results WHERE run_id = $1 ORDER BY created_at ASC',
    [id]
  );

  res.json({
    ...run,
    results: stepResults.rows,
  });
});

// Run Functional Test
apiRouter.post('/runs/functional', async (req: Request, res: Response) => {
  const { workspaceId = 'default', collectionId, collectionData, environment, iterationData, parallel, name } = req.body;

  let colData = collectionData;
  let collectionName = name || 'Functional Test Run';

  if (collectionId) {
    const colRes = await pool.query('SELECT * FROM collections WHERE id = $1', [collectionId]);
    if (colRes.rows.length > 0) {
      colData = colRes.rows[0].data;
      collectionName = colRes.rows[0].name;
    }
  }

  if (!colData || !Array.isArray(colData.items)) {
    return res.status(400).json({ error: 'Valid collection data or collectionId is required' });
  }

  const runId = uuidv4();
  await pool.query(
    `INSERT INTO test_runs (id, workspace_id, collection_id, name, type, status, config)
     VALUES ($1, $2, $3, $4, 'functional', 'running', $5)`,
    [runId, workspaceId, collectionId || null, collectionName, JSON.stringify({ environment, iterationData, parallel })]
  );

  // Return runId immediately so client can stream or track, and execute asynchronously
  res.status(202).json({ runId, status: 'running' });

  // Execute in background
  (async () => {
    try {
      const report = await runFunctionalCollection(colData, runId, {
        environment,
        iterationData,
        parallel,
      });

      // Insert step results
      for (const step of report.results) {
        await pool.query(
          `INSERT INTO test_results (id, run_id, request_name, method, url, status_code, response_time_ms, passed, assertions, response_headers, response_body_sample, error_message, iteration)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [
            uuidv4(),
            runId,
            step.name,
            step.method,
            step.url,
            step.statusCode || null,
            step.responseTimeMs,
            step.passed,
            JSON.stringify(step.assertions),
            JSON.stringify(step.responseHeaders || {}),
            step.responseBodyPreview || null,
            step.error || null,
            step.iteration
          ]
        );
      }

      await pool.query(
        `UPDATE test_runs
         SET status = $1, summary = $2, threshold_passed = $3, completed_at = CURRENT_TIMESTAMP
         WHERE id = $4`,
        [report.success ? 'completed' : 'failed', JSON.stringify(report), report.success, runId]
      );
    } catch (err: any) {
      await pool.query(
        `UPDATE test_runs SET status = 'failed', error_message = $1, completed_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [err.message, runId]
      );
    }
  })();
});

// Run Load Test
apiRouter.post('/runs/load', async (req: Request, res: Response) => {
  const { workspaceId = 'default', collectionId, name, config } = req.body;

  if (!config || !config.targetUrl || !Array.isArray(config.stages) || config.stages.length === 0) {
    return res.status(400).json({
      error: 'Invalid load configuration. Must provide targetUrl and stages array [{duration, targetVUs}].'
    });
  }

  const runId = uuidv4();
  const runName = name || `Load Test - ${config.targetUrl}`;

  await pool.query(
    `INSERT INTO test_runs (id, workspace_id, collection_id, name, type, status, config, thresholds)
     VALUES ($1, $2, $3, $4, 'load', 'queued', $5, $6)`,
    [runId, workspaceId, collectionId || null, runName, JSON.stringify(config), JSON.stringify(config.thresholds || [])]
  );

  // Dispatch to load orchestrator
  await loadOrchestrator.startLoadTest(runId, config, workspaceId);

  res.status(202).json({
    runId,
    status: 'queued',
    message: 'Load test initialized and dispatched',
  });
});

// Stop a running run
apiRouter.post('/runs/:id/stop', async (req: Request, res: Response) => {
  const id = req.params.id as string;
  await loadOrchestrator.stopRun(id);
  res.json({ success: true, message: `Run ${id} cancelled` });
});

// Diff two runs side-by-side
apiRouter.get('/runs/compare/:runA/:runB', async (req: Request, res: Response) => {
  const runA = req.params.runA as string;
  const runB = req.params.runB as string;
  const resA = await pool.query('SELECT * FROM test_runs WHERE id = $1', [runA]);
  const resB = await pool.query('SELECT * FROM test_runs WHERE id = $1', [runB]);

  if (resA.rows.length === 0 || resB.rows.length === 0) {
    return res.status(404).json({ error: 'One or both runs not found' });
  }

  const a = resA.rows[0];
  const b = resB.rows[0];

  const diff = {
    runA: { id: a.id, name: a.name, type: a.type, status: a.status, summary: a.summary },
    runB: { id: b.id, name: b.name, type: b.type, status: b.status, summary: b.summary },
    metricsDiff: {
      rpsDelta: (b.summary?.avgRps || 0) - (a.summary?.avgRps || 0),
      p95Delta: (b.summary?.p95Ms || 0) - (a.summary?.p95Ms || 0),
      p99Delta: (b.summary?.p99Ms || 0) - (a.summary?.p99Ms || 0),
      errorRateDelta: (b.summary?.errorRatePercent || 0) - (a.summary?.errorRatePercent || 0),
      totalRequestsDelta: (b.summary?.totalRequests || 0) - (a.summary?.totalRequests || 0),
    }
  };

  res.json(diff);
});

// ==========================================
// 6. MOCK SERVER ENDPOINTS CRUD
// ==========================================
apiRouter.get('/mocks', async (req: Request, res: Response) => {
  const workspaceId = (req.query.workspaceId as string) || 'default';
  const result = await pool.query('SELECT * FROM mock_endpoints WHERE workspace_id = $1 ORDER BY created_at DESC', [workspaceId]);
  res.json(result.rows);
});

apiRouter.post('/mocks', async (req: Request, res: Response) => {
  const { workspaceId = 'default', name, method, path, statusCode = 200, headers, responseBody, delayMs = 0, isActive = true } = req.body;
  const id = uuidv4();
  const result = await pool.query(
    `INSERT INTO mock_endpoints (id, workspace_id, name, method, path, status_code, headers, response_body, delay_ms, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
    [id, workspaceId, name || `${method} ${path}`, method.toUpperCase(), path, statusCode, JSON.stringify(headers || { 'Content-Type': 'application/json' }), responseBody || '{"status":"ok"}', delayMs, isActive]
  );
  res.status(201).json(result.rows[0]);
});

apiRouter.put('/mocks/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, method, path, statusCode, headers, responseBody, delayMs, isActive } = req.body;
  const result = await pool.query(
    `UPDATE mock_endpoints
     SET name = COALESCE($1, name),
         method = COALESCE($2, method),
         path = COALESCE($3, path),
         status_code = COALESCE($4, status_code),
         headers = COALESCE($5, headers),
         response_body = COALESCE($6, response_body),
         delay_ms = COALESCE($7, delay_ms),
         is_active = COALESCE($8, is_active),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $9 RETURNING *`,
    [name, method?.toUpperCase(), path, statusCode, headers ? JSON.stringify(headers) : null, responseBody, delayMs, isActive, id]
  );
  res.json(result.rows[0]);
});

apiRouter.delete('/mocks/:id', async (req: Request, res: Response) => {
  await pool.query('DELETE FROM mock_endpoints WHERE id = $1', [req.params.id]);
  res.json({ success: true });
});

// ==========================================
// 7. SCHEDULES (CRON)
// ==========================================
apiRouter.get('/schedules', async (req: Request, res: Response) => {
  const workspaceId = (req.query.workspaceId as string) || 'default';
  const result = await pool.query('SELECT * FROM schedules WHERE workspace_id = $1 ORDER BY created_at DESC', [workspaceId]);
  res.json(result.rows);
});

apiRouter.post('/schedules', async (req: Request, res: Response) => {
  const { workspaceId = 'default', collectionId, name, cronExpression, type = 'functional', config = {}, webhooks = [], isActive = true } = req.body;
  const id = uuidv4();
  const result = await pool.query(
    `INSERT INTO schedules (id, workspace_id, collection_id, name, cron_expression, type, config, webhooks, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [id, workspaceId, collectionId, name, cronExpression, type, JSON.stringify(config), JSON.stringify(webhooks), isActive]
  );
  await testScheduler.refreshSchedules();
  res.status(201).json(result.rows[0]);
});

apiRouter.delete('/schedules/:id', async (req: Request, res: Response) => {
  await pool.query('DELETE FROM schedules WHERE id = $1', [req.params.id]);
  await testScheduler.refreshSchedules();
  res.json({ success: true });
});

// ==========================================
// 8. IMPORTERS (Postman & OpenAPI)
// ==========================================
apiRouter.post('/import/postman', async (req: Request, res: Response) => {
  const { workspaceId = 'default', postmanJson } = req.body;
  if (!postmanJson) return res.status(400).json({ error: 'postmanJson is required' });

  try {
    const collectionData = importPostmanCollection(postmanJson);
    const id = collectionData.id;
    const result = await pool.query(
      `INSERT INTO collections (id, workspace_id, name, description, data)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [id, workspaceId, collectionData.name, 'Imported from Postman Collection', JSON.stringify(collectionData)]
    );
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    res.status(400).json({ error: 'Failed to import Postman collection: ' + err.message });
  }
});

apiRouter.post('/import/openapi', async (req: Request, res: Response) => {
  const { workspaceId = 'default', spec } = req.body;
  if (!spec) return res.status(400).json({ error: 'OpenAPI specification is required' });

  try {
    const collectionData = importOpenApiSpec(spec);
    const id = collectionData.id;
    const result = await pool.query(
      `INSERT INTO collections (id, workspace_id, name, description, data)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [id, workspaceId, collectionData.name, 'Auto-generated from OpenAPI / Swagger spec', JSON.stringify(collectionData)]
    );
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    res.status(400).json({ error: 'Failed to import OpenAPI spec: ' + err.message });
  }
});

// ==========================================
// 9. EXPORTERS (JUnit, HTML, JSON)
// ==========================================
apiRouter.get('/export/:runId/junit', async (req: Request, res: Response) => {
  const { runId } = req.params;
  const runRes = await pool.query('SELECT * FROM test_runs WHERE id = $1', [runId]);
  if (runRes.rows.length === 0) return res.status(404).send('Run not found');

  const stepResults = await pool.query('SELECT * FROM test_results WHERE run_id = $1', [runId]);
  const runData = { ...runRes.rows[0], results: stepResults.rows };

  const xml = generateJUnitXml(runData);
  res.setHeader('Content-Type', 'application/xml');
  res.setHeader('Content-Disposition', `attachment; filename="junit-${runId}.xml"`);
  res.send(xml);
});

apiRouter.get('/export/:runId/html', async (req: Request, res: Response) => {
  const { runId } = req.params;
  const runRes = await pool.query('SELECT * FROM test_runs WHERE id = $1', [runId]);
  if (runRes.rows.length === 0) return res.status(404).send('Run not found');

  const stepResults = await pool.query('SELECT * FROM test_results WHERE run_id = $1', [runId]);
  const runData = { ...runRes.rows[0], results: stepResults.rows };

  const html = generateHtmlReport(runData);
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

apiRouter.get('/export/:runId/json', async (req: Request, res: Response) => {
  const { runId } = req.params;
  const runRes = await pool.query('SELECT * FROM test_runs WHERE id = $1', [runId]);
  if (runRes.rows.length === 0) return res.status(404).json({ error: 'Run not found' });

  const stepResults = await pool.query('SELECT * FROM test_results WHERE run_id = $1', [runId]);
  res.json({ ...runRes.rows[0], results: stepResults.rows });
});
