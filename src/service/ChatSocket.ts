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

  constructor(cfg?: Partial<Cfg>) {
    this.cfg = { autoReconnect: true, pingIntervalMs: 20000, ...cfg };
  }

  connect(token: string, onMessage: (data: unknown) => void, onState?: (s: SocketState) => void) {
    this.token = token;
    this.onMessage = onMessage;
    if (onState) this.onState = onState;

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const url = `${wsUrlFromHttpBase()}?token=${encodeURIComponent(token)}`;
    this.onState('connecting');
    
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.onState('open');
      this.startPing();
    };

    this.ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data as string);
        if (data.type === 'pong') return; 
        this.onMessage(data);
      } catch {
        this.onMessage(ev.data);
      }
    };

    this.ws.onerror = () => {
      this.onState('error');
    };

    this.ws.onclose = () => {
      this.onState('closed');
      this.stopPing();
      if (this.cfg.autoReconnect && this.token) {
        clearTimeout(this.timers.reconnect);
        this.timers.reconnect = setTimeout(
          () => this.connect(this.token!, this.onMessage, this.onState),
          2000 
        );
      }
    };
  }

  disconnect() {
    this.cfg.autoReconnect = false;
    this.stopPing();
    clearTimeout(this.timers.reconnect);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  sendMessage(toUserId: string, content: string, chatId?: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('ChatSocket: Envío bloqueado, socket no conectado.');
      return;
    }
    const payload: any = { toUserId, content };
    if (chatId) payload.chatId = chatId;
    try {
      this.ws.send(JSON.stringify(payload));
    } catch (e) {
      console.error('ChatSocket: Error al enviar mensaje', e);
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

  private stopPing() {
    clearInterval(this.timers.ping);
  }
}