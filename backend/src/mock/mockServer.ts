import { Request, Response } from 'express';
import pool from '../db';

export async function handleMockRequest(req: Request, res: Response): Promise<void> {
  const { workspaceId } = req.params;
  const mockPath = '/' + (req.params[0] || '');
  const method = req.method.toUpperCase();

  try {
    // Look up mock endpoint in DB
    const result = await pool.query(
      `SELECT * FROM mock_endpoints
       WHERE workspace_id = $1 AND method = $2 AND is_active = true
         AND (path = $3 OR path = $4 OR path = '/*')
       ORDER BY CASE WHEN path = $3 THEN 1 WHEN path = $4 THEN 2 ELSE 3 END
       LIMIT 1`,
      [workspaceId, method, mockPath, mockPath.replace(/\/$/, '')]
    );

    if (result.rows.length === 0) {
      res.status(404).json({
        error: 'Mock endpoint not found',
        workspaceId,
        method,
        path: mockPath,
        tip: 'Configure this mock in the API Load Tester dashboard under Mocks.'
      });
      return;
    }

    const mock = result.rows[0];

    // Apply delay if configured
    if (mock.delay_ms && mock.delay_ms > 0) {
      await new Promise(r => setTimeout(r, Math.min(mock.delay_ms, 10000)));
    }

    // Set custom headers
    if (mock.headers && typeof mock.headers === 'object') {
      for (const [k, v] of Object.entries(mock.headers)) {
        res.setHeader(k, String(v));
      }
    }

    // Return response
    let responseData = mock.response_body;
    try {
      responseData = JSON.parse(mock.response_body);
    } catch {
      // return as text
    }

    res.status(mock.status_code || 200).send(responseData);
  } catch (err: any) {
    res.status(500).json({ error: 'Mock server internal error', details: err.message });
  }
}
