import { useState } from "react";
import type { ActionDef, ArgDef } from "../types/actions";

interface Props {
  action: ActionDef;
  onSubmit: (args: Record<string, string | number>) => void;
  onCancel: () => void;
}

export function ActionArgForm({ action, onSubmit, onCancel }: Props) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const arg of action.args) {
      initial[arg.name] = arg.default != null ? String(arg.default) : "";
    }
    return initial;
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const result: Record<string, string | number> = {};
    for (const arg of action.args) {
      const val = values[arg.name];
      if (arg.required && !val) return;
      if (val) {
        result[arg.name] = arg.type === "int" ? parseInt(val, 10) : val;
      }
    }
    onSubmit(result);
  };

  return (
    <form onSubmit={handleSubmit} className="p-5 space-y-4">
      <div className="text-sm font-rajdhani font-bold text-cyber-accent tracking-widest uppercase mb-4 border-b border-cyber-border-highlight pb-2">
        <span className="cyber-glow-text">&gt; {action.name}</span>
      </div>
      {action.args.map((arg: ArgDef) => (
        <div key={arg.name}>
          <label className="block text-[10px] uppercase font-rajdhani tracking-widest text-cyber-text-dim mb-1.5">
            {arg.label}
            {arg.required && <span className="text-cyber-alert ml-1">*</span>}
          </label>
          {arg.choices ? (
            <select
              value={values[arg.name]}
              onChange={(e) =>
                setValues((v) => ({ ...v, [arg.name]: e.target.value }))
              }
              className="w-full cyber-input px-3 py-2 text-xs"
            >
              <option value="">SELECT...</option>
              {arg.choices.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          ) : (
            <input
              type={arg.type === "int" ? "number" : "text"}
              value={values[arg.name]}
              onChange={(e) =>
                setValues((v) => ({ ...v, [arg.name]: e.target.value }))
              }
              placeholder={arg.label.toUpperCase()}
              className="w-full cyber-input px-3 py-2 text-xs placeholder-cyber-text-dim/50 tracking-wider"
              autoFocus
            />
          )}
        </div>
      ))}
      <div className="flex gap-3 justify-end mt-6 pt-4 border-t border-cyber-border-highlight">
        <button
          type="button"
          onClick={onCancel}
          className="cyber-button px-4 py-2 !border-transparent hover:!border-cyber-border-highlight text-cyber-text-dim"
        >
          CANCEL
        </button>
        <button
          type="submit"
          className="cyber-button cyber-button-primary px-6 py-2"
        >
          EXECUTE
        </button>
      </div>
    </form>
  );
}
