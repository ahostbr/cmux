import { useEffect, useState } from 'react';
import { liteWinTerminalClient } from '../api/client';

interface Layout {
  name: string;
  tabs: Array<{ profile: string; cwd: string }>;
}

export function LayoutManager() {
  const [layouts, setLayouts] = useState<Layout[]>([]);
  const [newName, setNewName] = useState('');

  const fetchLayouts = async () => {
    const data = await liteWinTerminalClient.layouts.list();
    setLayouts(data);
  };

  useEffect(() => {
    void fetchLayouts();
  }, []);

  const save = async () => {
    if (!newName) return;
    await liteWinTerminalClient.layouts.save(newName);
    setNewName('');
    await fetchLayouts();
  };

  const restore = async (name: string) => {
    await liteWinTerminalClient.layouts.restore(name);
  };

  const remove = async (name: string) => {
    await liteWinTerminalClient.layouts.delete(name);
    await fetchLayouts();
  };

  return (
    <div className="mt-8">
      <h2 className="text-sm text-cyber-accent tracking-widest border-b border-cyber-border-highlight pb-1 mb-3 font-rajdhani font-semibold">LAYOUT.MANAGER</h2>
      <div className="flex gap-2 mb-3">
        <input
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && void save()}
          placeholder="NEW_LAYOUT_NAME"
          className="flex-1 cyber-input px-3 py-1.5 text-xs uppercase"
        />
        <button onClick={() => void save()} className="cyber-button px-3 py-1.5">SAVE</button>
      </div>
      <div className="space-y-2">
        {layouts.map((layout) => (
          <div key={layout.name} className="flex items-center justify-between p-2 cyber-panel hover:border-cyber-accent/50 transition-colors">
            <span className="text-xs font-jetbrains text-cyber-text uppercase tracking-wider">{layout.name}</span>
            <div className="flex gap-1">
              <button onClick={() => void restore(layout.name)} className="cyber-button text-[10px] px-2 py-1">RESTORE</button>
              <button onClick={() => void remove(layout.name)} className="cyber-button text-[10px] px-2 py-1 !border-cyber-alert/50 !text-cyber-alert hover:!bg-cyber-alert/10">DEL</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
