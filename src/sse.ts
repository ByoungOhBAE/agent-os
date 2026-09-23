export type StreamEvent = { type: string; data: Record<string, unknown> };

export function readSse(buffer: string): {
  events: StreamEvent[];
  rest: string;
} {
  const normalized = buffer.replace(/\r\n/g, "\n");
  const frames = normalized.split("\n\n");
  const rest = frames.pop() || "";
  const events: StreamEvent[] = [];
  for (const frame of frames) {
    let type = "";
    const dataLines: string[] = [];
    for (const line of frame.split("\n")) {
      if (line.startsWith(":")) continue;
      if (line.startsWith("event:")) type = line.slice(6).trim();
      if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
    }
    if (!dataLines.length) continue;
    try {
      const data = JSON.parse(dataLines.join("\n")) as Record<string, unknown>;
      events.push({ type: type || String(data.event || ""), data });
    } catch {
      /* Ignore malformed frames while preserving later events. */
    }
  }
  return { events, rest };
}
