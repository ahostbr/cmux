import { useState } from "react";
import type { MacroSummary, MacroStep } from "../hooks/useMacros";

interface Props {
  macros: MacroSummary[];
  recording: boolean;
  executing: string | null;
  onStartRecording: () => void;
  onStopRecording: () => Promise<MacroStep[]>;
  onRun: (name: string) => void;
  onDelete: (name: string) => void;
  onEdit: (name: string) => void;
  onSaveRecorded: (steps: MacroStep[]) => void;
}

export function MacroPanel({
  macros,
  recording,
  executing,
  onStartRecording,
  onStopRecording,
  onRun,
  onDelete,
  onEdit,
  onSaveRecorded,
}: Props) {
  const [expanded, setExpanded] = useState(true);

  const handleStopRecording = async () => {
    const steps = await onStopRecording();
    if (steps.length > 0) {
      onSaveRecorded(steps);
    }
  };

  return (
    <div className="mt-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between text-sm text-cyber-accent tracking-widest border-b border-cyber-border-highlight pb-1 mb-3 font-rajdhani uppercase"
      >
        <span className="flex items-center gap-2">
          MACRO.ENGINE
          {recording && (
            <span className="inline-block w-2 h-2 rounded-full bg-cyber-alert animate-pulse" />
          )}
        </span>
        <span className="text-cyber-text-dim text-[10px]">{expanded ? "[-]" : "[+]"}</span>
      </button>

      {expanded && (
        <div className="space-y-2">
          {/* Record button */}
          <button
            onClick={recording ? handleStopRecording : onStartRecording}
            className={`w-full cyber-button px-3 py-2 text-[10px] font-rajdhani tracking-widest uppercase flex items-center justify-center gap-2 ${recording
                ? "!border-cyber-alert text-cyber-alert"
                : ""
              }`}
          >
            {recording ? (
              <>
                <span className="inline-block w-2 h-2 bg-cyber-alert rounded-sm" />
                STOP RECORDING
              </>
            ) : (
              <>
                <span className="inline-block w-2 h-2 bg-cyber-alert rounded-full" />
                RECORD MACRO
              </>
            )}
          </button>

          {/* Macro list */}
          {macros.length === 0 ? (
            <div className="text-[10px] text-cyber-text-dim/50 font-rajdhani tracking-widest uppercase text-center py-4">
              NO MACROS SAVED
            </div>
          ) : (
            macros.map((macro) => {
              const isExecuting = executing === macro.name;
              return (
                <div
                  key={macro.name}
                  className={`p-2 border rounded-sm bg-cyber-panel transition-all ${isExecuting
                      ? "border-cyber-accent"
                      : "border-cyber-border hover:border-cyber-border-highlight"
                    }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-jetbrains text-cyber-text">
                        {macro.name}
                      </span>
                      <span className="text-[9px] text-cyber-text-dim ml-2 font-rajdhani tracking-widest uppercase">
                        {macro.steps} STEP{macro.steps !== 1 ? "S" : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onRun(macro.name)}
                        disabled={isExecuting || recording}
                        className="cyber-button px-2 py-0.5 text-[9px] text-cyber-success hover:!border-cyber-success disabled:opacity-30"
                        title="Run macro"
                      >
                        {isExecuting ? "..." : "▶"}
                      </button>
                      <button
                        onClick={() => onEdit(macro.name)}
                        className="cyber-button px-2 py-0.5 text-[9px] text-cyber-accent hover:!border-cyber-accent"
                        title="Edit macro"
                      >
                        ✎
                      </button>
                      <button
                        onClick={() => onDelete(macro.name)}
                        className="cyber-button px-2 py-0.5 text-[9px] text-cyber-alert hover:!border-cyber-alert"
                        title="Delete macro"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
