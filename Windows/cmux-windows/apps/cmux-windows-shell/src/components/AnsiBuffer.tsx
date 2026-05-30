import { useMemo } from "react";

/** ANSI color code → CSS color mapping */
const ANSI_COLORS: Record<number, string> = {
  30: "#1E1E1E", 31: "#E06C75", 32: "#98C379", 33: "#E5C07B",
  34: "#61AFEF", 35: "#C678DD", 36: "#56B6C2", 37: "#ABB2BF",
  90: "#5C6370", 91: "#E06C75", 92: "#98C379", 93: "#E5C07B",
  94: "#61AFEF", 95: "#C678DD", 96: "#56B6C2", 97: "#FFFFFF",
};

const ANSI_BG_COLORS: Record<number, string> = {
  40: "#1E1E1E", 41: "#E06C75", 42: "#98C379", 43: "#E5C07B",
  44: "#61AFEF", 45: "#C678DD", 46: "#56B6C2", 47: "#ABB2BF",
  100: "#5C6370", 101: "#E06C75", 102: "#98C379", 103: "#E5C07B",
  104: "#61AFEF", 105: "#C678DD", 106: "#56B6C2", 107: "#FFFFFF",
};

interface SpanStyle {
  color?: string;
  backgroundColor?: string;
  fontWeight?: string;
  fontStyle?: string;
  textDecoration?: string;
  opacity?: number;
}

interface Segment {
  text: string;
  style: SpanStyle;
}

/** Parse ANSI escape sequences into styled segments */
function parseAnsi(text: string): Segment[] {
  const segments: Segment[] = [];
  // Match ANSI escape sequences: ESC[ ... m
  const re = /\x1b\[([0-9;]*)m/g;
  let lastIndex = 0;
  let currentStyle: SpanStyle = {};

  let match;
  while ((match = re.exec(text)) !== null) {
    // Push text before this escape
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index), style: { ...currentStyle } });
    }
    lastIndex = re.lastIndex;

    // Parse SGR codes
    const codes = match[1] ? match[1].split(";").map(Number) : [0];
    for (const code of codes) {
      if (code === 0) {
        currentStyle = {};
      } else if (code === 1) {
        currentStyle.fontWeight = "bold";
      } else if (code === 2) {
        currentStyle.opacity = 0.6;
      } else if (code === 3) {
        currentStyle.fontStyle = "italic";
      } else if (code === 4) {
        currentStyle.textDecoration = "underline";
      } else if (code === 22) {
        delete currentStyle.fontWeight;
        delete currentStyle.opacity;
      } else if (code === 23) {
        delete currentStyle.fontStyle;
      } else if (code === 24) {
        delete currentStyle.textDecoration;
      } else if (code === 39) {
        delete currentStyle.color;
      } else if (code === 49) {
        delete currentStyle.backgroundColor;
      } else if (ANSI_COLORS[code]) {
        currentStyle.color = ANSI_COLORS[code];
      } else if (ANSI_BG_COLORS[code]) {
        currentStyle.backgroundColor = ANSI_BG_COLORS[code];
      }
    }
  }

  // Push remaining text
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), style: { ...currentStyle } });
  }

  return segments;
}

/** Strip ANSI codes from text (for matching) */
function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

interface HighlightPattern {
  pattern: string;
  watcherName: string;
}

interface Props {
  buffer: string;
  highlights?: HighlightPattern[];
}

export function AnsiBuffer({ buffer, highlights }: Props) {
  const rendered = useMemo(() => {
    if (!buffer) return null;

    // Build compiled regex for highlights
    const hlRegexes = (highlights ?? []).map((h) => {
      try {
        return { re: new RegExp(h.pattern, "g"), name: h.watcherName };
      } catch {
        return null;
      }
    }).filter(Boolean) as { re: RegExp; name: string }[];

    const lines = buffer.split("\n");

    return lines.map((line, lineIdx) => {
      const plainLine = stripAnsi(line);
      // Check if any highlight pattern matches this line
      const isHighlighted = hlRegexes.some((h) => {
        h.re.lastIndex = 0;
        return h.re.test(plainLine);
      });

      const segments = parseAnsi(line);

      return (
        <div
          key={lineIdx}
          className={isHighlighted
            ? "bg-cyber-alert/10 border-l-2 border-cyber-alert pl-1 -ml-1"
            : ""
          }
        >
          {segments.map((seg, segIdx) => {
            if (!seg.text) return null;

            // For highlighted lines, further highlight the matched text within segments
            if (isHighlighted && hlRegexes.length > 0) {
              const parts = highlightText(seg.text, hlRegexes);
              return parts.map((part, partIdx) => (
                <span
                  key={`${segIdx}-${partIdx}`}
                  style={seg.style}
                  className={part.matched ? "text-cyber-alert font-bold bg-cyber-alert/20 rounded-sm px-0.5" : ""}
                >
                  {part.text}
                </span>
              ));
            }

            return (
              <span key={segIdx} style={seg.style}>
                {seg.text}
              </span>
            );
          })}
        </div>
      );
    });
  }, [buffer, highlights]);

  return <>{rendered}</>;
}

/** Split text into matched/unmatched parts for inline highlighting */
function highlightText(
  text: string,
  regexes: { re: RegExp; name: string }[],
): { text: string; matched: boolean }[] {
  const parts: { text: string; matched: boolean }[] = [];

  // Collect all match ranges
  const ranges: { start: number; end: number }[] = [];
  for (const { re } of regexes) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      ranges.push({ start: m.index, end: m.index + m[0].length });
      if (!m[0].length) break; // prevent infinite loop on zero-width match
    }
  }

  if (ranges.length === 0) return [{ text, matched: false }];

  // Sort and merge overlapping ranges
  ranges.sort((a, b) => a.start - b.start);
  const merged: typeof ranges = [ranges[0]];
  for (let i = 1; i < ranges.length; i++) {
    const last = merged[merged.length - 1];
    if (ranges[i].start <= last.end) {
      last.end = Math.max(last.end, ranges[i].end);
    } else {
      merged.push(ranges[i]);
    }
  }

  let pos = 0;
  for (const range of merged) {
    if (range.start > pos) {
      parts.push({ text: text.slice(pos, range.start), matched: false });
    }
    parts.push({ text: text.slice(range.start, range.end), matched: true });
    pos = range.end;
  }
  if (pos < text.length) {
    parts.push({ text: text.slice(pos), matched: false });
  }

  return parts;
}
