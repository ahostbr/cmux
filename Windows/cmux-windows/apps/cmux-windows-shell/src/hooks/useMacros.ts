import { useCallback, useEffect, useState } from 'react';
import { liteWinTerminalClient } from '../api/client';

export interface MacroStep {
  action_id: string;
  args?: Record<string, unknown>;
  delay_ms: number;
}

export interface MacroSummary {
  name: string;
  steps: number;
  created: number | null;
}

export interface MacroDetail {
  name: string;
  steps: MacroStep[];
  created: number;
}

export function useMacros() {
  const [macros, setMacros] = useState<MacroSummary[]>([]);
  const [recording, setRecording] = useState(false);
  const [executing, setExecuting] = useState<string | null>(null);

  const fetchMacros = useCallback(async () => {
    try {
      const data = await liteWinTerminalClient.macros.list();
      setMacros(data.macros ?? []);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void fetchMacros();
  }, [fetchMacros]);

  const getMacro = useCallback(async (name: string): Promise<MacroDetail | null> => {
    try {
      const data = await liteWinTerminalClient.macros.get(name);
      if ('error' in data) return null;
      return data as MacroDetail;
    } catch {
      return null;
    }
  }, []);

  const saveMacro = useCallback(async (name: string, steps: MacroStep[]) => {
    await liteWinTerminalClient.macros.save({ name, steps });
    await fetchMacros();
  }, [fetchMacros]);

  const deleteMacro = useCallback(async (name: string) => {
    await liteWinTerminalClient.macros.delete(name);
    await fetchMacros();
  }, [fetchMacros]);

  const runMacro = useCallback(async (name: string, windowHandle: number | null, paneId: number | null) => {
    setExecuting(name);
    try {
      return await liteWinTerminalClient.macros.run({ name, window: windowHandle, pane_id: paneId });
    } finally {
      setExecuting(null);
    }
  }, []);

  const startRecording = useCallback(async () => {
    await liteWinTerminalClient.macros.startRecording();
    setRecording(true);
  }, []);

  const stopRecording = useCallback(async (): Promise<MacroStep[]> => {
    const data = await liteWinTerminalClient.macros.stopRecording();
    setRecording(false);
    return data.steps ?? [];
  }, []);

  return {
    macros,
    recording,
    executing,
    fetchMacros,
    getMacro,
    saveMacro,
    deleteMacro,
    runMacro,
    startRecording,
    stopRecording,
  };
}
