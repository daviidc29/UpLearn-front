import { ENV } from '../utils/env';

const CHAT_WS_BASE = (((ENV as any).CHAT_API_BASE) || 'http://localhost:8091')
  .replace(/^http/, 'ws')
  .replace(/\/$/, '');

export type State = 'connecting' | 'open' | 'closed' | 'error';
export type OnMessage = (event: MessageEvent) => void;
export type OnState = (state: State) => void;

/** WS cliente con anti-doble conexión, keep-alive y cierre seguro en CONNECTING. */
export class ChatSocket {
  private ws: WebSocket | null = null;
  private onMessageCb: OnMessage | null = null;
  private onStateCb: OnState | null = null;
  private keepAliveTimer: any = null;
  private outbox: string[] = [];
  private lastUrl: string | null = null;

  private wasEverOpen = false;
  private suppressClose = false;
  private cancelled = false;

  connect(token: string, onMessage: OnMessage, onState: OnState) {
    this.onMessageCb = onMessage;
    this.onStateCb = onState;

    const url = `${CHAT_WS_BASE}/ws/chat?token=${encodeURIComponent(token)}`;

    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) &&
      this.lastUrl === url
    ) {
      return; // ya conectando o abierto a la misma URL
    }

    // Si hay una conexión abierta a otra URL, ciérrala con cortesía
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.lastUrl !== url) {
      try { this.ws.close(1000, 'switch transport'); } catch { }
    }

    this.ws = new WebSocket(url);
    this.lastUrl = url;
    this.wasEverOpen = false;
    this.suppressClose = false;
    this.cancelled = false;

    this.onStateCb?.('connecting');

    this.ws.onopen = () => {
      this.wasEverOpen = true;
      if (this.cancelled) {
        // Si nos “cancelaron” durante CONNECTING, cerrar inmediatamente y sin logs
        try { this.ws?.close(1000, 'cancelled before open'); } catch { }
        return;
      }

      this.onStateCb?.('open');

      // Enviar pendientes
      if (this.outbox.length) {
        for (const p of this.outbox) {
          try { this.ws?.send(p); } catch { }
        }
        this.outbox = [];
      }

      // Keep-alive para proxies/firewalls
      this.keepAliveTimer = setInterval(() => {
        try { this.ws?.send(JSON.stringify({ type: 'ping', ts: Date.now() })); } catch { }
      }, 25000);
    };

    this.ws.onerror = () => {
      if (!this.cancelled) this.onStateCb?.('error');
    };

    this.ws.onclose = () => {
      if (!this.suppressClose) this.onStateCb?.('closed');
      if (this.keepAliveTimer) {
        clearInterval(this.keepAliveTimer);
        this.keepAliveTimer = setInterval(() => {
          try { this.ws?.send('ping'); } catch { }
        }, 25000);
      }
      this.ws = null;
      this.lastUrl = null;
      this.wasEverOpen = false;
      this.suppressClose = false;
    };

    this.ws.onmessage = (ev) => this.onMessageCb?.(ev);
  }

  /** Encola si OPEN aún no está listo. */
  sendMessage(toUserId: string, content: string) {
    const payload = JSON.stringify({ toUserId, content });
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(payload);
    } else {
      this.outbox.push(payload);
      console.warn('WebSocket no listo, mensaje encolado.');
    }
  }

  disconnect() {
    this.cancelled = true;

    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
    if (!this.ws) return;

    if (this.ws.readyState === WebSocket.CONNECTING) {
      this.suppressClose = true;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      const ws = this.ws;
      ws.onopen = () => { try { ws.close(1000, 'cancelled on open'); } catch { } };
      this.ws = null;
      this.lastUrl = null;
      this.outbox = [];
      return;
    }

    try {
      this.suppressClose = !this.wasEverOpen;
      if (this.ws.readyState !== WebSocket.CLOSED) {
        this.ws.close(1000, 'client closing');
      }
    } catch { }

    this.ws = null;
    this.lastUrl = null;
    this.outbox = [];
  }

  isConnected(): boolean {
    return !!this.ws && this.ws.readyState === WebSocket.OPEN;
  }
}