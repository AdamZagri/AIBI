// ניהול WebSocket, סטטוסים, רישום לקוחות
import { WebSocketServer } from 'ws';

const wsClients = new Map();

export function sendStatus(messageId, statusText, elapsedMs = null, data = null) {
  const ws = wsClients.get(messageId);
  if (ws && ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify({
      type: 'status',
      messageId,
      statusText,
      ...(elapsedMs !== null ? { elapsedMs } : {}),
      data: data !== null && data !== undefined ? data : 'NoInfo'
    }));
    console.log(`[WS] Sent status "${statusText}" to messageId=${messageId}`);
  }
}

export function initWebSocketServer(server) {
  const wss = new WebSocketServer({ server });
  wss.on('connection', (ws, req) => {
    ws.on('message', (msg) => {
      try {
        const data = JSON.parse(msg);
        if (data.type === 'register' && data.messageId) {
          wsClients.set(data.messageId, ws);
          console.log(`[WS] Registered client for messageId=${data.messageId}`);
        }
      } catch {}
    });
    ws.on('close', () => {
      for (const [id, client] of wsClients.entries()) {
        if (client === ws) wsClients.delete(id);
      }
    });
  });
  return wss;
} 