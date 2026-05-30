import { useEffect, useRef } from 'react';
import type { StreamMessage } from '@shared/types';
import { liteWinTerminalClient } from '../api/client';

export function useIPCStream(onEvent: (message: StreamMessage) => void): void {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    return liteWinTerminalClient.stream.onEvent((message) => {
      handlerRef.current(message);
    });
  }, []);
}
