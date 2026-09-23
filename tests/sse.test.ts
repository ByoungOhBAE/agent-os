import { describe, expect, it } from "vitest";
import { readSse } from "../src/sse";

describe("Hermes run SSE frames", () => {
  it("uses the JSON event field, ignores keepalives, and retains partial frames", () => {
    const first = readSse(
      ': keepalive\n\ndata: {"event":"message.delta","delta":"안녕"}\n\ndata: {"event":"tool.started"',
    );
    expect(first.events).toEqual([
      {
        type: "message.delta",
        data: { event: "message.delta", delta: "안녕" },
      },
    ]);
    const second = readSse(first.rest + ',"tool":"terminal"}\n\n');
    expect(second.events[0].type).toBe("tool.started");
  });

  it("accepts CRLF and an explicit event line", () => {
    expect(
      readSse('event: run.completed\r\ndata: {"output":"완료"}\r\n\r\n')
        .events[0].type,
    ).toBe("run.completed");
  });
});
