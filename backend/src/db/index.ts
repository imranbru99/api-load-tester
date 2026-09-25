import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/api_load_tester',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export async function initDatabase(): Promise<void> {
  const client = await pool.connect();
  try {
    const initSqlPath = path.join(__dirname, 'init.sql');
    if (fs.existsSync(initSqlPath)) {
      const sql = fs.readFileSync(initSqlPath, 'utf8');
      await client.query(sql);
      console.log('[DB] Database tables initialized successfully.');
    }
  } catch (err) {
    console.error('[DB] Warning: Failed to run init.sql on DB connect:', err);
  } finally {
    client.release();
  }
}

export default pool;
