import { describe, expect, it, vi, afterEach } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";
import { readBff, routeFor } from "../src/bff.js";
import {
  countChars, fileFromRaw, gaugeTone, hermesSkills, paperclipSkills, projectHermesMemory, readMemoryOverview, readPaperclipMemory,
  splitEntries, summarize, toEntry, visibleCards, type BotMemoryCard, type PaperclipReadCtx,
} from "../src/memory.js";

afterEach(() => vi.unstubAllGlobals());

const COMPANY = "db6f5310-0afc-4b67-8ca2-8059bd26f0cb";
const AGENT = "694e5a9f-e932-4141-9d20-08cdd653d324";
const AGENT2 = "11111111-2222-3333-4444-555555555555";
const CHIEF = "# 기억 노트 (이 봇 전용)\n저장소는 읽기만 한다.\n§\n작업 범위는 플러그인 폴더다.\n§\n사장님은 표를 좋아한다.\n§\n항목4\n§\n항목5\n§\n항목6\n§\n항목7";

/** 가짜 ctx: 읽기 함수 + 호출되면 안 되는 쓰기 함수(호출 횟수 검사용). */
function fakeCtx(opts: { files?: Record<string, string>; configured?: boolean; statusThrows?: boolean; agents?: { id: string; name: string; status?: string; adapterConfig?: unknown }[] } = {}) {
  const files = opts.files ?? {};
  const ctx = {
    localFolders: {
      status: vi.fn(async (_c: string, folderKey: string) => {
        if (opts.statusThrows) throw new Error("capability local.folders missing");
        return { folderKey, configured: opts.configured ?? true, problems: [] };
      }),
      list: vi.fn(async (_c: string, folderKey: string, o?: { relativePath?: string | null }) => {
        const prefix = `${folderKey}:${o?.relativePath}/`;
        const entries = Object.keys(files).filter(k => k.startsWith(prefix)).map(k => ({ name: k.slice(prefix.length), kind: "file", size: files[k].length, modifiedAt: "2026-09-27T01:00:00.000Z" }));
        if (!entries.length) throw new Error("ENOENT");
        return { entries };
      }),
      readText: vi.fn(async (_c: string, folderKey: string, path: string) => {
        const v = files[`${folderKey}:${path}`];
        if (v === undefined) throw new Error("ENOENT");
        return v;
      }),
      writeTextAtomic: vi.fn(), deleteFile: vi.fn(), configure: vi.fn(),
    },
    agents: { list: vi.fn(async () => opts.agents ?? []) },
  };
  return ctx as typeof ctx & PaperclipReadCtx;
}
const offline = vi.fn(async () => ({ status: "unavailable", message: "x" })) as unknown as typeof readBff;

describe("기억 한눈에 보기 — 순수 함수", () => {
  it("T1 splitEntries는 제목 줄을 빼고 §로 나눈다", () => {
    expect(splitEntries(CHIEF)).toHaveLength(7);
    expect(splitEntries(CHIEF)[0]).toBe("저장소는 읽기만 한다.");
    expect(splitEntries("# 기억 노트 (이 봇 전용 · 2,200자 이내 · 항목 구분 §)\n")).toEqual([]);
    expect(splitEntries(CHIEF.replace(/\n/g, "\r\n"))).toEqual(splitEntries(CHIEF));
    expect(splitEntries("")).toEqual([]);
  });
  it("T2 countChars는 한글·이모지를 1자로 세고 제목 줄을 뺀다", () => {
    expect(countChars("가나다😀")).toBe(4);
    expect(countChars("# 제목\n가나")).toBe(2);
  });
  it("T3 gaugeTone 경계값", () => {
    expect(gaugeTone(69, 100)).toMatchObject({ tone: "ok", label: "여유", pct: 69 });
    expect(gaugeTone(70, 100)).toMatchObject({ tone: "warn", label: "거의 참" });
    expect(gaugeTone(89, 100).tone).toBe("warn");
    expect(gaugeTone(90, 100)).toMatchObject({ tone: "full", label: "가득 참" });
    expect(gaugeTone(100, 100).label).toBe("가득 참");
    expect(gaugeTone(101, 100)).toMatchObject({ tone: "full", label: "한도 초과" });
    expect(gaugeTone(2141, 2200).pct).toBe(97);
  });
  it("T4 항목 원문과 미리보기에 redact가 적용된다", () => {
    const e = toEntry("배포 token=abc12345678 사용\n둘째 줄", 0);
    expect(e.text).toContain("[가림]");
    expect(e.text).not.toContain("abc12345678");
    expect(e.preview).not.toContain("abc12345678");
    expect(e).toMatchObject({ index: 1, chars: Array.from("배포 token=abc12345678 사용\n둘째 줄").length });
    expect(toEntry("가".repeat(80), 0).preview).toBe("가".repeat(60) + "…");
    expect(fileFromRaw(`# t\nsk-${"a".repeat(24)}`, 2200).entries[0].text).toBe("[가림]");
  });
  it("Hermes 그래프를 봇 기억/사장님 정보로 나누고 글자 수는 '약'으로 표시한다", () => {
    const { bot, user } = projectHermesMemory({ memory: [
      { source: "memory", title: "a", body: "가나다", timestamp: 1790000000 },
      { source: "memory", title: "b", body: "라마" },
      { source: "profile", title: "u", body: "사장님" },
    ] });
    expect(bot).toMatchObject({ state: "ok", chars: 3 + 2 + 3, approx: true, limit: 2200 });
    expect(bot.updatedAt).toBe(new Date(1790000000 * 1000).toISOString());
    expect(user).toMatchObject({ state: "ok", chars: 3, limit: 1375 });
    expect(projectHermesMemory({ memory: [] }).bot.state).toBe("empty");
    expect(projectHermesMemory(null).user.state).toBe("empty");
  });
  it("T9 스킬 이름은 마지막 / 뒤만, 형식이 다르면 null", () => {
    expect(paperclipSkills({ paperclipSkillSync: { desiredSkills: ["company/abc/hermes-memory", "paperclipai/paperclip/paperclip"] } })).toEqual([{ name: "hermes-memory", uses: null }, { name: "paperclip", uses: null }]);
    expect(paperclipSkills({})).toBeNull();
    expect(paperclipSkills({ paperclipSkillSync: { desiredSkills: "x" } })).toBeNull();
    expect(paperclipSkills({ paperclipSkillSync: { desiredSkills: [1] } })).toBeNull();
    expect(hermesSkills({ skills: [{ name: "a", enabled: true, usage: 1 }, { name: "b", enabled: true, usage: 9 }, { name: "off", enabled: false, usage: 99 }] })).toEqual([{ name: "b", uses: 9 }, { name: "a", uses: 1 }]);
    expect(hermesSkills(null)).toBeNull();
  });
  it("요약·필터·검색·정렬: 빈/실패 카드는 항상 뒤", () => {
    const card = (key: string, source: "hermes" | "paperclip", chars: number | null, state = "ok", texts: string[] = ["x"]): BotMemoryCard => ({
      key, source, name: key, subtitle: "", skills: null,
      memory: { state: state as any, chars, approx: false, limit: 100, entries: texts.map((t, i) => toEntry(t, i)), updatedAt: null },
    });
    const cards = [card("b", "hermes", 50), card("fail", "hermes", null, "unavailable", []), card("a", "paperclip", 95, "ok", ["배포 규칙"]), card("none", "paperclip", 0, "missing", [])];
    expect(summarize(cards)).toEqual({ bots: 4, full: 1, empty: 1, failed: 1 });
    expect(visibleCards(cards, "all", "", "full").map(c => c.key)).toEqual(["a", "b", "fail", "none"]);
    expect(visibleCards(cards, "all", "", "name").map(c => c.key)).toEqual(["a", "b", "fail", "none"]);
    expect(visibleCards(cards, "hermes", "", "full").map(c => c.key)).toEqual(["b", "fail"]);
    expect(visibleCards(cards, "all", "배포", "full").map(c => c.key)).toEqual(["a"]);
    expect(visibleCards(cards, "all", "배", "full")).toHaveLength(4); // 1자는 검색하지 않음
  });
});

describe("기억 한눈에 보기 — Paperclip 읽기", () => {
  it("T5 Paperclip 읽기는 <UUID>/MEMORY.md 경로만 쓰고 이상한 ID는 읽지 않는다", async () => {
    const ctx = fakeCtx({ files: { [`paperclip-workspaces:${AGENT}/MEMORY.md`]: CHIEF, "paperclip-company-memory:USER.md": "# 사장님\n개발 초보\n§\n표 선호" },
      agents: [{ id: AGENT, name: "코드구현", status: "running", adapterConfig: { paperclipSkillSync: { desiredSkills: ["company/x/hermes-memory"] } } }, { id: "../x", name: "evil" }, { id: "../../etc/passwd000000000000000000000", name: "evil2" }] });
    const result = await readPaperclipMemory(ctx, COMPANY);
    expect(result.state).toBe("ok");
    expect(result.bots).toHaveLength(1);
    expect(result.bots[0]).toMatchObject({ key: `paperclip:${AGENT}`, name: "코드구현", subtitle: "694e5a9f · running", skills: [{ name: "hermes-memory" }], memory: { state: "ok", limit: 2200, updatedAt: "2026-09-27T01:00:00.000Z" } });
    expect(result.bots[0].memory.entries).toHaveLength(7);
    expect(result.user).toMatchObject({ state: "ok", limit: 1375 });
    const paths = ctx.localFolders.readText.mock.calls.map(c => `${c[1]}:${c[2]}`);
    expect(paths.sort()).toEqual([`paperclip-company-memory:USER.md`, `paperclip-workspaces:${AGENT}/MEMORY.md`]);
    expect(ctx.localFolders.list.mock.calls.map(c => c[2]?.relativePath)).toEqual([AGENT]);
  });
  it("T6 쓰기 함수를 부르지 않는다", async () => {
    const ctx = fakeCtx({ files: { [`paperclip-workspaces:${AGENT}/MEMORY.md`]: CHIEF }, agents: [{ id: AGENT, name: "a" }, { id: AGENT2, name: "b" }] });
    await readMemoryOverview(ctx, COMPANY, offline);
    await readMemoryOverview(fakeCtx({ configured: false }), COMPANY, offline);
    expect(ctx.localFolders.writeTextAtomic).not.toHaveBeenCalled();
    expect(ctx.localFolders.deleteFile).not.toHaveBeenCalled();
    expect(ctx.localFolders.configure).not.toHaveBeenCalled();
  });
  it("T7 폴더 미설정 → not-configured, 권한 오류 → server-pending, 회사 ID 이상 → unavailable", async () => {
    expect((await readPaperclipMemory(fakeCtx({ configured: false }), COMPANY)).state).toBe("not-configured");
    expect((await readPaperclipMemory(fakeCtx({ statusThrows: true }), COMPANY)).state).toBe("server-pending");
    const ctx = fakeCtx();
    ctx.agents.list.mockRejectedValueOnce(new Error("forbidden"));
    expect((await readPaperclipMemory(ctx, COMPANY)).state).toBe("server-pending");
    const bad = fakeCtx();
    expect((await readPaperclipMemory(bad, "../company")).state).toBe("unavailable");
    expect(bad.localFolders.status).not.toHaveBeenCalled();
  });
  it("T8 파일 없음 → missing, 제목만 → empty, 너무 큰 파일 → unavailable", async () => {
    const big = "11111111-2222-3333-4444-000000000000";
    const ctx = fakeCtx({ files: { [`paperclip-workspaces:${AGENT}/MEMORY.md`]: "# 기억 노트 (이 봇 전용)\n", [`paperclip-workspaces:${big}/MEMORY.md`]: "x".repeat(20_001) },
      agents: [{ id: AGENT, name: "a" }, { id: AGENT2, name: "b" }, { id: big, name: "c" }] });
    const states = Object.fromEntries((await readPaperclipMemory(ctx, COMPANY)).bots.map(b => [b.name, b.memory]));
    expect(states.a).toMatchObject({ state: "empty", chars: 0 });
    expect(states.b.state).toBe("missing");
    expect(states.c.state).toBe("unavailable");
  });
  it("T10 Hermes가 실패해도 Paperclip 결과는 남고, 반대도 같다", async () => {
    const ctx = fakeCtx({ files: { [`paperclip-workspaces:${AGENT}/MEMORY.md`]: CHIEF }, agents: [{ id: AGENT, name: "a" }] });
    const down = await readMemoryOverview(ctx, COMPANY, offline);
    expect(down.hermes.state).toBe("unavailable");
    expect(down.paperclip.bots[0].memory.state).toBe("ok");

    const hermesOk = (async (view: string, profile: string) => view === "bots" ? { status: "available", data: { bots: [{ profile: "dev", title: "개발자" }] } }
      : view === "graph" ? (profile === "dev" ? { status: "available", data: { memory: [{ source: "memory", title: "t", body: "배운 점 password=hunter2" }] } } : { status: "unavailable" })
      : { status: "available", data: { skills: [{ name: "plan", enabled: true, usage: 3 }] } }) as unknown as typeof readBff;
    const up = await readMemoryOverview(fakeCtx({ statusThrows: true }), COMPANY, hermesOk);
    expect(up.paperclip.state).toBe("server-pending");
    expect(up.hermes.state).toBe("ok");
    const dev = up.hermes.bots.find(b => b.key === "hermes:dev")!;
    expect(dev).toMatchObject({ name: "개발자", skills: [{ name: "plan", uses: 3 }], memory: { state: "ok", approx: true } });
    expect(JSON.stringify(up)).not.toContain("hunter2");
    const def = up.hermes.bots.find(b => b.key === "hermes:default")!;
    expect(def).toMatchObject({ name: "기본 Hermes", memory: { state: "unavailable" } });
    expect(up.hermes.user?.state).toBe("unavailable");
  });
});

describe("기억 한눈에 보기 — 경로·매니페스트", () => {
  it("T11 skills 경로와 허용 필드 4개만 투영한다", async () => {
    expect(routeFor("skills", "default")).toBe("/api/hermes/skills?profile=default");
    expect(() => routeFor("skills", "../x")).toThrow();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ skills: [{ name: "plan", category: "dev", enabled: true, usage: 5, description: "DESC-HIDDEN", provenance: { path: "PROV-HIDDEN" } }] }))));
    const result = await readBff("skills", "default");
    expect(result).toEqual({ status: "available", source: "agentos-bff", data: { skills: [{ name: "plan", category: "dev", enabled: true, usage: 5 }] } });
    expect(JSON.stringify(result)).not.toMatch(/HIDDEN|description|provenance/);
  });
  it("그래프 기억은 시각(timestamp)을 유지한다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ memory: [{ id: "m", source: "memory", title: "t", body: "b", timestamp: 1790000000 }] }))));
    expect(await readBff("graph", "default")).toMatchObject({ data: { memory: [{ timestamp: 1790000000 }] } });
  });
  it("T12 매니페스트에 쓰기용 capability가 없고 폴더는 모두 읽기 전용이다", () => {
    const writeLike = /^(agents\.(pause|resume|invoke|managed)|issues\.|issue\.|secrets\.|companies\.write|projects\.write|goals\.(create|update)|activity\.log|agent\.sessions)/;
    expect(manifest.capabilities.filter(c => writeLike.test(c))).toEqual([]);
    expect(manifest.capabilities).toEqual(expect.arrayContaining(["agents.read", "local.folders"]));
    expect(manifest.localFolders?.map(f => [f.folderKey, f.access])).toEqual([["paperclip-workspaces", "read"], ["paperclip-company-memory", "read"]]);
  });
  it("워커에 memory-overview 읽기 키가 등록되고 폴더 미설정이면 not-configured", async () => {
    const harness = createTestHarness({ manifest });
    await plugin.definition.setup(harness.ctx);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await harness.getData("memory-overview", { companyId: COMPANY })).toMatchObject({ hermes: { state: "unavailable" }, paperclip: { state: "not-configured" } });
    expect(await harness.getData("memory-overview", {})).toMatchObject({ paperclip: { state: "unavailable" } });
  });
});
