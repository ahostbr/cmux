import { useEffect, useState } from "react";

interface Props {
  paneId: number | null;
}

export function TerminalView({ paneId }: Props) {
  const [buffer, setBuffer] = useState<string>("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (paneId === null) return;
    setLoading(true);
    const fetchBuffer = async () => {
      try {
        const res = await fetch(`/api/panes/${paneId}/buffer?lines=50`);
        const data = await res.json();
        setBuffer(data.buffer || "");
      } catch {
        setBuffer("Error reading buffer");
      }
      setLoading(false);
    };
    fetchBuffer();
    const interval = setInterval(fetchBuffer, 1000);
    return () => clearInterval(interval);
  }, [paneId]);

  if (paneId === null) {
    return <div className="text-gray-500 text-sm">Select a pane to view its output</div>;
  }

  return (
    <div className="bg-black rounded-lg border border-gray-700 p-4 font-mono text-sm text-green-400 h-96 overflow-auto whitespace-pre-wrap">
      {loading && !buffer ? "Loading..." : buffer || "(empty)"}
    </div>
  );
}
