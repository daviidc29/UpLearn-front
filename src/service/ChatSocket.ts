import { wsUrlFromHttpBase } from './Api-chat';

export type SocketState = 'connecting' | 'open' | 'closed' | 'error';

type Cfg = {
  autoReconnect: boolean;
  pingIntervalMs: number;
};

export class ChatSocket {
  private ws: WebSocket | null = null;
  private token: string | null = null;
  private onMessage: (data: unknown) => void = () => {};
  private onState: (s: SocketState) => void = () => {};
  private readonly timers = { ping: 0 as any, reconnect: 0 as any };
  private readonly cfg: Cfg;
  private outbox: any[] = []; // ⬅️ cola

  constructor(cfg?: Partial<Cfg>) {
    this.cfg = { autoReconnect: true, pingIntervalMs: 20000, ...cfg };
  }

  connect(token: string, onMessage: (data: unknown) => void, onState?: (s: SocketState) => void) {
    this.token = token;
    this.onMessage = onMessage;
    this.onState = onState || this.onState;

    const url = `${wsUrlFromHttpBase()}?token=${encodeURIComponent(token)}`;
    this.onState('connecting');
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.onState('open');
      // flush cola
      for (const item of this.outbox.splice(0)) {
        try { this.ws?.send(JSON.stringify(item)); } catch { /* ignore */ }
      }
      this.startPing();
    };

    this.ws.onmessage = (ev) => {
      try { this.onMessage(JSON.parse(ev.data as string)); }
      catch { this.onMessage(ev.data); }
    };

    this.ws.onerror = () => { this.onState('error'); };

    this.ws.onclose = () => {
      this.onState('closed');
      this.stopPing();
      if (this.cfg.autoReconnect && this.token) {
        clearTimeout(this.timers.reconnect);
        this.timers.reconnect = setTimeout(
          () => this.connect(this.token!, this.onMessage, this.onState),
          1200
        );
      }
    };
  }

  disconnect() {
    this.cfg.autoReconnect = false;
    this.stopPing();
    try { this.ws?.close(); } catch {}
    this.ws = null;
    this.outbox = [];
  }

  sendMessage(toUserId: string, content: string, chatId?: string) {
    const payload: any = { toUserId, content };
    if (chatId) payload.chatId = chatId;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    } else {
      this.outbox.push(payload); // ⬅️ se enviará al abrir
    }
  }

  private startPing() {
    this.stopPing();
    this.timers.ping = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping', ts: Date.now() }));
      }
    }, this.cfg.pingIntervalMs);
  }
  private stopPing() { clearInterval(this.timers.ping); }
}
