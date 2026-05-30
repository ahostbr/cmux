import { useEffect, useState } from "react";

interface Props {
  windowHandle: number;
  windowTitle: string;
  paneId: number;
  paneTitle: string;
  focused: boolean;
  selected: boolean;
  onSelect: () => void;
}

export function TerminalCard({ windowHandle, windowTitle, paneId, paneTitle, focused, selected, onSelect }: Props) {
  const [buffer, setBuffer] = useState("");

  useEffect(() => {
    const fetchBuffer = async () => {
      try {
        const res = await fetch(`/api/panes/${paneId}/buffer?lines=50&window=${windowHandle}`);
        const data = await res.json();
        setBuffer(data.buffer || "");
      } catch {
        setBuffer("Error reading buffer");
      }
    };
    fetchBuffer();
    const interval = setInterval(fetchBuffer, 1000);
    return () => clearInterval(interval);
  }, [paneId, windowHandle]);

  // Clean window title (remove UTF-8 artifacts)
  const cleanTitle = windowTitle.replace(/[^\x20-\x7E]/g, "").trim();

  return (
    <div
      onClick={onSelect}
      className={`rounded-lg border transition-colors cursor-pointer ${
        selected
          ? "border-blue-500 bg-gray-900"
          : "border-gray-700 bg-gray-900 hover:border-gray-500"
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-800">
        {focused && <span className="text-green-400 text-xs">● focused</span>}
        <span className="font-mono text-sm font-medium">{paneTitle}</span>
        <span className="text-xs text-gray-500">— {cleanTitle || "Terminal"}</span>
        {selected && (
          <span className="ml-auto text-xs px-2 py-0.5 bg-blue-900 text-blue-300 rounded">selected</span>
        )}
      </div>

      {/* Buffer */}
      <div
        className={`font-mono text-xs text-green-400 bg-black p-3 overflow-auto whitespace-pre-wrap rounded-b-lg ${
          selected ? "max-h-96" : "max-h-32"
        }`}
      >
        {buffer ? buffer.slice(selected ? -4000 : -800) : <span className="text-gray-600">(empty)</span>}
      </div>
    </div>
  );
}
