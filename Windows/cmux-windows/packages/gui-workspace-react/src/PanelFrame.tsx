import type { DragEvent as ReactDragEvent, ReactNode } from 'react';

interface PanelFrameProps {
  title: string;
  active: boolean;
  onActivate?: () => void;
  onClose?: () => void;
  draggable?: boolean;
  onDragStart?: (event: ReactDragEvent<HTMLElement>) => void;
  onDragOver?: (event: ReactDragEvent<HTMLElement>) => void;
  onDrop?: (event: ReactDragEvent<HTMLElement>) => void;
  children: ReactNode;
}

export function PanelFrame({
  title,
  active,
  onActivate,
  onClose,
  draggable = false,
  onDragStart,
  onDragOver,
  onDrop,
  children
}: PanelFrameProps) {
  return (
    <section
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minWidth: 0,
        minHeight: 0,
        background: 'var(--bg-base, #0c0c0f)',
        border: '1px solid var(--border, rgba(255,255,255,0.08))'
      }}
    >
      <header
        onClick={onActivate}
        draggable={draggable}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
        style={{
          height: 'var(--tab-height, 36px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 10px',
          borderTop: active ? '2px solid var(--accent, #d4a039)' : '2px solid transparent',
          borderBottom: '1px solid var(--border, rgba(255,255,255,0.08))',
          background: 'var(--bg-surface, #111116)',
          cursor: 'default'
        }}
      >
        <span style={{ fontSize: 12, color: active ? 'var(--text-primary, #d4d4d8)' : 'var(--text-muted, #5c5c6a)' }}>{title}</span>
        {onClose ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onClose();
            }}
            style={{
              border: 'none',
              background: 'transparent',
              color: 'var(--text-muted, #5c5c6a)',
              cursor: 'pointer'
            }}
          >
            x
          </button>
        ) : null}
      </header>
      <div style={{ display: 'flex', flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden' }}>{children}</div>
    </section>
  );
}
