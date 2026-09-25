import express from 'express';
import cors from 'cors';
import http from 'http';
import dotenv from 'dotenv';
import { apiRouter } from './api/routes';
import { handleMockRequest } from './mock/mockServer';
import { wsHub } from './websocket/hub';
import { initDatabase } from './db';
import { testScheduler } from './scheduler/cron';

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// REST API routes
app.use('/api', apiRouter);

// Dynamic Mock Server: /mock/:workspaceId/*
app.all('/mock/:workspaceId/*', handleMockRequest);

// Health check root
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'api-load-tester-backend', timestamp: new Date().toISOString() });
});

const server = http.createServer(app);

// Attach WebSocket Hub for live metrics and worker coordination
wsHub.init(server);

// Bootstrapping
async function bootstrap() {
  try {
    await initDatabase();
    await testScheduler.start();

    server.listen(port, () => {
      console.log(`=======================================================`);
      console.log(`  🚀 API Load Tester Backend Running on Port ${port}`);
      console.log(`  📡 WebSocket Stream Endpoint: ws://localhost:${port}/ws`);
      console.log(`  🎭 Mock Server Base: http://localhost:${port}/mock/:workspaceId/*`);
      console.log(`  📊 Prometheus Metrics: http://localhost:${port}/api/metrics`);
      console.log(`=======================================================`);
    });
  } catch (err) {
    console.error('[Backend] Bootstrap failed:', err);
    process.exit(1);
  }
}

bootstrap();

export default app;
