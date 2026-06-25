const DEFAULT_RECONNECT_MIN_MS = 1500;
const DEFAULT_RECONNECT_MAX_MS = 30_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
/** Exponential backoff delay for a given (0-based) attempt, capped at maxMs. */
export function backoffDelay(attempt, minMs, maxMs) {
    return Math.min(minMs * 2 ** attempt, maxMs);
}
/**
 * Generic reconnecting WebSocket-RPC client.
 *
 * - Exponential backoff on unexpected close.
 * - Immediate reconnect on visibilitychange → visible and window "online"
 *   (critical for mobile PWAs where backgrounding freezes JS).
 * - Correlates `{ type: "response", id }` messages to pending requests.
 * - All other JSON messages are delivered to onMessage handlers.
 */
export class WsRpcClient {
    opts;
    ws = null;
    seq = 0;
    pending = new Map();
    messageHandlers = new Set();
    statusHandlers = new Set();
    reconnectTimer = null;
    reconnectAttempts = 0;
    shouldReconnect = true;
    reconnectMinMs;
    reconnectMaxMs;
    requestTimeoutMs;
    constructor(opts) {
        this.opts = opts;
        this.reconnectMinMs = opts.reconnectMinMs ?? DEFAULT_RECONNECT_MIN_MS;
        this.reconnectMaxMs = opts.reconnectMaxMs ?? DEFAULT_RECONNECT_MAX_MS;
        this.requestTimeoutMs = opts.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    }
    connect() {
        this.shouldReconnect = true;
        document.addEventListener("visibilitychange", this.onVisibilityChange);
        window.addEventListener("online", this.onOnline);
        this.open();
    }
    close() {
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
    reconnect() {
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
    send(cmd) {
        this.ws?.send(JSON.stringify(cmd));
    }
    request(cmd, timeoutMs = this.requestTimeoutMs) {
        const id = `r${++this.seq}`;
        return new Promise((resolve, reject) => {
            const timer = window.setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`rpc timeout: ${cmd.type}`));
            }, timeoutMs);
            this.pending.set(id, (res) => {
                clearTimeout(timer);
                resolve(res);
            });
            this.ws?.send(JSON.stringify({ ...cmd, id }));
        });
    }
    onMessage(handler) {
        this.messageHandlers.add(handler);
        return () => this.messageHandlers.delete(handler);
    }
    onStatus(handler) {
        this.statusHandlers.add(handler);
        return () => this.statusHandlers.delete(handler);
    }
    onVisibilityChange = () => {
        if (document.visibilityState === "visible")
            this.checkAndReconnect();
    };
    onOnline = () => {
        this.checkAndReconnect();
    };
    checkAndReconnect() {
        if (!this.shouldReconnect)
            return;
        if (this.ws?.readyState === WebSocket.OPEN)
            return;
        if (this.reconnectTimer !== null) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        this.reconnectAttempts = 0;
        this.open();
    }
    open() {
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
                const delay = backoffDelay(this.reconnectAttempts++, this.reconnectMinMs, this.reconnectMaxMs);
                this.reconnectTimer = window.setTimeout(() => this.open(), delay);
            }
        };
        ws.onerror = () => ws.close();
        ws.onmessage = (e) => this.onRawMessage(String(e.data));
    }
    onRawMessage(raw) {
        let msg;
        try {
            msg = JSON.parse(raw);
        }
        catch {
            return;
        }
        if (typeof msg === "object" && msg !== null && msg.type === "response") {
            const res = msg;
            if (res.id && this.pending.has(res.id)) {
                this.pending.get(res.id)(res);
                this.pending.delete(res.id);
            }
            return;
        }
        for (const h of this.messageHandlers)
            h(msg);
    }
    setStatus(status) {
        for (const h of this.statusHandlers)
            h(status);
    }
    rejectAllPending() {
        for (const resolve of this.pending.values()) {
            resolve({ type: "response", command: "_disconnect", success: false, error: "disconnected" });
        }
        this.pending.clear();
    }
}
