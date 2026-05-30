import { useEffect, useState } from 'react';

export function TitleBar() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    let mounted = true;

    void window.liteWinTerminal.window.isMaximized().then((value) => {
      if (mounted) {
        setMaximized(value);
      }
    });

    const unsubscribe = window.liteWinTerminal.window.onMaximizeChange((value) => {
      setMaximized(value);
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  return (
    <div className="drag-region flex h-11 shrink-0 items-center justify-between border-b border-cyber-border bg-[#111418] px-3 select-none">
      <div className="flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-cyber-text-dim font-rajdhani">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-sm border border-cyber-accent/40 text-cyber-accent">
          WT
        </span>
        <span className="text-cyber-text">cmux Windows</span>
        <span className="text-cyber-text-dim/50">Desktop</span>
      </div>

      <div className="no-drag flex items-center">
        <button
          onClick={() => window.liteWinTerminal.window.minimize()}
          className="flex h-11 w-11 items-center justify-center text-cyber-text-dim transition-colors hover:bg-cyber-panel hover:text-cyber-text"
          aria-label="Minimize"
          title="Minimize"
        >
          _
        </button>
        <button
          onClick={() => window.liteWinTerminal.window.maximize()}
          className="flex h-11 w-11 items-center justify-center text-cyber-text-dim transition-colors hover:bg-cyber-panel hover:text-cyber-text"
          aria-label={maximized ? 'Restore' : 'Maximize'}
          title={maximized ? 'Restore' : 'Maximize'}
        >
          {maximized ? '[]' : '[ ]'}
        </button>
        <button
          onClick={() => window.liteWinTerminal.window.close()}
          className="flex h-11 w-11 items-center justify-center text-cyber-text-dim transition-colors hover:bg-cyber-alert/80 hover:text-cyber-bg"
          aria-label="Close"
          title="Close"
        >
          X
        </button>
      </div>
    </div>
  );
}
