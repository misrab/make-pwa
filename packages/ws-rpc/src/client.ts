export type ConnectionStatus = "connecting" | "open" | "closed";

export interface WsRpcResponse {
  type: "response";
  id?: string;
  command: string;
  success: boolean;
  error?: string;
  data?: unknown;
}

export interface WsRpcOptions {
  /** Full WebSocket URL (re-evaluated on each connect/reconnect). */
  getUrl: () => string;
  reconnectMinMs?: number;
  reconnectMaxMs?: number;
  requestTimeoutMs?: number;
}

type EventHandler<TEvent> = (event: TEvent) => void;
type StatusHandler = (status: ConnectionStatus) => void;

const DEFAULT_RECONNECT_MIN_MS = 1500;
const DEFAULT_RECONNECT_MAX_MS = 30_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

/**
 * Generic reconnecting WebSocket-RPC client.
 *
 * - Exponential backoff on unexpected close.
 * - Immediate reconnect on visibilitychange → visible and window "online"
 *   (critical for mobile PWAs where backgrounding freezes JS).
 * - Correlates `{ type: "response", id }` messages to pending requests.
 * - All other JSON messages are delivered to onMessage handlers.
 */
export class WsRpcClient<TCommand extends { type: string; id?: string } = { type: string; id?: string }, TEvent = unknown> {
  private ws: WebSocket | null = null;
  private seq = 0;
  private pending = new Map<string, (res: WsRpcResponse) => void>();
  private messageHandlers = new Set<EventHandler<TEvent>>();
  private statusHandlers = new Set<StatusHandler>();
  private reconnectTimer: number | null = null;
  private reconnectAttempts = 0;
  private shouldReconnect = true;
  private readonly reconnectMinMs: number;
  private readonly reconnectMaxMs: number;
  private readonly requestTimeoutMs: number;

  constructor(private readonly opts: WsRpcOptions) {
    this.reconnectMinMs = opts.reconnectMinMs ?? DEFAULT_RECONNECT_MIN_MS;
    this.reconnectMaxMs = opts.reconnectMaxMs ?? DEFAULT_RECONNECT_MAX_MS;
    this.requestTimeoutMs = opts.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  }

  connect(): void {
    this.shouldReconnect = true;
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    window.addEventListener("online", this.onOnline);
    this.open();
  }

  close(): void {
    this.shouldReconnect = false;
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    window.removeEventListener("online", this.onOnline);
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
  }

  /** Force a reconnect with a fresh URL (e.g. after switching session id). */
  reconnect(): void {
    this.shouldReconnect = true;
    this.reconnectAttempts = 0;
    const old = this.ws;
    this.ws = null;
    if (old) {
      old.onclose = null;
      old.close();
    }
    this.open();
  }

  send(cmd: TCommand): void {
    this.ws?.send(JSON.stringify(cmd));
  }

  request<T = unknown>(cmd: TCommand, timeoutMs = this.requestTimeoutMs): Promise<WsRpcResponse & { data?: T }> {
    const id = `r${++this.seq}`;
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`rpc timeout: ${cmd.type}`));
      }, timeoutMs);

      this.pending.set(id, (res) => {
        clearTimeout(timer);
        resolve(res as WsRpcResponse & { data?: T });
      });
      this.ws?.send(JSON.stringify({ ...cmd, id }));
    });
  }

  onMessage(handler: EventHandler<TEvent>): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onStatus(handler: StatusHandler): () => void {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  private onVisibilityChange = (): void => {
    if (document.visibilityState === "visible") this.checkAndReconnect();
  };

  private onOnline = (): void => {
    this.checkAndReconnect();
  };

  private checkAndReconnect(): void {
    if (!this.shouldReconnect) return;
    if (this.ws?.readyState === WebSocket.OPEN) return;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;
    this.open();
  }

  private open(): void {
    this.setStatus("connecting");
    const ws = new WebSocket(this.opts.getUrl());
    this.ws = ws;

    ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.setStatus("open");
    };
    ws.onclose = () => {
      this.setStatus("closed");
      this.rejectAllPending();
      if (this.shouldReconnect) {
        const delay = Math.min(this.reconnectMinMs * 2 ** this.reconnectAttempts++, this.reconnectMaxMs);
        this.reconnectTimer = window.setTimeout(() => this.open(), delay);
      }
    };
    ws.onerror = () => ws.close();
    ws.onmessage = (e) => this.onRawMessage(String(e.data));
  }

  private onRawMessage(raw: string): void {
    let msg: unknown;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (typeof msg === "object" && msg !== null && (msg as { type?: string }).type === "response") {
      const res = msg as WsRpcResponse;
      if (res.id && this.pending.has(res.id)) {
        this.pending.get(res.id)!(res);
        this.pending.delete(res.id);
      }
      return;
    }

    for (const h of this.messageHandlers) h(msg as TEvent);
  }

  private setStatus(status: ConnectionStatus): void {
    for (const h of this.statusHandlers) h(status);
  }

  private rejectAllPending(): void {
    for (const resolve of this.pending.values()) {
      resolve({ type: "response", command: "_disconnect", success: false, error: "disconnected" });
    }
    this.pending.clear();
  }
}
