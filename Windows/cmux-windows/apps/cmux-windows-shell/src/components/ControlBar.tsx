import { useState } from 'react';
import { liteWinTerminalClient } from '../api/client';

interface Props {
  paneId: number | null;
  windowHandle: number | null;
  onSendInput: (paneId: number, text: string, window?: number) => void;
  onAfterSplit?: () => void;
}

export function ControlBar({ paneId, windowHandle, onSendInput, onAfterSplit }: Props) {
  const [input, setInput] = useState('');

  const send = () => {
    if (paneId === null || !input) return;
    onSendInput(paneId, input + '{ENTER}', windowHandle ?? undefined);
    setInput('');
  };

  const splitPane = async (direction: string) => {
    await liteWinTerminalClient.terminal.splitPane({ direction, window: windowHandle ?? undefined, pane_id: paneId });
    onAfterSplit?.();
  };

  return (
    <div className="flex gap-3 items-center cyber-panel p-2">
      <input
        type="text"
        value={input}
        onChange={(event) => setInput(event.target.value)}
        onKeyDown={(event) => event.key === 'Enter' && send()}
        placeholder={paneId !== null ? 'ENTER COMMAND...' : 'AWAITING NODE SELECTION'}
        disabled={paneId === null}
        className="flex-1 cyber-input px-4 py-2 text-sm disabled:opacity-50 placeholder-cyber-text-dim/40 tracking-wider"
      />
      <button onClick={send} disabled={paneId === null} className="cyber-button cyber-button-primary px-8 py-2.5 disabled:opacity-50">
        EXECUTE
      </button>
      <div className="w-px h-8 bg-cyber-border-highlight mx-1" />
      <button onClick={() => void splitPane('vertical')} className="cyber-button px-4 py-2">
        SPLIT V
      </button>
      <button onClick={() => void splitPane('horizontal')} className="cyber-button px-4 py-2">
        SPLIT H
      </button>
    </div>
  );
}
