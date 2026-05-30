import type { ReactNode } from 'react';

export function EmptyWorkspaceState({ children }: { children?: ReactNode }) {
  return (
    <div
      style={{
        display: 'grid',
        placeItems: 'center',
        width: '100%',
        height: '100%',
        color: '#9a9ea8'
      }}
    >
      {children ?? <span>No panels open.</span>}
    </div>
  );
}
