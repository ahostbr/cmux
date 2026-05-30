import type { WorkspaceActivityItem } from '@gui/workspace-core';

interface ActivityRailProps {
  items: WorkspaceActivityItem[];
  activeItemIds?: string[];
  onItemClick?: (itemId: string) => void;
}

export function ActivityRail({ items, activeItemIds = [], onItemClick }: ActivityRailProps) {
  const primaryItems = items.filter((item) => item.placement !== 'secondary');
  const secondaryItems = items.filter((item) => item.placement === 'secondary');

  return (
    <aside
      style={{
        width: 'var(--activity-bar-width, 48px)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        borderRight: '1px solid var(--border, rgba(255,255,255,0.08))',
        background: 'var(--bg-surface, #111116)'
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
        {primaryItems.map((item) => {
          const Icon = item.icon;
          const active = activeItemIds.includes(item.id);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onItemClick?.(item.id)}
              title={item.label}
              style={{
                position: 'relative',
                width: '100%',
                height: 48,
                border: 'none',
                display: 'grid',
                placeItems: 'center',
                background: 'transparent',
                color: active ? 'var(--text-primary, #d4d4d8)' : 'var(--text-muted, #5c5c6a)',
                cursor: 'pointer'
              }}
            >
              {active ? (
                <span
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 6,
                    bottom: 6,
                    width: 2,
                    borderRadius: '0 2px 2px 0',
                    background: 'var(--accent, #d4a039)'
                  }}
                />
              ) : null}
              <Icon size={18} />
            </button>
          );
        })}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
        {secondaryItems.map((item) => {
          const Icon = item.icon;
          const active = activeItemIds.includes(item.id);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onItemClick?.(item.id)}
              title={item.label}
              style={{
                position: 'relative',
                width: '100%',
                height: 48,
                border: 'none',
                display: 'grid',
                placeItems: 'center',
                background: 'transparent',
                color: active ? 'var(--text-primary, #d4d4d8)' : 'var(--text-muted, #5c5c6a)',
                cursor: 'pointer'
              }}
            >
              {active ? (
                <span
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 6,
                    bottom: 6,
                    width: 2,
                    borderRadius: '0 2px 2px 0',
                    background: 'var(--accent, #d4a039)'
                  }}
                />
              ) : null}
              <Icon size={18} />
            </button>
          );
        })}
      </div>
    </aside>
  );
}
