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
/** Exponential backoff delay for a given (0-based) attempt, capped at maxMs. */
export declare function backoffDelay(attempt: number, minMs: number, maxMs: number): number;
/**
 * Generic reconnecting WebSocket-RPC client.
 *
 * - Exponential backoff on unexpected close.
 * - Immediate reconnect on visibilitychange → visible and window "online"
 *   (critical for mobile PWAs where backgrounding freezes JS).
 * - Correlates `{ type: "response", id }` messages to pending requests.
 * - All other JSON messages are delivered to onMessage handlers.
 */
export declare class WsRpcClient<TCommand extends {
    type: string;
    id?: string;
} = {
    type: string;
    id?: string;
}, TEvent = unknown> {
    private readonly opts;
    private ws;
    private seq;
    private pending;
    private messageHandlers;
    private statusHandlers;
    private reconnectTimer;
    private reconnectAttempts;
    private shouldReconnect;
    private readonly reconnectMinMs;
    private readonly reconnectMaxMs;
    private readonly requestTimeoutMs;
    constructor(opts: WsRpcOptions);
    connect(): void;
    close(): void;
    /** Force a reconnect with a fresh URL (e.g. after switching session id). */
    reconnect(): void;
    send(cmd: TCommand): void;
    request<T = unknown>(cmd: TCommand, timeoutMs?: number): Promise<WsRpcResponse & {
        data?: T;
    }>;
    onMessage(handler: EventHandler<TEvent>): () => void;
    onStatus(handler: StatusHandler): () => void;
    private onVisibilityChange;
    private onOnline;
    private checkAndReconnect;
    private open;
    private onRawMessage;
    private setStatus;
    private rejectAllPending;
}
export {};
