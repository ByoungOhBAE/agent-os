import { describe, expect, it } from "vitest";
import { bffOrigin, createBff, DEFAULT_ORIGIN } from "../src/bff.js";

describe("BFF origin", () => {
  it("loopback 127.0.0.1 http만 허용하고 나머지는 기본값으로 되돌린다", () => {
    expect(bffOrigin(undefined)).toBe(DEFAULT_ORIGIN);
    expect(bffOrigin("http://127.0.0.1:4299")).toBe("http://127.0.0.1:4299");
    expect(bffOrigin("http://127.0.0.1:4299/")).toBe("http://127.0.0.1:4299");
    for (const bad of ["https://127.0.0.1:4299", "http://localhost:4299", "http://10.0.0.5:4200", "http://example.com", "http://127.0.0.1:4299/x", "http://u:p@127.0.0.1:4299", "not a url"])
      expect(bffOrigin(bad)).toBe(DEFAULT_ORIGIN);
  });

  it("클라이언트가 지정한 origin으로만 요청한다", async () => {
    const urls: string[] = [];
    const bff = createBff((async (url: string) => { urls.push(url); return new Response("{}", { status: 200 }); }) as any, "http://127.0.0.1:4299");
    await bff.bots();
    await bff.cancelPaperclip("2f1c2a8e-7c1b-4a55-9d2f-0f1e2d3c4b5a");
    expect(urls).toEqual(["http://127.0.0.1:4299/api/hermes/bots", "http://127.0.0.1:4299/api/control/paperclip/runs/2f1c2a8e-7c1b-4a55-9d2f-0f1e2d3c4b5a/cancel"]);
  });

  it("BFF 오류 메시지와 상태를 보존한다", async () => {
    const bff = createBff((async () => new Response(JSON.stringify({ error: "실행을 중지하지 못했습니다." }), { status: 404 })) as any);
    await expect(bff.cancelPaperclip("2f1c2a8e-7c1b-4a55-9d2f-0f1e2d3c4b5a")).rejects.toMatchObject({ message: "실행을 중지하지 못했습니다.", status: 404 });
  });
});
