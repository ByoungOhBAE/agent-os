import { describe, expect, it } from "vitest";
import {
  diffNewIds, filterGalaxy, layoutGalaxy, LAYER_LABEL, projectPoint,
  type Camera, type GalaxyData, type GalaxyGroup, type GalaxyLayer, type GalaxyNode, type Vec3,
} from "../src/galaxy.js";

const ALL: GalaxyLayer[] = ["common", "project", "bot", "knowledge", "memory", "user", "skill"];
const dist = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

function sample(): GalaxyData {
  const groups: GalaxyGroup[] = [
    { key: "common", label: "공통", kind: "common", parents: [] },
    { key: "project:agent-os", label: "AgentOS 대시보드", kind: "project", parents: ["common"] },
    { key: "project:academy", label: "요리학원 홈페이지", kind: "project", parents: ["common"] },
    { key: "project:rimbus", label: "미러 레저", kind: "project", parents: ["common"] },
    { key: "bot:design", label: "대시보드개선_화면디자인", kind: "bot", parents: ["project:agent-os"] },
    { key: "bot:code", label: "대시보드개선_코드구현", kind: "bot", parents: ["project:agent-os"] },
    { key: "bot:blog", label: "콘텐츠_블로그제목", kind: "bot", parents: ["project:academy"] },
    { key: "bot:youtube", label: "콘텐츠_유튜브분석", kind: "bot", parents: ["project:agent-os", "project:academy"] },
    { key: "bot:chief", label: "비서실장", kind: "bot", parents: ["project:agent-os", "project:academy", "project:rimbus"] },
  ];
  const nodes: GalaxyNode[] = groups.map(g => ({ id: `hub:${g.key}`, label: g.label, layer: g.kind, group: g.key }));
  nodes.push(
    { id: "k1", label: "배포 순서", layer: "knowledge", group: "common", text: "배포는 금요일에 하지 않는다", original: "Never deploy on Friday" },
    { id: "m1", label: "색상 취향", layer: "memory", group: "bot:design", text: "사장님은 차분한 초록을 좋아한다" },
    { id: "u1", label: "사장님 일정", layer: "user", group: "common", text: "오전에는 회의가 많다", pending: true },
    { id: "s1", label: "blog-title", layer: "skill", group: "bot:blog", text: "블로그 제목 짓기" },
    { id: "m2", label: "학원 메모", layer: "memory", group: "project:academy", text: "수강생 모집 기간" },
    { id: "orphan", label: "주인 없는 기억", layer: "memory", group: "bot:does-not-exist", text: "그룹이 사라짐" },
  );
  return { generatedAt: "2026-09-29T00:00:00Z", groups, nodes, edges: [{ source: "m1", target: "hub:bot:design", kind: "belongs" }] };
}

describe("layoutGalaxy", () => {
  it("is deterministic: same input gives identical positions", () => {
    const a = layoutGalaxy(sample()), b = layoutGalaxy(sample());
    expect([...a.entries()]).toEqual([...b.entries()]);
    // positive control: a different input really changes the layout
    const other = sample(); other.nodes.push({ id: "k2", label: "x", layer: "knowledge", group: "common" });
    expect(layoutGalaxy(other).get("k1")).not.toEqual(a.get("k1")); // shell radius grows with leaf count
  });

  it("positions every node with finite coordinates", () => {
    const data = sample();
    const pos = layoutGalaxy(data);
    expect(pos.size).toBe(data.nodes.length);
    for (const n of data.nodes) {
      const p = pos.get(n.id)!;
      expect(p, n.id).toBeDefined();
      for (const c of [p.x, p.y, p.z]) expect(Number.isFinite(c), n.id).toBe(true);
    }
  });

  it("puts the common hub at the origin and project hubs on the ~340 ring", () => {
    const pos = layoutGalaxy(sample());
    expect(pos.get("hub:common")).toEqual({ x: 0, y: 0, z: 0 });
    for (const k of ["agent-os", "academy", "rimbus"]) {
      const p = pos.get(`hub:project:${k}`)!;
      expect(Math.hypot(p.x, p.z)).toBeCloseTo(340, 5);
      expect(Math.abs(p.y)).toBeLessThanOrEqual(25); // slight vertical offset only
    }
  });

  it("places a single-parent bot closer to its project than to any other project", () => {
    const pos = layoutGalaxy(sample());
    const bot = pos.get("hub:bot:design")!;
    const own = dist(bot, pos.get("hub:project:agent-os")!);
    expect(own).toBeGreaterThan(140);
    expect(own).toBeLessThan(200);
    expect(own).toBeLessThan(dist(bot, pos.get("hub:project:academy")!));
    expect(own).toBeLessThan(dist(bot, pos.get("hub:project:rimbus")!));
    const blog = pos.get("hub:bot:blog")!;
    expect(dist(blog, pos.get("hub:project:academy")!)).toBeLessThan(dist(blog, pos.get("hub:project:agent-os")!));
  });

  it("places a multi-parent bot between its parents, pushed outward, and away from the non-parent", () => {
    const pos = layoutGalaxy(sample());
    const yt = pos.get("hub:bot:youtube")!;
    const a = pos.get("hub:project:agent-os")!, b = pos.get("hub:project:academy")!, r = pos.get("hub:project:rimbus")!;
    const cx = (a.x + b.x) / 2, cz = (a.z + b.z) / 2;
    // outward: further from the origin (horizontally) than the parents' centroid
    expect(Math.hypot(yt.x, yt.z)).toBeGreaterThan(Math.hypot(cx, cz));
    // roughly equidistant to both parents, and nearer to them than to the third project
    expect(Math.abs(dist(yt, a) - dist(yt, b))).toBeLessThan(30);
    expect(dist(yt, a)).toBeLessThan(dist(yt, r));
    // a bot of all three projects sits in an empty gap between projects, clear of the common hub and every project hub
    const chief = pos.get("hub:bot:chief")!;
    expect(dist(chief, pos.get("hub:common")!)).toBeGreaterThan(140);
    for (const q of [a, b, r]) expect(dist(chief, q)).toBeGreaterThan(200);
  });

  it("attaches nodes of an unknown group to the common hub", () => {
    const pos = layoutGalaxy(sample());
    const orphan = pos.get("orphan")!;
    const common = pos.get("hub:common")!;
    expect(dist(orphan, common)).toBeLessThan(120);
    // positive control: a known-group leaf sits near its own hub, far from common
    expect(dist(pos.get("m1")!, pos.get("hub:bot:design")!)).toBeLessThan(80);
    expect(dist(pos.get("m1")!, common)).toBeGreaterThan(200);
  });

  it("keeps existing positions when unrelated groups gain leaves (stable live updates)", () => {
    const before = layoutGalaxy(sample());
    const next = sample(); next.nodes.push({ id: "new-skill", label: "새 스킬", layer: "skill", group: "bot:code" });
    const after = layoutGalaxy(next);
    for (const id of ["hub:common", "hub:project:academy", "hub:bot:design", "m1", "k1"]) expect(after.get(id)).toEqual(before.get(id));
  });

  it("never yields NaN for empty or degenerate input", () => {
    expect(layoutGalaxy({ generatedAt: "", groups: [], nodes: [], edges: [] }).size).toBe(0);
    const pos = layoutGalaxy({ generatedAt: "", groups: [{ key: "bot:x", label: "x", kind: "bot", parents: ["bot:x", "nope"] }], nodes: [
      { id: "hub:bot:x", label: "x", layer: "bot", group: "bot:x" }, { id: "a", label: "a", layer: "memory", group: "bot:x" },
    ], edges: [] });
    for (const p of pos.values()) expect([p.x, p.y, p.z].every(Number.isFinite)).toBe(true);
  });
});

describe("diffNewIds", () => {
  it("returns nothing on first load and only the added ids later", () => {
    const data = sample();
    expect(diffNewIds(new Set(), data).size).toBe(0);
    const prev = new Set(data.nodes.map(n => n.id));
    expect(diffNewIds(prev, data).size).toBe(0);
    const next = sample(); next.nodes.push({ id: "fresh", label: "새 기억", layer: "memory", group: "common" });
    expect([...diffNewIds(prev, next)]).toEqual(["fresh"]);
  });
});

describe("projectPoint", () => {
  const cam: Camera = { yaw: 0.4, pitch: -0.3, distance: 800, fov: Math.PI / 3 };
  it("maps the origin to the canvas centre", () => {
    const p = projectPoint({ x: 0, y: 0, z: 0 }, cam, 1000, 600)!;
    expect(p.sx).toBeCloseTo(500, 6);
    expect(p.sy).toBeCloseTo(300, 6);
    expect(p.depth).toBeCloseTo(800, 6);
  });
  it("returns null behind the camera, a projection in front", () => {
    const flat: Camera = { yaw: 0, pitch: 0, distance: 500, fov: Math.PI / 3 };
    expect(projectPoint({ x: 0, y: 0, z: 600 }, flat, 800, 600)).toBeNull();
    const front = projectPoint({ x: 0, y: 0, z: -100 }, flat, 800, 600); // positive control
    expect(front).not.toBeNull();
    expect(front!.depth).toBeCloseTo(600, 6);
  });
  it("shrinks with distance and flips y to screen space", () => {
    const flat: Camera = { yaw: 0, pitch: 0, distance: 500, fov: Math.PI / 3 };
    const near = projectPoint({ x: 0, y: 50, z: 100 }, flat, 800, 600)!;
    const far = projectPoint({ x: 0, y: 50, z: -100 }, flat, 800, 600)!;
    expect(near.scale).toBeGreaterThan(far.scale);
    expect(near.sy).toBeLessThan(300);
  });
});

describe("filterGalaxy", () => {
  it("keeps the hub of a visible leaf even when its layer is off", () => {
    const data = sample();
    const { visible } = filterGalaxy(data, { query: "", layers: new Set<GalaxyLayer>(["memory"]) });
    expect(visible.has("m1")).toBe(true);
    expect(visible.has("hub:bot:design")).toBe(true); // hub retained
    expect(visible.has("hub:project:academy")).toBe(true); // hub of m2
    expect(visible.has("hub:common")).toBe(true); // orphan memory falls back to common
    expect(visible.has("k1")).toBe(false);
    expect(visible.has("s1")).toBe(false);
    expect(visible.has("hub:bot:blog")).toBe(false); // only a skill leaf → hidden
  });
  it("matches label, text and original case-insensitively after trimming", () => {
    const data = sample();
    const layers = new Set(ALL);
    expect([...filterGalaxy(data, { query: "  friday ", layers }).matched]).toEqual(["k1"]);
    expect([...filterGalaxy(data, { query: "초록", layers }).matched]).toEqual(["m1"]);
    expect([...filterGalaxy(data, { query: "BLOG-TITLE", layers }).matched]).toEqual(["s1"]);
    expect(filterGalaxy(data, { query: "   ", layers }).matched.size).toBe(0);
    expect(filterGalaxy(data, { query: "", layers }).visible.size).toBe(data.nodes.length);
  });
  it("does not match nodes hidden by the layer filter", () => {
    const data = sample();
    expect(filterGalaxy(data, { query: "friday", layers: new Set<GalaxyLayer>(["memory"]) }).matched.size).toBe(0);
    expect(filterGalaxy(data, { query: "friday", layers: new Set<GalaxyLayer>(["knowledge"]) }).matched.has("k1")).toBe(true);
  });
});

describe("LAYER_LABEL", () => {
  it("has Korean labels for every layer", () => {
    expect(LAYER_LABEL).toEqual({ common: "공통", project: "프로젝트", bot: "봇", knowledge: "지식", memory: "기억", user: "사장님 정보", skill: "스킬" });
  });
});
