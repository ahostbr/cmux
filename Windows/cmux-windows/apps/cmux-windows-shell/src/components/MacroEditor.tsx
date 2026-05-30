import { useState } from "react";
import type { MacroStep } from "../hooks/useMacros";
import type { ActionDef } from "../types/actions";

interface Props {
  initialName: string;
  initialSteps: MacroStep[];
  actions: ActionDef[];
  onSave: (name: string, steps: MacroStep[]) => void;
  onCancel: () => void;
}

export function MacroEditor({ initialName, initialSteps, actions, onSave, onCancel }: Props) {
  const [name, setName] = useState(initialName);
  const [steps, setSteps] = useState<MacroStep[]>(initialSteps);
  const [jsonMode, setJsonMode] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [addingStep, setAddingStep] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const handleSave = () => {
    if (!name.trim()) return;
    if (jsonMode) {
      try {
        const parsed = JSON.parse(jsonText);
        onSave(name.trim(), parsed);
      } catch {
        return; // invalid JSON
      }
    } else {
      onSave(name.trim(), steps);
    }
  };

  const removeStep = (index: number) => {
    setSteps((s) => s.filter((_, i) => i !== index));
  };

  const moveStep = (index: number, dir: -1 | 1) => {
    const newIndex = index + dir;
    if (newIndex < 0 || newIndex >= steps.length) return;
    setSteps((s) => {
      const copy = [...s];
      [copy[index], copy[newIndex]] = [copy[newIndex], copy[index]];
      return copy;
    });
  };

  const updateDelay = (index: number, delay: number) => {
    setSteps((s) => s.map((step, i) => (i === index ? { ...step, delay_ms: delay } : step)));
  };

  const addStep = (action: ActionDef) => {
    setSteps((s) => [...s, { action_id: action.id, delay_ms: 500 }]);
    setAddingStep(false);
    setSearchQuery("");
  };

  const toggleJsonMode = () => {
    if (!jsonMode) {
      setJsonText(JSON.stringify(steps, null, 2));
    }
    setJsonMode(!jsonMode);
  };

  const filteredActions = searchQuery
    ? actions.filter(
      (a) =>
        a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.id.toLowerCase().includes(searchQuery.toLowerCase())
    )
    : actions.slice(0, 20);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onCancel}>
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg cyber-panel overflow-hidden bg-cyber-bg border-cyber-border shadow-2xl flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-cyber-border-highlight">
          <span className="text-sm font-rajdhani font-bold text-cyber-accent tracking-widest uppercase cyber-glow-text">
            MACRO.EDITOR
          </span>
          <div className="ml-auto flex gap-2">
            <button
              onClick={toggleJsonMode}
              className={`text-[9px] font-rajdhani tracking-widest uppercase px-2 py-0.5 rounded-sm border transition-all ${jsonMode
                  ? "border-cyber-accent text-cyber-accent bg-cyber-accent/10"
                  : "border-cyber-border text-cyber-text-dim hover:border-cyber-accent/50"
                }`}
            >
              JSON
            </button>
          </div>
        </div>

        {/* Name input */}
        <div className="px-4 py-3 border-b border-cyber-border-highlight">
          <label className="block text-[10px] uppercase font-rajdhani tracking-widest text-cyber-text-dim mb-1.5">
            MACRO NAME
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="MY_MACRO"
            className="w-full cyber-input px-3 py-2 text-xs"
            autoFocus
          />
        </div>

        {/* Steps / JSON editor */}
        <div className="flex-1 overflow-y-auto cyber-scrollbar p-4">
          {jsonMode ? (
            <textarea
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              className="w-full h-64 cyber-input px-3 py-2 text-xs font-jetbrains resize-none"
              spellCheck={false}
            />
          ) : (
            <div className="space-y-2">
              {steps.length === 0 && (
                <div className="text-[10px] text-cyber-text-dim/50 font-rajdhani tracking-widest uppercase text-center py-6">
                  NO STEPS — ADD FROM CATALOG
                </div>
              )}
              {steps.map((step, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 p-2 border border-cyber-border rounded-sm bg-cyber-panel"
                >
                  <span className="text-[10px] text-cyber-text-dim font-jetbrains w-4">
                    {i + 1}
                  </span>
                  <span className="text-xs font-jetbrains text-cyber-text flex-1 truncate">
                    {step.action_id}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={3000}
                    step={100}
                    value={step.delay_ms}
                    onChange={(e) => updateDelay(i, Number(e.target.value))}
                    className="w-16 accent-cyber-accent"
                    title={`Delay: ${step.delay_ms}ms`}
                  />
                  <span className="text-[9px] text-cyber-text-dim w-10 text-right font-jetbrains">
                    {step.delay_ms}ms
                  </span>
                  <button
                    onClick={() => moveStep(i, -1)}
                    className="text-[10px] text-cyber-text-dim hover:text-cyber-accent"
                    disabled={i === 0}
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => moveStep(i, 1)}
                    className="text-[10px] text-cyber-text-dim hover:text-cyber-accent"
                    disabled={i === steps.length - 1}
                  >
                    ↓
                  </button>
                  <button
                    onClick={() => removeStep(i)}
                    className="text-[10px] text-cyber-alert hover:text-cyber-alert"
                  >
                    ✕
                  </button>
                </div>
              ))}

              {/* Add step */}
              {addingStep ? (
                <div className="border border-cyber-accent/30 rounded-sm bg-cyber-bg p-2 space-y-2">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="SEARCH ACTIONS..."
                    className="w-full cyber-input px-3 py-1.5 text-xs"
                    autoFocus
                  />
                  <div className="max-h-40 overflow-y-auto cyber-scrollbar space-y-1">
                    {filteredActions.map((a) => (
                      <button
                        key={a.id}
                        onClick={() => addStep(a)}
                        className="w-full text-left px-2 py-1 text-xs font-jetbrains text-cyber-text hover:bg-cyber-accent/10 hover:text-cyber-accent rounded-sm transition-colors"
                      >
                        {a.name}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => { setAddingStep(false); setSearchQuery(""); }}
                    className="text-[9px] text-cyber-text-dim font-rajdhani tracking-widest uppercase"
                  >
                    CANCEL
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setAddingStep(true)}
                  className="w-full cyber-button px-3 py-1.5 text-[10px] font-rajdhani tracking-widest uppercase text-cyber-accent border-dashed"
                >
                  + ADD STEP
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 justify-end px-4 py-3 border-t border-cyber-border-highlight">
          <button onClick={onCancel} className="cyber-button px-4 py-2 text-cyber-text-dim">
            CANCEL
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            className="cyber-button cyber-button-primary px-6 py-2 disabled:opacity-30"
          >
            SAVE MACRO
          </button>
        </div>
      </div>
    </div>
  );
}
