import type { ExecuteRequest } from "../types/actions";

interface Props {
  windowHandle: number | null;
  paneId: number | null;
  onExecute: (req: ExecuteRequest) => Promise<unknown>;
  onAfterExecute?: () => void;
  onOpenPalette: () => void;
}

interface ToolbarButton {
  label: string;
  actionId: string;
  title?: string;
}

const PANE_BUTTONS: ToolbarButton[] = [
  { label: "Split V", actionId: "split_right", title: "Split pane right (Alt+Shift+=)" },
  { label: "Split H", actionId: "split_down", title: "Split pane down (Alt+Shift+-)" },
  { label: "Close", actionId: "close_pane", title: "Close pane (Ctrl+Shift+W)" },
  { label: "Zoom", actionId: "toggle_pane_zoom", title: "Toggle pane zoom" },
];

const TAB_BUTTONS: ToolbarButton[] = [
  { label: "+ Tab", actionId: "new_tab", title: "New tab (Ctrl+Shift+T)" },
  { label: "Dup", actionId: "duplicate_tab", title: "Duplicate tab (Ctrl+Shift+D)" },
  { label: "<", actionId: "prev_tab", title: "Previous tab (Ctrl+Shift+Tab)" },
  { label: ">", actionId: "next_tab", title: "Next tab (Ctrl+Tab)" },
];

const FOCUS_BUTTONS: ToolbarButton[] = [
  { label: "^", actionId: "move_focus_up", title: "Focus up (Alt+Up)" },
  { label: "v", actionId: "move_focus_down", title: "Focus down (Alt+Down)" },
  { label: "<", actionId: "move_focus_left", title: "Focus left (Alt+Left)" },
  { label: ">", actionId: "move_focus_right", title: "Focus right (Alt+Right)" },
];

function ButtonGroup({
  buttons,
  onExecute,
  windowHandle,
  paneId,
  onAfterExecute,
}: {
  buttons: ToolbarButton[];
  onExecute: Props["onExecute"];
  windowHandle: number | null;
  paneId: number | null;
  onAfterExecute?: () => void;
}) {
  const exec = async (actionId: string) => {
    await onExecute({
      action_id: actionId,
      window: windowHandle || 0,
      pane_id: paneId,
    });
    onAfterExecute?.();
  };

  return (
    <div className="flex">
      {buttons.map((btn, i) => (
        <button
          key={btn.actionId}
          onClick={() => exec(btn.actionId)}
          title={btn.title}
          className={`px-3 py-1.5 cyber-button ${i === 0
            ? "rounded-l-sm"
            : i === buttons.length - 1
              ? "rounded-r-sm"
              : ""
            } ${i > 0 ? "border-l-0" : ""}`}
        >
          {btn.label}
        </button>
      ))}
    </div>
  );
}

export function ActionToolbar({
  windowHandle,
  paneId,
  onExecute,
  onAfterExecute,
  onOpenPalette,
}: Props) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Pane group */}
      <ButtonGroup
        buttons={PANE_BUTTONS}
        onExecute={onExecute}
        windowHandle={windowHandle}
        paneId={paneId}
        onAfterExecute={onAfterExecute}
      />

      <div className="w-px h-5 bg-cyber-border-highlight" />

      {/* Tab group */}
      <ButtonGroup
        buttons={TAB_BUTTONS}
        onExecute={onExecute}
        windowHandle={windowHandle}
        paneId={paneId}
        onAfterExecute={onAfterExecute}
      />

      <div className="w-px h-5 bg-cyber-border-highlight" />

      {/* Focus group */}
      <ButtonGroup
        buttons={FOCUS_BUTTONS}
        onExecute={onExecute}
        windowHandle={windowHandle}
        paneId={paneId}
        onAfterExecute={onAfterExecute}
      />

      <div className="w-px h-5 bg-cyber-border-highlight" />

      {/* Command palette trigger */}
      <button
        onClick={onOpenPalette}
        title="Command Palette (Ctrl+K)"
        className="cyber-button px-3 py-1.5 flex items-center gap-2 border-cyber-accent/50 text-cyber-accent rounded-sm"
      >
        <span className="cyber-glow-text">&gt;_</span>
        <kbd className="text-[10px] text-cyber-accent-dim font-jetbrains">Ctrl+K</kbd>
      </button>
    </div>
  );
}
