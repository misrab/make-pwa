import { useEffect, useState } from "react";
import type { ConnectionStatus, WsRpcClient } from "./client";

export interface UseWsRpcOptions<TCommand extends { type: string; id?: string }, TEvent> {
  client: WsRpcClient<TCommand, TEvent>;
  onMessage?: (event: TEvent) => void;
  onOpen?: () => void;
  autoConnect?: boolean;
}

/** React hook wiring a WsRpcClient's lifecycle + status into a component. */
export function useWsRpc<TCommand extends { type: string; id?: string }, TEvent>({
  client,
  onMessage,
  onOpen,
  autoConnect = true,
}: UseWsRpcOptions<TCommand, TEvent>): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>("connecting");

  useEffect(() => {
    const offMsg = onMessage ? client.onMessage(onMessage) : () => {};
    const offStatus = client.onStatus((s) => {
      setStatus(s);
      if (s === "open") onOpen?.();
    });
    if (autoConnect) client.connect();
    return () => {
      offMsg();
      offStatus();
      client.close();
    };
  }, [client, onMessage, onOpen, autoConnect]);

  return status;
}
