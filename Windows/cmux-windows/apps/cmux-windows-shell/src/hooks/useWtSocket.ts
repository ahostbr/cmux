import { useCallback, useEffect, useRef, useState } from 'react';
import type { StreamMessage, WtPane, WtShell, WtState, WtWindow } from '@shared/types';
import { liteWinTerminalClient } from '../api/client';
import { useIPCStream } from './useIPCStream';

export type { WtPane, WtShell, WtState, WtWindow };

type MessageHandler = (msg: StreamMessage) => void;

export function useWtSocket() {
  const [state, setState] = useState<WtState | null>(null);
  const [connected, setConnected] = useState(false);
  const handlersRef = useRef<Set<MessageHandler>>(new Set());

  const refresh = useCallback(async () => {
    try {
      const data = await liteWinTerminalClient.terminal.listPanes();
      setState(data);
    } catch {
      // ignore - next refresh or stream event will recover
    }
  }, []);

  useEffect(() => {
    setConnected(true);
    void refresh();
    return () => {
      setConnected(false);
    };
  }, [refresh]);

  useIPCStream((message: StreamMessage) => {
    if (message.type === 'state') {
      setState(message.data);
    }
    for (const handler of handlersRef.current) {
      handler(message);
    }
  });

  const onMessage = useCallback((handler: MessageHandler) => {
    handlersRef.current.add(handler);
    return () => {
      handlersRef.current.delete(handler);
    };
  }, []);

  const sendInput = useCallback(async (paneId: number, text: string, windowHandle?: number) => {
    await liteWinTerminalClient.terminal.sendInput({ paneId, text, window: windowHandle });
  }, []);

  return { state, connected, sendInput, refresh, onMessage };
}
