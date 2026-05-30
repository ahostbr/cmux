import { useState } from "react";
import type { ScheduledJob, TriggerType, PaneEvent } from "../../types/scheduler";

interface Props {
  job: ScheduledJob | null;
  onSave: (params: Record<string, unknown>) => void;
  onCancel: () => void;
}

const PANE_EVENTS: PaneEvent[] = ["process_exit", "pane_created", "pane_closed", "focus_changed", "tab_switched"];

export function JobEditor({ job, onSave, onCancel }: Props) {
  const [name, setName] = useState(job?.name ?? "");
  const [description, setDescription] = useState(job?.description ?? "");
  const [enabled, setEnabled] = useState(job?.enabled ?? true);

  // Trigger
  const [triggerType, setTriggerType] = useState<TriggerType>(job?.trigger.type ?? "schedule");
  const [scheduleType, setScheduleType] = useState(
    job?.trigger.type === "schedule" ? job.trigger.schedule.type : "cron",
  );
  const [cronExpr, setCronExpr] = useState(
    job?.trigger.type === "schedule" && job.trigger.schedule.type === "cron"
      ? job.trigger.schedule.expression : "*/5 * * * *",
  );
  const [intervalEvery, setIntervalEvery] = useState(
    job?.trigger.type === "schedule" && job.trigger.schedule.type === "interval"
      ? job.trigger.schedule.every : 5,
  );
  const [intervalUnit, setIntervalUnit] = useState(
    job?.trigger.type === "schedule" && job.trigger.schedule.type === "interval"
      ? job.trigger.schedule.unit : "minutes",
  );
  const [onceAt, setOnceAt] = useState(
    job?.trigger.type === "schedule" && job.trigger.schedule.type === "once"
      ? job.trigger.schedule.at : "",
  );
  const [watcherId, setWatcherId] = useState(
    job?.trigger.type === "watcher" ? job.trigger.watcher_id : "",
  );
  const [eventType, setEventType] = useState<PaneEvent>(
    job?.trigger.type === "event" ? job.trigger.event : "process_exit",
  );

  // Action
  const [actionType, setActionType] = useState(job?.action.type ?? "macro");
  const [macroName, setMacroName] = useState(
    job?.action.type === "macro" ? job.action.macro_name : "",
  );
  const [actionId, setActionId] = useState(
    job?.action.type === "action" ? job.action.action_id : "",
  );

  // Notifications
  const [notifyStart, setNotifyStart] = useState(job?.notify_on_start ?? false);
  const [notifyComplete, setNotifyComplete] = useState(job?.notify_on_complete ?? true);
  const [notifyError, setNotifyError] = useState(job?.notify_on_error ?? true);

  // Tags
  const [tags, setTags] = useState<string[]>(job?.tags ?? []);
  const [tagInput, setTagInput] = useState("");

  const addTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (t && !tags.includes(t)) {
      setTags([...tags, t]);
      setTagInput("");
    }
  };

  const buildTrigger = () => {
    if (triggerType === "schedule") {
      if (scheduleType === "cron") return { type: "schedule", schedule: { type: "cron", expression: cronExpr } };
      if (scheduleType === "interval") return { type: "schedule", schedule: { type: "interval", every: intervalEvery, unit: intervalUnit } };
      if (scheduleType === "once") return { type: "schedule", schedule: { type: "once", at: onceAt } };
    }
    if (triggerType === "watcher") return { type: "watcher", watcher_id: watcherId };
    return { type: "event", event: eventType };
  };

  const buildAction = () => {
    if (actionType === "macro") return { type: "macro", macro_name: macroName };
    return { type: "action", action_id: actionId };
  };

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      description: description || undefined,
      enabled,
      trigger: buildTrigger(),
      action: buildAction(),
      tags,
      notify_on_start: notifyStart,
      notify_on_complete: notifyComplete,
      notify_on_error: notifyError,
    });
  };

  const triggerOptions: { value: TriggerType; label: string }[] = [
    { value: "schedule", label: "Schedule" },
    { value: "watcher", label: "Watcher" },
    { value: "event", label: "Event" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onCancel}>
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg cyber-panel border border-cyber-border p-5 max-h-[85vh] overflow-auto cyber-scrollbar"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-rajdhani uppercase tracking-widest text-cyber-accent mb-4">
          {job ? "Edit Job" : "New Job"}
        </h2>

        {/* Basic */}
        <div className="mb-4">
          <label className="text-[10px] font-rajdhani uppercase tracking-widest text-cyber-text-dim block mb-1">
            Name *
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="cyber-input w-full text-xs p-2"
            autoFocus
          />
        </div>

        <div className="mb-4">
          <label className="text-[10px] font-rajdhani uppercase tracking-widest text-cyber-text-dim block mb-1">
            Description
          </label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="cyber-input w-full text-xs p-2"
          />
        </div>

        <div className="mb-4 flex items-center gap-2">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          <span className="text-[10px] font-rajdhani uppercase tracking-widest text-cyber-text-dim">
            Enabled
          </span>
        </div>

        {/* Trigger */}
        <div className="mb-4">
          <label className="text-[10px] font-rajdhani uppercase tracking-widest text-cyber-text-dim block mb-2">
            Trigger
          </label>
          <div className="flex gap-1 mb-3">
            {triggerOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setTriggerType(opt.value)}
                className={`px-2 py-0.5 text-[10px] font-rajdhani uppercase tracking-widest border ${
                  triggerType === opt.value
                    ? "border-cyber-accent text-cyber-accent bg-cyber-accent/10"
                    : "border-cyber-border text-cyber-text-dim"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {triggerType === "schedule" && (
            <>
              <div className="flex gap-1 mb-2">
                {(["cron", "interval", "once"] as const).map((st) => (
                  <button
                    key={st}
                    onClick={() => setScheduleType(st)}
                    className={`px-2 py-0.5 text-[8px] font-rajdhani uppercase tracking-widest border ${
                      scheduleType === st
                        ? "border-cyber-accent/60 text-cyber-accent"
                        : "border-cyber-border text-cyber-text-dim"
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
              {scheduleType === "cron" && (
                <input
                  value={cronExpr}
                  onChange={(e) => setCronExpr(e.target.value)}
                  placeholder="*/5 * * * *"
                  className="cyber-input w-full text-xs p-2 font-jetbrains"
                />
              )}
              {scheduleType === "interval" && (
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={intervalEvery}
                    onChange={(e) => setIntervalEvery(Number(e.target.value))}
                    min={1}
                    className="cyber-input w-20 text-xs p-2"
                  />
                  <select
                    value={intervalUnit}
                    onChange={(e) => setIntervalUnit(e.target.value as "minutes" | "hours" | "days")}
                    className="cyber-input text-xs p-2"
                  >
                    <option value="minutes">minutes</option>
                    <option value="hours">hours</option>
                    <option value="days">days</option>
                  </select>
                </div>
              )}
              {scheduleType === "once" && (
                <input
                  type="datetime-local"
                  value={onceAt}
                  onChange={(e) => setOnceAt(e.target.value)}
                  className="cyber-input w-full text-xs p-2"
                />
              )}
            </>
          )}

          {triggerType === "watcher" && (
            <div>
              <input
                value={watcherId}
                onChange={(e) => setWatcherId(e.target.value)}
                placeholder="Watcher ID"
                className="cyber-input w-full text-xs p-2 font-jetbrains"
              />
              <p className="text-[9px] text-cyber-text-dim mt-1">
                Use the watcher ID from WATCH.DAEMON panel. Job fires when the watcher matches.
              </p>
            </div>
          )}

          {triggerType === "event" && (
            <select
              value={eventType}
              onChange={(e) => setEventType(e.target.value as PaneEvent)}
              className="cyber-input w-full text-xs p-2"
            >
              {PANE_EVENTS.map((ev) => (
                <option key={ev} value={ev}>{ev}</option>
              ))}
            </select>
          )}
        </div>

        {/* Action */}
        <div className="mb-4">
          <label className="text-[10px] font-rajdhani uppercase tracking-widest text-cyber-text-dim block mb-2">
            Action
          </label>
          <div className="flex gap-1 mb-2">
            <button
              onClick={() => setActionType("macro")}
              className={`px-2 py-0.5 text-[10px] font-rajdhani uppercase tracking-widest border ${
                actionType === "macro"
                  ? "border-cyber-accent text-cyber-accent bg-cyber-accent/10"
                  : "border-cyber-border text-cyber-text-dim"
              }`}
            >
              Macro
            </button>
            <button
              onClick={() => setActionType("action")}
              className={`px-2 py-0.5 text-[10px] font-rajdhani uppercase tracking-widest border ${
                actionType === "action"
                  ? "border-cyber-accent text-cyber-accent bg-cyber-accent/10"
                  : "border-cyber-border text-cyber-text-dim"
              }`}
            >
              Single Action
            </button>
          </div>
          {actionType === "macro" ? (
            <input
              value={macroName}
              onChange={(e) => setMacroName(e.target.value)}
              placeholder="Macro name"
              className="cyber-input w-full text-xs p-2 font-jetbrains"
            />
          ) : (
            <input
              value={actionId}
              onChange={(e) => setActionId(e.target.value)}
              placeholder="Action ID (e.g. split_right)"
              className="cyber-input w-full text-xs p-2 font-jetbrains"
            />
          )}
        </div>

        {/* Tags */}
        <div className="mb-4">
          <label className="text-[10px] font-rajdhani uppercase tracking-widest text-cyber-text-dim block mb-1">
            Tags
          </label>
          <div className="flex gap-1 mb-1 flex-wrap">
            {tags.map((t) => (
              <span key={t} className="px-1.5 py-0.5 text-[8px] border border-cyber-border text-cyber-text-dim flex items-center gap-1">
                {t}
                <button onClick={() => setTags(tags.filter((x) => x !== t))} className="text-cyber-alert">x</button>
              </span>
            ))}
          </div>
          <div className="flex gap-1">
            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addTag()}
              placeholder="add tag"
              className="cyber-input flex-1 text-xs p-1.5"
            />
            <button onClick={addTag} className="cyber-button text-[10px] px-2 border border-cyber-border text-cyber-text-dim">
              +
            </button>
          </div>
        </div>

        {/* Notifications */}
        <div className="mb-4">
          <label className="text-[10px] font-rajdhani uppercase tracking-widest text-cyber-text-dim block mb-2">
            Notifications
          </label>
          <div className="flex gap-4">
            <label className="flex items-center gap-1 text-[10px] text-cyber-text-dim">
              <input type="checkbox" checked={notifyStart} onChange={(e) => setNotifyStart(e.target.checked)} />
              On start
            </label>
            <label className="flex items-center gap-1 text-[10px] text-cyber-text-dim">
              <input type="checkbox" checked={notifyComplete} onChange={(e) => setNotifyComplete(e.target.checked)} />
              On complete
            </label>
            <label className="flex items-center gap-1 text-[10px] text-cyber-text-dim">
              <input type="checkbox" checked={notifyError} onChange={(e) => setNotifyError(e.target.checked)} />
              On error
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 justify-end pt-3 border-t border-cyber-border">
          <button onClick={onCancel} className="cyber-button text-[10px] px-3 py-1.5 text-cyber-text-dim">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            className="cyber-button cyber-button-primary text-[10px] px-4 py-1.5 disabled:opacity-50"
          >
            {job ? "Update Job" : "Create Job"}
          </button>
        </div>
      </div>
    </div>
  );
}
