import { wsUrlFromHttpBase } from './Api-chat';

export type SocketState = 'connecting' | 'open' | 'closed' | 'error';

type Cfg = {
  autoReconnect: boolean;
  pingIntervalMs: number;
  maxOutbox: number;
  maxReconnectDelayMs: number;
};

type MsgListener = (data: any) => void;
type StateListener = (s: SocketState) => void;

export class ChatSocket {
  private ws: WebSocket | null = null;
  private token: string | null = null;

  private readonly listeners = new Set<MsgListener>();
  private readonly stateListeners = new Set<StateListener>();

  private state: SocketState = 'closed';
  private manualClose = false;

  private reconnectAttempt = 0;
  private readonly timers = { ping: 0 as any, reconnect: 0 as any };

  private outbox: string[] = [];
  private readonly cfg: Cfg;

  constructor(cfg?: Partial<Cfg>) {
    this.cfg = {
      autoReconnect: true,
      pingIntervalMs: 20000,
      maxOutbox: 200,
      maxReconnectDelayMs: 8000,
      ...cfg,
    };
  }

  connect(token: string) {
    const tokenChanged = this.token && this.token !== token;
    this.token = token;
    this.manualClose = false;

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      if (tokenChanged) this.ws.close(); 
      return;
    }

    this.openSocket();
  }

  disconnect() {
    this.manualClose = true;
    this.stopPing();
    clearTimeout(this.timers.reconnect);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setState('closed');
  }

  subscribe(onMessage: MsgListener) {
    this.listeners.add(onMessage);
    return () => this.listeners.delete(onMessage);
  }

  onState(onState: StateListener) {
    this.stateListeners.add(onState);
    onState(this.state);
    return () => this.stateListeners.delete(onState);
  }

  isOpen() {
    return !!this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  sendMessage(toUserId: string, content: string, chatId: string, clientMessageId?: string) {

    const payload: any = { toUserId, content, chatId };
    if (clientMessageId) payload.clientMessageId = clientMessageId;

    this.sendRaw(payload);
  }

  private sendRaw(payload: any) {
    const raw = JSON.stringify(payload);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(raw);
      } catch {
        this.enqueue(raw);
      }
      return;
    }
    this.enqueue(raw);
  }

  private enqueue(raw: string) {
    if (this.outbox.length >= this.cfg.maxOutbox) this.outbox.shift();
    this.outbox.push(raw);
  }

  private flushOutbox() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    while (this.outbox.length) {
      const raw = this.outbox.shift()!;
      this.ws.send(raw);
    }
  }

  private openSocket() {
    if (!this.token) return;

    clearTimeout(this.timers.reconnect);

    const url = `${wsUrlFromHttpBase()}?token=${encodeURIComponent(this.token)}`;
    this.setState('connecting');

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.reconnectAttempt = 0;
      this.setState('open');
      this.startPing();
      this.flushOutbox();
    };

    this.ws.onmessage = (ev) => {
      const data = this.safeParse(ev.data);
      if (data?.type === 'pong') return;
      Array.from(this.listeners).forEach(fn => fn(data));
    };

    this.ws.onerror = () => {
      this.setState('error');
    };

    this.ws.onclose = () => {
      this.stopPing();
      this.ws = null;
      this.setState('closed');

      if (!this.manualClose && this.cfg.autoReconnect && this.token) {
        this.scheduleReconnect();
      }
    };
  }

  private scheduleReconnect() {
    const base = Math.min(500 * Math.pow(2, this.reconnectAttempt++), this.cfg.maxReconnectDelayMs);
    const jitter = Math.floor(Math.random() * 200);
    const delay = base + jitter;

    clearTimeout(this.timers.reconnect);
    this.timers.reconnect = setTimeout(() => this.openSocket(), delay);
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

  private setState(s: SocketState) {
    this.state = s;
    this.stateListeners.forEach(fn => fn(s));
  }

  private safeParse(raw: any) {
    try {
      if (typeof raw === 'string') return JSON.parse(raw);
      return raw;
    } catch {
      return raw;
    }
  }
}
