import type { ReactNode } from 'react';

export function SidebarShell({ children }: { children?: ReactNode }) {
  return (
    <div
      style={{
        width: 'var(--sidebar-width, 260px)',
        flexShrink: 0,
        borderRight: '1px solid var(--border, rgba(255,255,255,0.08))',
        background: 'var(--bg-surface, #111116)',
        overflow: 'auto'
      }}
    >
      {children}
    </div>
  );
}
