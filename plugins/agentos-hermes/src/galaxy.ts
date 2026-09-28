// 기억 은하(Memory Galaxy) — 순수 계산 모듈. DOM·React 없이 테스트할 수 있다.
// 배치는 결정적이다: id 해시만 쓰고 Math.random은 쓰지 않는다.

export type GalaxyLayer = "common" | "project" | "bot" | "knowledge" | "memory" | "user" | "skill";
/** key: "common" | "project:<k>" | "bot:<profile>". project parents = ["common"]; bot parents = project group keys (1..n). */
export interface GalaxyGroup { key: string; label: string; kind: "common" | "project" | "bot"; parents: string[] }
/**
 * Hub nodes: layer common/project/bot with id `hub:${group}`. Leaf nodes (knowledge|memory|user|skill) orbit the hub of their group.
 * text = full display text (Korean when available), original = English source when different, pending = Korean translation not generated yet.
 */
export interface GalaxyNode { id: string; label: string; layer: GalaxyLayer; group: string; text?: string; original?: string; pending?: boolean; updatedAt?: string | null }
export interface GalaxyEdge { source: string; target: string; kind: "belongs" | "related" }
export interface GalaxyData { generatedAt: string; groups: GalaxyGroup[]; nodes: GalaxyNode[]; edges: GalaxyEdge[] }
export interface Vec3 { x: number; y: number; z: number }
/** yaw/pitch/fov in radians; the camera orbits the origin at `distance` and looks at it. */
export interface Camera { yaw: number; pitch: number; distance: number; fov: number }

export const LAYER_LABEL: Record<GalaxyLayer, string> = {
  common: "공통", project: "프로젝트", bot: "봇", knowledge: "지식", memory: "기억", user: "사장님 정보", skill: "스킬",
};

const HUB_LAYERS: ReadonlySet<GalaxyLayer> = new Set<GalaxyLayer>(["common", "project", "bot"]);
const PROJECT_RING = 340;
const BOT_ORBIT = 165;
const BOT_ARC = 1.05; // radians between sibling bots around their project
const SHARED_GAP = 130; // spacing between bots that share the same set of projects
const TAU = Math.PI * 2;

/** FNV-1a 32-bit → [0, 1). */
function hash01(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0) / 4294967296;
}
const finite = (n: number) => (Number.isFinite(n) ? n : 0);
const v = (x: number, y: number, z: number): Vec3 => ({ x: finite(x), y: finite(y), z: finite(z) });

function groupPositions(groups: GalaxyGroup[]): Map<string, Vec3> {
  const pos = new Map<string, Vec3>([["common", v(0, 0, 0)]]);
  const byKey = new Map(groups.map(g => [g.key, g]));

  const projects = groups.filter(g => g.kind === "project" && g.key !== "common").map(g => g.key).sort();
  const ring = Math.max(PROJECT_RING, projects.length * 76); // many projects → wider ring so bots stay nearest their own project
  projects.forEach((key, i) => {
    const a = -Math.PI / 2 + (TAU * i) / Math.max(1, projects.length);
    pos.set(key, v(Math.cos(a) * ring, (hash01(`${key}:y`) - 0.5) * 50, Math.sin(a) * ring));
  });

  const bots = groups.filter(g => g.kind === "bot").sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const parentsOf = (g: GalaxyGroup) => {
    // only common/project hubs are placed at this point, so pos.has() also rejects bot-on-bot or unknown parents
    const real = Array.from(new Set((g.parents ?? []).filter(p => p !== "common" && pos.has(p) && byKey.get(p)?.kind !== "bot"))).sort();
    return real.length ? real : ["common"];
  };
  // siblings share the same parent set (single or multi)
  const buckets = new Map<string, GalaxyGroup[]>();
  for (const b of bots) {
    const sig = parentsOf(b).join("|");
    const list = buckets.get(sig) ?? [];
    list.push(b);
    buckets.set(sig, list);
  }
  // buckets whose parents surround the centre go last, so they can pick a gap no other bot already uses
  const surrounds = (sig: string) => {
    const ps = sig.split("|");
    if (ps.length < 2) return false;
    const q = ps.map(p => pos.get(p) ?? v(0, 0, 0));
    return Math.hypot(q.reduce((s, p) => s + p.x, 0) / q.length, q.reduce((s, p) => s + p.z, 0) / q.length) <= 40;
  };
  const ordered = [...buckets].sort(([x], [y]) => Number(surrounds(x)) - Number(surrounds(y)));
  for (const [sig, list] of ordered) {
    const parents = sig.split("|");
    const k = list.length;
    if (parents.length === 1) {
      const pp = pos.get(parents[0]) ?? v(0, 0, 0);
      const flat = Math.hypot(pp.x, pp.z);
      const a0 = flat > 1 ? Math.atan2(pp.z, pp.x) : hash01(`${sig}:a`) * TAU;
      const step = k > 1 ? Math.min(BOT_ARC, 4.2 / (k - 1)) : 0;
      list.forEach((b, i) => {
        const a = a0 + (i - (k - 1) / 2) * step;
        // alternate up/down so neighbouring labels never share a line
        const lift = (i % 2 ? 1 : -1) * 34 + (hash01(`${b.key}:y`) - 0.5) * 16;
        pos.set(b.key, v(pp.x + Math.cos(a) * BOT_ORBIT, pp.y + lift, pp.z + Math.sin(a) * BOT_ORBIT));
      });
      continue;
    }
    const ps = parents.map(p => pos.get(p) ?? v(0, 0, 0));
    const c = v(ps.reduce((s, p) => s + p.x, 0) / ps.length, ps.reduce((s, p) => s + p.y, 0) / ps.length, ps.reduce((s, p) => s + p.z, 0) / ps.length);
    const flat = Math.hypot(c.x, c.z);
    if (flat > 40) {
      const dx = c.x / flat, dz = c.z / flat;
      list.forEach((b, i) => {
        const side = (i - (k - 1) / 2) * SHARED_GAP;
        pos.set(b.key, v(c.x + dx * 110 - dz * side, c.y + 60 + (hash01(`${b.key}:y`) - 0.5) * 30, c.z + dz * 110 + dx * side));
      });
    } else {
      // parents surround the centre evenly (e.g. the chief of staff on every project): sit in the widest empty
      // gap between project hubs, half way out. Floating above the common hub projected straight onto the back
      // project from the default downward-looking camera.
      const angles = parents.map(p => { const q = pos.get(p)!; return Math.atan2(q.z, q.x); }).sort((x, y) => x - y);
      const r = ring * 0.5;
      const placedBots = [...pos.entries()].filter(([key]) => byKey.get(key)?.kind === "bot").map(([, p]) => p);
      // widest gap first; among equal gaps, the one farthest from bots already placed
      let gapMid = 0, best = -Infinity;
      angles.forEach((a, i) => {
        const nextA = i + 1 < angles.length ? angles[i + 1] : angles[0] + TAU;
        const mid = a + (nextA - a) / 2;
        const spot = v(Math.cos(mid) * r, 0, Math.sin(mid) * r);
        const clear = placedBots.reduce((m, p) => Math.min(m, Math.hypot(p.x - spot.x, p.z - spot.z)), 1e6);
        const score = (nextA - a) * 1e4 + Math.min(clear, 1e4 - 1);
        if (score > best + 1e-9) { best = score; gapMid = mid; }
      });
      list.forEach((b, i) => {
        const a = gapMid + (i - (k - 1) / 2) * (SHARED_GAP / r);
        pos.set(b.key, v(Math.cos(a) * r, c.y + 30 + (hash01(`${b.key}:y`) - 0.5) * 20, Math.sin(a) * r));
      });
    }
  }
  return pos;
}

function shellRadius(kind: string, n: number): number {
  return kind === "bot" ? 22 + 7 * Math.sqrt(n) : 40 + 10 * Math.sqrt(n);
}

/**
 * Deterministic 3D layout. Common hub at the origin, project hubs on a ~340 ring, bots orbit their project (~165),
 * multi-parent bots at their parents' centroid pushed outward, leaves on a flattened shell around their hub.
 * Nodes whose group is unknown attach to common.
 */
export function layoutGalaxy(data: GalaxyData): Map<string, Vec3> {
  const groups = data.groups ?? [];
  const gpos = groupPositions(groups);
  const kindOf = new Map(groups.map(g => [g.key, g.kind]));
  kindOf.set("common", "common");
  const out = new Map<string, Vec3>();

  const leavesByGroup = new Map<string, GalaxyNode[]>();
  for (const node of data.nodes ?? []) {
    const known = gpos.has(node.group);
    if (HUB_LAYERS.has(node.layer) && known && node.id === `hub:${node.group}`) { out.set(node.id, gpos.get(node.group)!); continue; }
    const g = known ? node.group : "common";
    const list = leavesByGroup.get(g) ?? [];
    list.push(node);
    leavesByGroup.set(g, list);
  }
  for (const [g, list] of leavesByGroup) {
    const c = gpos.get(g) ?? v(0, 0, 0);
    const R = shellRadius(kindOf.get(g) ?? "common", list.length);
    const tilt = (hash01(`${g}:tilt`) - 0.5) * 0.9;
    const ct = Math.cos(tilt), st = Math.sin(tilt);
    for (const node of list) {
      if (out.has(node.id)) continue;
      const theta = hash01(`${node.id}:u`) * TAU;
      const cosPhi = hash01(`${node.id}:v`) * 2 - 1;
      const sinPhi = Math.sqrt(Math.max(0, 1 - cosPhi * cosPhi));
      const r = R * (0.78 + 0.34 * hash01(`${node.id}:r`));
      const lx = Math.cos(theta) * sinPhi * r, ly = cosPhi * r * 0.55, lz = Math.sin(theta) * sinPhi * r;
      // tilt the flattened shell around X so each cluster has its own plane
      out.set(node.id, v(c.x + lx, c.y + ly * ct - lz * st, c.z + ly * st + lz * ct));
    }
  }
  return out;
}

/** Ids present now but not in `prev`. Empty on first load (prev empty). */
export function diffNewIds(prev: Set<string>, data: GalaxyData): Set<string> {
  const out = new Set<string>();
  if (prev.size === 0) return out;
  for (const n of data.nodes ?? []) if (!prev.has(n.id)) out.add(n.id);
  return out;
}

const NEAR = 1;
/** Perspective projection for an orbit camera looking at the origin. Returns null when the point is behind the camera. */
export function projectPoint(p: Vec3, cam: Camera, width: number, height: number): { sx: number; sy: number; scale: number; depth: number } | null {
  const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  const x1 = p.x * cy - p.z * sy;
  const z1 = p.x * sy + p.z * cy;
  const y2 = p.y * cp - z1 * sp;
  const z2 = p.y * sp + z1 * cp;
  const depth = cam.distance - z2;
  if (!(depth > NEAR)) return null;
  const f = (height / 2) / Math.tan(Math.max(0.05, Math.min(3, cam.fov)) / 2);
  const scale = f / depth;
  const sx = width / 2 + x1 * scale, syy = height / 2 - y2 * scale;
  if (!Number.isFinite(sx) || !Number.isFinite(syy)) return null;
  return { sx, sy: syy, scale, depth };
}

/**
 * visible: nodes whose layer is enabled, plus the hub of every visible leaf.
 * matched: visible nodes whose label/text/original contains the trimmed query (case-insensitive); empty when the query is blank.
 */
export function filterGalaxy(data: GalaxyData, opts: { query: string; layers: Set<GalaxyLayer> }): { visible: Set<string>; matched: Set<string> } {
  const visible = new Set<string>();
  const known = new Set((data.groups ?? []).map(g => g.key));
  const ids = new Set((data.nodes ?? []).map(n => n.id));
  for (const n of data.nodes ?? []) {
    if (!opts.layers.has(n.layer)) continue;
    visible.add(n.id);
    if (!HUB_LAYERS.has(n.layer) || n.id !== `hub:${n.group}`) {
      const hub = `hub:${known.has(n.group) ? n.group : "common"}`;
      if (ids.has(hub)) visible.add(hub);
    }
  }
  const matched = new Set<string>();
  const q = (opts.query ?? "").trim().toLocaleLowerCase();
  if (q.length >= 1) {
    for (const n of data.nodes ?? []) {
      if (!visible.has(n.id)) continue;
      const hay = `${n.label ?? ""}\n${n.text ?? ""}\n${n.original ?? ""}`.toLocaleLowerCase();
      if (hay.includes(q)) matched.add(n.id);
    }
  }
  return { visible, matched };
}
