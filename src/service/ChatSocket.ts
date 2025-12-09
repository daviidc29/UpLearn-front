import { ENV } from '../utils/env';

const CHAT_WS_BASE = (((ENV as any).CHAT_API_BASE) || 'https://chats-cbh7cgfxa4ceahde.canadacentral-01.azurewebsites.net')
  .replace(/^http/, 'ws')
  .replace(/\/$/, '');

export type State = 'connecting' | 'open' | 'closed' | 'error';
export type OnMessage = (event: MessageEvent) => void;
export type OnState = (state: State) => void;

const isProbablyJwt = (t?: string) =>
  !!t && typeof t === 'string' && t.split('.').length >= 3 && t.trim().length > 20;

type Opts = {
  idleTimeoutMs?: number;   
  pingIntervalMs?: number;  
  autoReconnect?: boolean;  
};

export class ChatSocket {
  private ws: WebSocket | null = null;
  private onMessageCb: OnMessage | null = null;
  private onStateCb: OnState | null = null;

  private outbox: string[] = [];
  private lastUrl: string | null = null;
  private token: string | null = null;

  private readonly opts: Required<Opts>;
  private pingTimer: any = null;
  private idleCheckTimer: any = null;
  private reconnectTimer: any = null;
  private reconnectAttempts = 0;
  private shouldReconnect = true;
  private closedByClient = false;

  private lastRealActivityTs = Date.now();

  constructor(opts?: Opts) {
    this.opts = {
      idleTimeoutMs: opts?.idleTimeoutMs ?? 25_000,
      pingIntervalMs: opts?.pingIntervalMs ?? 20_000,
      autoReconnect: opts?.autoReconnect ?? true,
    };
  }

  private urlFor(token: string) {
    return `${CHAT_WS_BASE}/ws/chat?token=${encodeURIComponent(token)}`;
  }

  private clearTimers() {
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
    if (this.idleCheckTimer) { clearInterval(this.idleCheckTimer); this.idleCheckTimer = null; }
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
  }

  private startHeartbeat() {
    this.pingTimer = setInterval(() => {
      try {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: 'ping', ts: Date.now() }));
        }
      } catch { /* no-op */ }
    }, this.opts.pingIntervalMs);

    this.idleCheckTimer = setInterval(() => {
      const idleFor = Date.now() - this.lastRealActivityTs;
      if (idleFor > this.opts.idleTimeoutMs) {
        try { this.ws?.close(1000, 'idle timeout'); } catch {}
      }
    }, Math.min(5_000, this.opts.idleTimeoutMs / 2));
  }

  private markRealActivity() {
    this.lastRealActivityTs = Date.now();
  }

  private scheduleReconnect() {
    if (!this.shouldReconnect || !this.opts.autoReconnect || !this.token) return;
    const base = 400 * Math.pow(2, this.reconnectAttempts);
    const delay = Math.min(8_000, base) + Math.floor(Math.random() * 300);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      if (!this.token) return;
      this.open(this.token);
    }, delay);
  }

  private wire(ws: WebSocket) {
    this.onStateCb?.('connecting');

    ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.onStateCb?.('open');
      this.startHeartbeat();
      if (this.outbox.length) {
        for (const p of this.outbox) { try { ws.send(p); } catch {} }
        this.outbox = [];
      }
    };

    ws.onmessage = (ev) => {
      try {
        const payload = typeof ev.data === 'string' ? JSON.parse(ev.data) : null;
        if (!payload || (payload.type !== 'pong' && payload.type !== 'ping')) {
          this.markRealActivity();
        }
      } catch {
        this.markRealActivity();
      }
      this.onMessageCb?.(ev);
    };

    ws.onerror = () => {
      this.onStateCb?.('error');
    };

    ws.onclose = (e) => {
      this.clearTimers();
      this.onStateCb?.('closed');
      this.ws = null;
      this.lastUrl = null;

      const normal = e.code === 1000 || e.code === 1001;
      if (!this.closedByClient && !normal) {
        this.scheduleReconnect();
      }
    };
  }

  private open(token: string) {
    const url = this.urlFor(token);
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) && this.lastUrl === url) {
      return;
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.lastUrl !== url) {
      try { this.ws.close(1000, 'switch transport'); } catch {}
    }
    this.closedByClient = false;
    this.shouldReconnect = true;

    const ws = new WebSocket(url);
    this.ws = ws;
    this.lastUrl = url;
    this.wire(ws);
  }

  connect(token: string, onMessage: OnMessage, onState: OnState) {
    if (!isProbablyJwt(token)) return;
    this.token = token;
    this.onMessageCb = onMessage;
    this.onStateCb  = onState;
    this.markRealActivity();
    this.open(token);
  }

  /** Encola si no está OPEN; reconcilia la actividad real al enviar */
  sendMessage(toUserId: string, content: string) {
    const payload = JSON.stringify({ toUserId, content });
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(payload);
      this.markRealActivity();
    } else {
      this.outbox.push(payload);
      if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
        this.scheduleReconnect();
      }
    }
  }

  disconnect() {
    this.shouldReconnect = false;
    this.closedByClient = true;
    this.clearTimers();
    if (this.ws) {
      try { if (this.ws.readyState !== WebSocket.CLOSED) this.ws.close(1000, 'client closing'); } catch {}
    }
    this.ws = null;
    this.lastUrl = null;
    this.outbox = [];
  }

  isConnected(): boolean {
    return !!this.ws && this.ws.readyState === WebSocket.OPEN;
  }
}
