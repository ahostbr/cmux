import { useEffect, useState } from 'react';
import { liteWinTerminalClient } from '../api/client';

interface Agent {
  agent_id: string;
  pane_id: number;
  role: string;
  claimed_at: string;
  last_command: { text: string; at: string } | null;
}

export function AgentPanel() {
  const [agents, setAgents] = useState<Agent[]>([]);

  useEffect(() => {
    const poll = async () => {
      try {
        const data = await liteWinTerminalClient.agents.list();
        setAgents(Array.isArray(data) ? data : []);
      } catch {
        // ignore
      }
    };
    void poll();
    const interval = window.setInterval(() => {
      void poll();
    }, 2000);
    return () => window.clearInterval(interval);
  }, []);

  if (agents.length === 0) {
    return (
      <div className="mt-8">
        <h2 className="text-sm text-cyber-accent tracking-widest border-b border-cyber-border-highlight pb-1 mb-3 font-rajdhani font-semibold">SYS.AGENTS</h2>
        <p className="text-xs text-cyber-text-dim font-rajdhani uppercase tracking-widest bg-cyber-panel/30 border border-dashed border-cyber-border-highlight p-3 text-center rounded-sm">NO AGENTS CONNECTED</p>
      </div>
    );
  }

  return (
    <div className="mt-8">
      <h2 className="text-sm text-cyber-accent tracking-widest border-b border-cyber-border-highlight pb-1 mb-3 font-rajdhani font-semibold">SYS.AGENTS</h2>
      <div className="space-y-2">
        {agents.map((agent) => (
          <div key={agent.agent_id} className="cyber-panel p-3 border-cyber-accent/30 relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-1 h-full bg-cyber-accent opacity-50 group-hover:opacity-100 transition-opacity" />
            <div className="flex items-center gap-2 pl-2">
              <span className="text-cyber-accent text-sm font-jetbrains font-bold">{agent.agent_id}</span>
              <span className="text-[10px] px-1.5 py-0.5 bg-cyber-accent/10 border border-cyber-accent/30 text-cyber-accent rounded-sm tracking-wider uppercase font-rajdhani">{agent.role}</span>
            </div>
            <div className="text-xs text-cyber-text-dim mt-1 font-jetbrains pl-2">PANE {agent.pane_id} | SINCE {new Date(agent.claimed_at).toLocaleTimeString()}</div>
            {agent.last_command && (
              <div className="text-xs text-cyber-text-dim opacity-70 mt-1 font-jetbrains truncate pl-2">&gt; {agent.last_command.text}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
