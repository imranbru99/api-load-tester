import { WebSocketServer, WebSocket } from 'ws';
import { Server as HttpServer } from 'http';

export interface WSMessage {
  type: 'metrics' | 'log' | 'status' | 'subscribe' | 'unsubscribe' | 'worker_heartbeat';
  runId?: string;
  data: any;
  timestamp?: number;
}

class WebSocketHub {
  private wss: WebSocketServer | null = null;
  private clientSubscriptions: Map<WebSocket, Set<string>> = new Map();

  public init(server: HttpServer): void {
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (ws: WebSocket) => {
      this.clientSubscriptions.set(ws, new Set());

      ws.on('message', (raw: string) => {
        try {
          const msg = JSON.parse(raw.toString()) as WSMessage;
          this.handleClientMessage(ws, msg);
        } catch (err) {
          // ignore malformed
        }
      });

      ws.on('close', () => {
        this.clientSubscriptions.delete(ws);
      });

      ws.on('error', () => {
        this.clientSubscriptions.delete(ws);
      });

      // Send initial hello
      ws.send(JSON.stringify({
        type: 'status',
        data: { message: 'Connected to API Load Tester WebSocket Engine', version: '1.0.0' }
      }));
    });

    console.log('[WebSocketHub] Initialized on path /ws');
  }

  private handleClientMessage(ws: WebSocket, msg: WSMessage): void {
    const subs = this.clientSubscriptions.get(ws);
    if (!subs) return;

    if (msg.type === 'subscribe' && msg.runId) {
      subs.add(msg.runId);
      ws.send(JSON.stringify({
        type: 'status',
        runId: msg.runId,
        data: { subscribed: true, runId: msg.runId }
      }));
    } else if (msg.type === 'unsubscribe' && msg.runId) {
      subs.delete(msg.runId);
    }
  }

  public broadcastToRun(runId: string, message: WSMessage): void {
    if (!this.wss) return;
    const payload = JSON.stringify({
      ...message,
      runId,
      timestamp: message.timestamp || Date.now()
    });

    for (const [ws, subs] of this.clientSubscriptions.entries()) {
      if (ws.readyState === WebSocket.OPEN && (subs.has(runId) || subs.has('*'))) {
        ws.send(payload);
      }
    }
  }

  public broadcastGlobal(message: WSMessage): void {
    if (!this.wss) return;
    const payload = JSON.stringify({
      ...message,
      timestamp: message.timestamp || Date.now()
    });

    for (const ws of this.clientSubscriptions.keys()) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  }
}

export const wsHub = new WebSocketHub();
