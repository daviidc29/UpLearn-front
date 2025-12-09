import { ENV } from '../utils/env';

const CHAT_WS_BASE = (((ENV as any).CHAT_API_BASE) || 'https://chats-cbh7cgfxa4ceahde.canadacentral-01.azurewebsites.net')
  .replace(/^http/, 'ws')
  .replace(/\/$/, '');

export type State = 'connecting' | 'open' | 'closed' | 'error';
export type OnMessage = (event: MessageEvent) => void;
export type OnState = (state: State) => void;


export class ChatSocket {
  private ws: WebSocket | null = null;
  private onMessageCb: OnMessage | null = null;
  private onStateCb: OnState | null = null;
  private outbox: string[] = [];
  private lastUrl: string | null = null;

  private idleTimer: any = null;
  private readonly idleTimeoutMs = 25_000;

  private markActivity() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      // cierra cortesmente solo si siguió inactivo
      try { this.ws?.close(1000, 'idle timeout'); } catch {}
    }, this.idleTimeoutMs);
  }

  connect(token: string, onMessage: OnMessage, onState: OnState) {
    this.onMessageCb = onMessage;
    this.onStateCb  = onState;

    const url = `${CHAT_WS_BASE}/ws/chat?token=${encodeURIComponent(token)}`;

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) && this.lastUrl === url) {
      return;
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.lastUrl !== url) {
      try { this.ws.close(1000, 'switch transport'); } catch {}
    }

    this.ws = new WebSocket(url);
    this.lastUrl = url;
    this.onStateCb?.('connecting');

    this.ws.onopen = () => {
      this.onStateCb?.('open');
      this.markActivity();
      if (this.outbox.length) {
        for (const p of this.outbox) { try { this.ws?.send(p); } catch {} }
        this.outbox = [];
      }
    };

    this.ws.onmessage = (ev) => {
      this.markActivity();
      this.onMessageCb?.(ev);
    };

    this.ws.onerror = () => {
      this.onStateCb?.('error');
    };

    this.ws.onclose = () => {
      if (this.idleTimer) { clearTimeout(this.idleTimer); this.idleTimer = null; }
      this.onStateCb?.('closed');
      this.ws = null;
      this.lastUrl = null;
    };
  }

  sendMessage(toUserId: string, content: string) {
    const payload = JSON.stringify({ toUserId, content });
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(payload);
      this.markActivity();
    } else {
      this.outbox.push(payload);
    }
  }

  disconnect() {
    if (this.idleTimer) { clearTimeout(this.idleTimer); this.idleTimer = null; }
    if (!this.ws) return;
    try { if (this.ws.readyState !== WebSocket.CLOSED) this.ws.close(1000, 'client closing'); } catch {}
    this.ws = null;
    this.lastUrl = null;
    this.outbox = [];
  }

  isConnected(): boolean {
    return !!this.ws && this.ws.readyState === WebSocket.OPEN;
  }
}
