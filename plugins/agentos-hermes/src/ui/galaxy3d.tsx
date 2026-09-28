// 기억 은하 3D — Canvas 2D 원근 렌더링(WebGL·외부 라이브러리 없음).
// 배치·투영·필터 계산은 ../galaxy.ts(순수 함수)에 있고, 여기서는 그리기와 조작만 한다.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  diffNewIds, filterGalaxy, layoutGalaxy, LAYER_LABEL, projectPoint,
  type Camera, type GalaxyData, type GalaxyLayer, type GalaxyNode, type Vec3,
} from "../galaxy.js";

type RGB = readonly [number, number, number];
const LAYERS: GalaxyLayer[] = ["common", "project", "bot", "knowledge", "memory", "user", "skill"];
const COLOR: Record<GalaxyLayer, RGB> = {
  common: [230, 198, 136], // warm gold
  project: [156, 190, 234], // soft blue
  bot: [189, 209, 170], // sage (= --h-accent)
  knowledge: [118, 208, 192], // teal
  memory: [238, 243, 234], // near-white
  user: [228, 160, 178], // rose
  skill: [178, 160, 234], // violet
};
const rgb = (c: RGB) => `${c[0]},${c[1]},${c[2]}`;
const HUB_LAYERS = new Set<GalaxyLayer>(["common", "project", "bot"]);
const isHub = (n: GalaxyNode) => HUB_LAYERS.has(n.layer) && n.id === `hub:${n.group}`;
const GLOW: Record<GalaxyLayer, number> = { common: 30, project: 23, bot: 15, knowledge: 7, memory: 6.5, user: 7.5, skill: 7 };
const HAZE: Partial<Record<GalaxyLayer, [number, number]>> = { common: [210, 0.2], project: [160, 0.16], bot: [72, 0.08] }; // world radius, alpha
const MAX_NODES = 1500;
const BIRTH_MS = 1200;
const IDLE_RESUME_MS = 4500;
const SPIN = 0.05; // rad/s
const FOV = (48 * Math.PI) / 180;
const DEFAULT_VIEW = { yaw: 0.22, pitch: 0.72, zoom: 1 };
/** Tall, narrow canvases (phones) look down more steeply so the flat disc fills the height instead of a thin band. */
const pitchFor = (w: number, h: number) => (w > 0 && h / w > 1.2 ? 1.08 : DEFAULT_VIEW.pitch); // first project sits at the back, the rest fan out left/right
const ZOOM_MIN = 0.55, ZOOM_MAX = 3.2;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

// ---------- sprites (pre-rendered once per colour) ----------
type Sprites = { star: Record<GalaxyLayer, HTMLCanvasElement>; haze: Record<GalaxyLayer, HTMLCanvasElement> };
let spriteCache: Sprites | null = null;
function makeCanvas(size: number) { const c = document.createElement("canvas"); c.width = c.height = size; return c; }
function starSprite(c: RGB): HTMLCanvasElement {
  const cv = makeCanvas(128), g = cv.getContext("2d")!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  const s = rgb(c);
  grd.addColorStop(0, "rgba(255,253,246,1)");
  grd.addColorStop(0.07, `rgba(${s},1)`);
  grd.addColorStop(0.18, `rgba(${s},.55)`);
  grd.addColorStop(0.42, `rgba(${s},.12)`);
  grd.addColorStop(1, `rgba(${s},0)`);
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  return cv;
}
function hazeSprite(c: RGB, seed: number): HTMLCanvasElement {
  const cv = makeCanvas(256), g = cv.getContext("2d")!;
  g.globalCompositeOperation = "lighter";
  const rnd = mulberry(seed);
  const tints: RGB[] = [c, [c[0] * 0.7 + 60, c[1] * 0.8 + 40, c[2] * 0.9 + 30], [118, 208, 192]];
  for (let i = 0; i < 6; i++) {
    const x = 128 + (rnd() - 0.5) * 90, y = 128 + (rnd() - 0.5) * 60, r = 50 + rnd() * 70;
    const t = tints[i % tints.length];
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, `rgba(${rgb(t.map(Math.round) as unknown as RGB)},${i === 0 ? 0.55 : 0.28})`);
    grd.addColorStop(1, `rgba(${rgb(t.map(Math.round) as unknown as RGB)},0)`);
    g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
  }
  // fade to the edge so the square never shows
  g.globalCompositeOperation = "destination-in";
  const mask = g.createRadialGradient(128, 128, 30, 128, 128, 128);
  mask.addColorStop(0, "rgba(0,0,0,1)"); mask.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = mask; g.fillRect(0, 0, 256, 256);
  return cv;
}
function sprites(): Sprites {
  if (spriteCache) return spriteCache;
  const star = {} as Record<GalaxyLayer, HTMLCanvasElement>, haze = {} as Record<GalaxyLayer, HTMLCanvasElement>;
  LAYERS.forEach((l, i) => { star[l] = starSprite(COLOR[l]); haze[l] = hazeSprite(COLOR[l], 97 + i * 13); });
  return (spriteCache = { star, haze });
}
function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
type StarDot = { x: number; y: number; z: number; s: number; a: number; tw: boolean; sp: number; ph: number };
const STARFIELD: StarDot[] = (() => {
  const r = mulberry(1337), out: StarDot[] = [];
  for (let i = 0; i < 240; i++) {
    const z = r();
    out.push({ x: r(), y: r(), z, s: z > 0.93 ? 1.6 : z > 0.7 ? 1.1 : 0.8, a: 0.12 + z * 0.5, tw: r() < 0.3, sp: 0.0006 + r() * 0.0016, ph: r() * 6.28 });
  }
  return out;
})();
const easeOutBack = (t: number) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2; };
type Box = [number, number, number, number];
const overlapArea = (a: Box, boxes: Box[]) => boxes.reduce((sum, b) => sum + Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1])), 0);
const trunc = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// ---------- scene model ----------
type SceneEdge = { a: string; b: string; kind: "tree" | "belongs" | "related" };
type Scene = {
  nodes: GalaxyNode[]; byId: Map<string, GalaxyNode>; edges: SceneEdge[]; groupLabel: Map<string, string>;
  leafCount: Map<string, number>; hubOf: Map<string, string>; capped: boolean; total: number;
};
function buildScene(data: GalaxyData): Scene {
  const all = data.nodes ?? [];
  let nodes = all;
  const capped = all.length > MAX_NODES;
  if (capped) {
    const hubs = all.filter(isHub);
    const leaves = all.filter(n => !isHub(n)).sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")) || (a.id < b.id ? -1 : 1));
    nodes = [...hubs.slice(0, MAX_NODES), ...leaves.slice(0, Math.max(0, MAX_NODES - hubs.length))];
  }
  const byId = new Map(nodes.map(n => [n.id, n]));
  const groups = data.groups ?? [];
  const known = new Set(groups.map(g => g.key));
  const groupLabel = new Map(groups.map(g => [g.key, g.label]));
  if (!groupLabel.has("common")) groupLabel.set("common", LAYER_LABEL.common);
  const hubOf = new Map<string, string>();
  const leafCount = new Map<string, number>();
  const edges: SceneEdge[] = [];
  const seen = new Set<string>();
  const add = (a: string, b: string, kind: SceneEdge["kind"]) => {
    if (a === b || !byId.has(a) || !byId.has(b)) return;
    const k = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (seen.has(k)) return;
    seen.add(k); edges.push({ a, b, kind });
  };
  for (const g of groups) {
    if (g.kind === "project") add("hub:common", `hub:${g.key}`, "tree");
    if (g.kind === "bot") {
      const ps = (g.parents ?? []).filter(p => byId.has(`hub:${p}`) && p !== g.key);
      (ps.length ? ps : ["common"]).forEach(p => add(`hub:${p}`, `hub:${g.key}`, "tree"));
    }
  }
  for (const n of nodes) {
    if (isHub(n)) continue;
    const hub = `hub:${known.has(n.group) ? n.group : "common"}`;
    hubOf.set(n.id, hub);
    leafCount.set(hub, (leafCount.get(hub) ?? 0) + 1);
    add(hub, n.id, "belongs");
  }
  for (const e of data.edges ?? []) add(e.source, e.target, e.kind === "related" ? "related" : "belongs");
  return { nodes, byId, edges, groupLabel, leafCount, hubOf, capped, total: all.length };
}

type Proj = { id: string; sx: number; sy: number; r: number; depth: number; hub: boolean };
// panX/panY: screen-space shift in CSS px (middle-button drag), eased back to 0 by 시점 초기화
type View = { yaw: number; pitch: number; zoom: number; tYaw: number; tPitch: number; tZoom: number; panX: number; panY: number; tPanX: number; tPanY: number; easing: boolean; vYaw: number; vPitch: number; lastInteract: number };

function prefersReduced() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
const fmtTime = (s?: string | null) => {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
};

export function MemoryGalaxy3D({ data }: { data: GalaxyData }) {
  const [layers, setLayers] = useState<Set<GalaxyLayer>>(() => new Set(LAYERS));
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [reduced, setReduced] = useState(prefersReduced);
  const [spin, setSpin] = useState(() => !prefersReduced());
  const [listOpen, setListOpen] = useState(false);
  const [born, setBorn] = useState(0);

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const scene = useMemo(() => buildScene(data), [data]);
  const filter = useMemo(() => filterGalaxy(data, { query, layers }), [data, query, layers]);
  const hasQuery = query.trim().length > 0;

  // mutable engine state (read by the render loop without re-rendering React)
  const sceneRef = useRef(scene);
  const filterRef = useRef({ ...filter, hasQuery });
  const posRef = useRef(new Map<string, Vec3>());
  const extentRef = useRef({ r: 0, xz: 0, y: 0 });
  const prevIdsRef = useRef(new Set<string>());
  const birthRef = useRef(new Map<string, number>());
  const selRef = useRef<string | null>(null);
  const hoverRef = useRef<string | null>(null);
  const spinRef = useRef(spin);
  const reducedRef = useRef(reduced);
  const viewRef = useRef<View>({ ...DEFAULT_VIEW, tYaw: DEFAULT_VIEW.yaw, tPitch: DEFAULT_VIEW.pitch, tZoom: 1, panX: 0, panY: 0, tPanX: 0, tPanY: 0, easing: false, vYaw: 0, vPitch: 0, lastInteract: -1e9 });
  const projRef = useRef<Proj[]>([]);
  const labelRef = useRef<{ drawn: { id: string; box: [number, number, number, number] }[]; hidden: string[] }>({ drawn: [], hidden: [] });
  const requestRef = useRef<() => void>(() => {});

  // live data: keep old positions, animate newcomers
  useEffect(() => {
    sceneRef.current = scene;
    const fresh = layoutGalaxy({ ...data, nodes: scene.nodes });
    const old = posRef.current, next = new Map<string, Vec3>();
    const ext = { r: 0, xz: 0, y: 0 };
    for (const n of scene.nodes) {
      const p = old.get(n.id) ?? fresh.get(n.id) ?? { x: 0, y: 0, z: 0 };
      next.set(n.id, p);
      ext.r = Math.max(ext.r, Math.hypot(p.x, p.y, p.z)); ext.xz = Math.max(ext.xz, Math.hypot(p.x, p.z)); ext.y = Math.max(ext.y, Math.abs(p.y));
    }
    posRef.current = next;
    // grow-only so the camera never jumps inward when a live update arrives
    const e0 = extentRef.current;
    extentRef.current = { r: Math.max(e0.r, ext.r + 30, 200), xz: Math.max(e0.xz, ext.xz + 20, 180), y: Math.max(e0.y, ext.y + 20, 60) };
    const fresh_ids = diffNewIds(prevIdsRef.current, data);
    prevIdsRef.current = new Set((data.nodes ?? []).map(n => n.id));
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (fresh_ids.size) {
      if (!reducedRef.current) { const t = performance.now(); fresh_ids.forEach(id => birthRef.current.set(id, t)); }
      setBorn(fresh_ids.size);
      timer = setTimeout(() => setBorn(0), 5000);
    }
    requestRef.current();
    return () => { if (timer) clearTimeout(timer); };
  }, [data, scene]);
  useEffect(() => { filterRef.current = { ...filter, hasQuery }; requestRef.current(); }, [filter, hasQuery]);
  useEffect(() => { selRef.current = selected; requestRef.current(); }, [selected]);
  useEffect(() => { spinRef.current = spin; viewRef.current.lastInteract = -1e9; requestRef.current(); }, [spin]);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => { setReduced(mq.matches); if (mq.matches) setSpin(false); };
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  useEffect(() => { reducedRef.current = reduced; if (reduced) birthRef.current.clear(); requestRef.current(); }, [reduced]);

  // ---------- engine: sizing, loop, input ----------
  useEffect(() => {
    const canvas = canvasRef.current, wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const sp = sprites();
    let w = 0, h = 0, dpr = 1, raf = 0, last = 0, onScreen = true, bg: HTMLCanvasElement | null = null;
    const view = viewRef.current;

    const buildBg = () => {
      bg = makeCanvas(1); bg.width = Math.max(1, Math.round(w * dpr)); bg.height = Math.max(1, Math.round(h * dpr));
      const g = bg.getContext("2d")!; g.scale(dpr, dpr);
      g.fillStyle = "#080c0b"; g.fillRect(0, 0, w, h);
      const R = Math.max(w, h);
      let grd = g.createRadialGradient(w * 0.5, h * 0.46, 0, w * 0.5, h * 0.46, R * 0.72);
      grd.addColorStop(0, "#16231f"); grd.addColorStop(0.45, "#0e1614"); grd.addColorStop(1, "#070a09");
      g.fillStyle = grd; g.fillRect(0, 0, w, h);
      // faint milky band
      g.save(); g.translate(w / 2, h / 2); g.rotate(-0.38); g.scale(1, 0.22);
      grd = g.createRadialGradient(0, 0, 0, 0, 0, R * 0.7);
      grd.addColorStop(0, "rgba(189,209,170,.07)"); grd.addColorStop(0.6, "rgba(156,190,234,.025)"); grd.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grd; g.fillRect(-R, -R * 4, R * 2, R * 8); g.restore();
      // vignette
      grd = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, R * 0.78);
      grd.addColorStop(0, "rgba(0,0,0,0)"); grd.addColorStop(1, "rgba(0,0,0,.5)");
      g.fillStyle = grd; g.fillRect(0, 0, w, h);
    };
    const resize = () => {
      const r = wrap.getBoundingClientRect();
      w = Math.max(1, Math.round(r.width)); h = Math.max(1, Math.round(r.height));
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      if (view.lastInteract < 0) { view.pitch = view.tPitch = pitchFor(w, h); }
      buildBg(); schedule();
    };
    // Fit once per (data, size): bisection on camera distance so every node stays inside the frame at the default
    // pitch for any yaw (sampled every 45°). Grow-only across live updates so the view never jumps inward.
    let fitKey = "", fitBase = 0;
    const fitDistance = () => {
      const pos = posRef.current;
      const key = `${w}x${h}:${pos.size}:${extentRef.current.r}`;
      if (key === fitKey) return fitBase;
      const pts = [...pos.values()];
      const padX = w < 520 ? 16 : Math.min(90, w * 0.1), padTop = 44, padBot = 36;
      const fits = (d: number) => {
        for (let a = 0; a < 8; a++) {
          const cam: Camera = { yaw: (a * Math.PI) / 4, pitch: pitchFor(w, h), distance: d, fov: FOV };
          for (const p of pts) {
            const q = projectPoint(p, cam, w, h);
            if (!q || q.sx < padX || q.sx > w - padX || q.sy < padTop || q.sy > h - padBot) return false;
          }
        }
        return true;
      };
      let lo = extentRef.current.r * 1.05, hi = extentRef.current.r * 12;
      if (!pts.length || fits(lo)) hi = lo;
      else for (let i = 0; i < 22; i++) { const mid = (lo + hi) / 2; if (fits(mid)) hi = mid; else lo = mid; }
      fitBase = fitKey && fitKey.startsWith(`${w}x${h}:`) ? Math.max(fitBase, hi) : hi;
      fitKey = key;
      return fitBase;
    };
    const camera = (): { cam: Camera; ref: number } => {
      const f = h / 2 / Math.tan(FOV / 2);
      const base = fitDistance();
      return { cam: { yaw: view.yaw, pitch: view.pitch, distance: base / view.zoom, fov: FOV }, ref: f / base };
    };

    const step = (now: number, dt: number) => {
      const reducedNow = reducedRef.current;
      let moving = false;
      if (view.easing) {
        const k = reducedNow ? 1 : 1 - Math.exp(-dt * 5);
        view.yaw += (view.tYaw - view.yaw) * k; view.pitch += (view.tPitch - view.pitch) * k; view.zoom += (view.tZoom - view.zoom) * k;
        view.panX += (view.tPanX - view.panX) * k; view.panY += (view.tPanY - view.panY) * k;
        if (Math.abs(view.tYaw - view.yaw) < 1e-3 && Math.abs(view.tPitch - view.pitch) < 1e-3 && Math.abs(view.tZoom - view.zoom) < 1e-3 && Math.abs(view.tPanX - view.panX) < 0.5 && Math.abs(view.tPanY - view.panY) < 0.5) {
          view.yaw = view.tYaw; view.pitch = view.tPitch; view.zoom = view.tZoom; view.panX = view.tPanX; view.panY = view.tPanY; view.easing = false;
        } else moving = true;
      }
      if (!reducedNow && (Math.abs(view.vYaw) > 1e-4 || Math.abs(view.vPitch) > 1e-4) && !dragging) {
        view.yaw += view.vYaw * dt; view.pitch = clamp(view.pitch + view.vPitch * dt, -1.25, 1.25);
        const decay = Math.exp(-dt * 3.2); view.vYaw *= decay; view.vPitch *= decay; moving = true;
      }
      if (!reducedNow && spinRef.current && !dragging && !view.easing && now - view.lastInteract > IDLE_RESUME_MS) { view.yaw += SPIN * dt; moving = true; }
      return moving;
    };

    const draw = (now: number) => {
      if (!w || !h || !bg) return;
      const sc = sceneRef.current, pos = posRef.current, flt = filterRef.current, reducedNow = reducedRef.current;
      const sel = selRef.current, hov = hoverRef.current;
      const { cam, ref } = camera();
      const panned = (p: Vec3) => { const q = projectPoint(p, cam, w, h); if (q) { q.sx += view.panX; q.sy += view.panY; } return q; };
      const ext = extentRef.current.r;
      const nearD = cam.distance - ext, farD = cam.distance + ext;
      const depthA = (d: number) => clamp(1 - 0.62 * ((d - nearD) / (farD - nearD)), 0.28, 1);
      const k = clamp(Math.min(w, h) / 560, 0.7, 1.12);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
      ctx.drawImage(bg, 0, 0, w, h);

      // starfield with a hint of parallax
      ctx.globalCompositeOperation = "lighter";
      for (const s of STARFIELD) {
        const x = ((((s.x + view.yaw * 0.018 * s.z) % 1) + 1) % 1) * w;
        const y = ((((s.y + view.pitch * 0.03 * s.z) % 1) + 1) % 1) * h;
        const a = s.a * (s.tw && !reducedNow ? 0.55 + 0.45 * Math.sin(now * s.sp + s.ph) : 0.8);
        ctx.fillStyle = `rgba(214,228,218,${a.toFixed(3)})`;
        ctx.fillRect(x, y, s.s, s.s);
      }

      // project everything visible
      type Item = { n: GalaxyNode; sx: number; sy: number; scale: number; depth: number };
      const items: Item[] = [];
      const pmap = new Map<string, Item>();
      for (const n of sc.nodes) {
        if (!flt.visible.has(n.id)) continue;
        const p = pos.get(n.id); if (!p) continue;
        const pr = panned(p); if (!pr) continue;
        const it = { n, sx: pr.sx, sy: pr.sy, scale: pr.scale, depth: pr.depth };
        items.push(it); pmap.set(n.id, it);
      }
      const dimOf = (n: GalaxyNode) => {
        if (!flt.hasQuery) return 1;
        if (flt.matched.has(n.id)) return 1;
        return isHub(n) ? 0.35 : 0.12;
      };
      const sizeOf = (it: Item) => clamp(Math.pow(it.scale / ref, 0.85), 0.35, 4);

      // nebula haze around hubs
      for (const it of items) {
        const hz = isHub(it.n) ? HAZE[it.n.layer] : undefined;
        if (!hz) continue;
        const r = hz[0] * it.scale * (0.9 + 0.1 * Math.sqrt((sc.leafCount.get(it.n.id) ?? 0) / 20 + 1));
        ctx.globalAlpha = hz[1] * depthA(it.depth) * (flt.hasQuery ? 0.5 : 1);
        ctx.drawImage(sp.haze[it.n.layer], it.sx - r, it.sy - r * 0.85, r * 2, r * 1.7);
      }

      // orbit ring through the project hubs
      const projects = items.filter(it => it.n.layer === "project" && isHub(it.n));
      if (projects.length) {
        let ringR = 0, ringY = 0;
        for (const it of projects) { const p = pos.get(it.n.id)!; ringR += Math.hypot(p.x, p.z); ringY += p.y; }
        ringR /= projects.length; ringY /= projects.length;
        ctx.lineWidth = 1; ctx.setLineDash([2, 7]);
        let prev: ReturnType<typeof projectPoint> = null;
        for (let i = 0; i <= 120; i++) {
          const a = (i / 120) * Math.PI * 2;
          const pr = panned({ x: Math.cos(a) * ringR, y: ringY, z: Math.sin(a) * ringR });
          if (pr && prev) {
            ctx.strokeStyle = `rgba(230,198,136,${(0.16 * depthA((pr.depth + prev.depth) / 2)).toFixed(3)})`;
            ctx.beginPath(); ctx.moveTo(prev.sx, prev.sy); ctx.lineTo(pr.sx, pr.sy); ctx.stroke();
          }
          prev = pr;
        }
        ctx.setLineDash([]);
      }

      // edges
      ctx.globalAlpha = 1;
      for (const e of sc.edges) {
        const a = pmap.get(e.a), b = pmap.get(e.b);
        if (!a || !b) continue;
        const touch = sel != null && (e.a === sel || e.b === sel);
        const base = e.kind === "tree" ? 0.34 : e.kind === "related" ? 0.2 : 0.075;
        const alpha = (touch ? 0.75 : base) * depthA((a.depth + b.depth) / 2) * Math.min(dimOf(a.n), dimOf(b.n)) ** 0.6;
        if (alpha < 0.01) continue;
        ctx.lineWidth = e.kind === "tree" ? 1.1 : touch ? 1.1 : 0.6;
        if (e.kind === "tree") {
          const grd = ctx.createLinearGradient(a.sx, a.sy, b.sx, b.sy);
          grd.addColorStop(0, `rgba(${rgb(COLOR[a.n.layer])},${alpha.toFixed(3)})`);
          grd.addColorStop(1, `rgba(${rgb(COLOR[b.n.layer])},${alpha.toFixed(3)})`);
          ctx.strokeStyle = grd;
        } else ctx.strokeStyle = `rgba(${rgb(COLOR[b.n.layer])},${alpha.toFixed(3)})`;
        if (e.kind === "related") ctx.setLineDash([3, 4]);
        ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
        if (e.kind === "related") ctx.setLineDash([]);
      }

      // stars, far → near
      items.sort((p, q) => q.depth - p.depth);
      const proj: Proj[] = [];
      let births = false;
      for (const it of items) {
        const n = it.n, hub = isHub(n);
        let bs = 1, flash = 0;
        const t0 = birthRef.current.get(n.id);
        if (t0 != null) {
          const t = (now - t0) / BIRTH_MS;
          if (t >= 1 || reducedNow) birthRef.current.delete(n.id);
          else { births = true; bs = Math.max(0.01, easeOutBack(Math.min(1, t / 0.6))); flash = 1 - t; }
        }
        const breathe = hub && !reducedNow ? 1 + 0.035 * Math.sin(now / 1100 + n.id.length) : 1;
        const emph = n.id === sel ? 1.4 : n.id === hov ? 1.25 : 1;
        const R = GLOW[n.layer] * k * sizeOf(it) * bs * breathe * emph;
        const alpha = depthA(it.depth) * dimOf(n) * (hub ? 1 : 0.82); // leaves slightly softer so dense clusters do not blow out to white
        const star = sp.star[n.layer];
        ctx.globalAlpha = alpha;
        ctx.drawImage(star, it.sx - R, it.sy - R, R * 2, R * 2);
        if (hub) { ctx.globalAlpha = alpha * 0.28; ctx.drawImage(star, it.sx - R * 2.3, it.sy - R * 2.3, R * 4.6, R * 4.6); }
        if (flash > 0) {
          ctx.globalAlpha = Math.min(1, flash * 1.4) * 0.9;
          ctx.drawImage(star, it.sx - R * 2, it.sy - R * 2, R * 4, R * 4);
          ctx.globalAlpha = 1;
          ctx.strokeStyle = `rgba(${rgb(COLOR[n.layer])},${(flash * 0.85).toFixed(3)})`;
          ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.arc(it.sx, it.sy, R * 0.6 + (1 - flash) * 52 * k, 0, Math.PI * 2); ctx.stroke();
        }
        if (flt.hasQuery && flt.matched.has(n.id)) {
          ctx.globalAlpha = 0.8 * depthA(it.depth);
          ctx.strokeStyle = "rgba(214,189,145,.9)"; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(it.sx, it.sy, Math.max(6, R * 0.5) + 3, 0, Math.PI * 2); ctx.stroke();
        }
        proj.push({ id: n.id, sx: it.sx, sy: it.sy, r: R, depth: it.depth, hub });
      }

      // selection / hover rings (normal blending)
      ctx.globalCompositeOperation = "source-over";
      for (const [id, strong] of [[hov, false], [sel, true]] as const) {
        if (!id) continue;
        const it = pmap.get(id); if (!it) continue;
        const R = GLOW[it.n.layer] * k * sizeOf(it) * (strong ? 1.4 : 1.25);
        const rr = Math.max(9, R * 0.42) + 5;
        ctx.globalAlpha = strong ? 0.95 : 0.55;
        ctx.strokeStyle = "#e8eee7"; ctx.lineWidth = strong ? 1.5 : 1;
        ctx.beginPath(); ctx.arc(it.sx, it.sy, rr, 0, Math.PI * 2); ctx.stroke();
        if (strong) {
          ctx.globalAlpha = 0.35; ctx.setLineDash([2, 5]);
          ctx.beginPath(); ctx.arc(it.sx, it.sy, rr + 7, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
        }
      }

      // labels: hubs always, leaves only when selected
      type Lab = { it: Item; pri: number };
      const labs: Lab[] = [];
      for (const it of items) {
        if (isHub(it.n)) labs.push({ it, pri: it.n.layer === "common" ? 1 : it.n.layer === "project" ? 2 : 3 });
      }
      labs.sort((a, b) => a.pri - b.pri || a.it.depth - b.it.depth);
      const boxes: [number, number, number, number][] = [];
      const drawnLabels: { id: string; box: [number, number, number, number] }[] = [], hiddenLabels: string[] = [];
      ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.lineJoin = "round";
      const small = w < 520;
      // selected leaf: its pill label is placed first (reserved box, so bot labels yield to it) and drawn last
      const sIt = sel ? pmap.get(sel) : undefined;
      let pill: { px: number; py: number; pw: number; ph: number; text: string } | null = null;
      if (sIt && !isHub(sIt.n)) {
        ctx.font = `600 12px ui-sans-serif,system-ui,-apple-system,"Segoe UI","Malgun Gothic",sans-serif`;
        const text = trunc(sIt.n.label, small ? 18 : 28);
        const tw = ctx.measureText(text).width, ph = 22, pw = tw + 20;
        const R = GLOW[sIt.n.layer] * k * sizeOf(sIt);
        const off = Math.max(9, R * 0.42) + 12;
        const cands: [number, number][] = [];
        for (const d of [off, off + 26, off + 52]) cands.push([sIt.sx - pw / 2, sIt.sy - d - ph], [sIt.sx + d, sIt.sy - ph / 2], [sIt.sx - d - pw, sIt.sy - ph / 2], [sIt.sx - pw / 2, sIt.sy + d]);
        const inside = ([x0, y0]: [number, number]) => [clamp(x0, 6, w - pw - 6), clamp(y0, 6, h - ph - 6)] as [number, number];
        const hubBoxes = items.filter(q => isHub(q.n)).map(q => { const r = Math.max(8, GLOW[q.n.layer] * k * sizeOf(q) * 0.42) + 4; return [q.sx - r, q.sy - r, q.sx + r, q.sy + r + 30] as Box; });
        const area = ([x0, y0]: [number, number]) => overlapArea([x0 - 2, y0 - 2, x0 + pw + 2, y0 + ph + 2], hubBoxes);
        const [px, py] = cands.map(inside).reduce((best, c) => (area(c) < area(best) ? c : best));
        pill = { px, py, pw, ph, text };
        boxes.push([px - 2, py - 2, px + pw + 2, py + ph + 2]);
      }
      for (const { it, pri } of labs) {
        const n = it.n;
        const size = n.layer === "common" ? 13 : n.layer === "project" ? 12.5 : 11.5;
        const weight = n.layer === "bot" && n.id !== sel ? 520 : 640;
        ctx.font = `${weight} ${size}px ui-sans-serif,system-ui,-apple-system,"Segoe UI","Malgun Gothic",sans-serif`;
        const text = trunc(n.label, small ? 13 : n.layer === "bot" ? 16 : 22);
        const tw = ctx.measureText(text).width;
        const R = GLOW[n.layer] * k * sizeOf(it);
        const sub = (n.layer === "common" || n.layer === "project") && isHub(n) ? `조각 ${sc.leafCount.get(n.id) ?? 0}개` : "";
        const bh = size + 4 + (sub ? 14 : 0);
        const off = Math.max(8, R * 0.42) + 6;
        const cx = clamp(it.sx, tw / 2 + 6, w - tw / 2 - 6);
        const boxAt = (xx: number, yy: number): [number, number, number, number] => [xx - tw / 2 - 6, yy - 4, xx + tw / 2 + 6, yy + bh + 2];
        const hits = (bx: [number, number, number, number]) => bx[0] < 2 || bx[2] > w - 2 || bx[1] < 2 || bx[3] > h - 2 || boxes.some(b => bx[0] < b[2] && bx[2] > b[0] && bx[1] < b[3] && bx[3] > b[1]);
        // candidates: below, above, right, left of the star. Bot labels give way; common/project labels always draw.
        const cands: [number, number][] = [[cx, it.sy + off], [cx, it.sy - off - bh], [it.sx + off + tw / 2 + 4, it.sy - bh / 2], [it.sx - off - tw / 2 - 4, it.sy - bh / 2]];
        let pickC = cands.find(([xx, yy]) => !hits(boxAt(xx, yy)));
        if (!pickC) {
          if (pri >= 3) { hiddenLabels.push(n.id); continue; }
          // common/project labels must show: take the in-frame candidate that overlaps existing labels least
          const inFrame = cands.map(([xx, yy]) => [clamp(xx, tw / 2 + 8, w - tw / 2 - 8), clamp(yy, 6, h - bh - 6)] as [number, number]);
          pickC = inFrame.reduce((best, c) => overlapArea(boxAt(...c), boxes) < overlapArea(boxAt(...best), boxes) ? c : best, inFrame[0]);
        }
        const [x, y] = pickC;
        const box = boxAt(x, y);
        boxes.push(box); drawnLabels.push({ id: n.id, box });
        const a = (n.id === sel ? 1 : depthA(it.depth)) * (flt.hasQuery && !flt.matched.has(n.id) && n.id !== sel ? 0.55 : 1);
        ctx.globalAlpha = a;
        ctx.lineWidth = 3.5; ctx.strokeStyle = "rgba(7,10,9,.88)";
        ctx.fillStyle = n.layer === "common" ? "#f3e2bd" : n.layer === "project" ? "#dde8f6" : n.layer === "bot" ? "#cbd9bf" : "#e8eee7";
        ctx.strokeText(text, x, y); ctx.fillText(text, x, y);
        if (sub) {
          ctx.font = `500 10.5px ui-sans-serif,system-ui,"Segoe UI","Malgun Gothic",sans-serif`;
          ctx.fillStyle = "#8f9e92";
          ctx.strokeText(sub, x, y + size + 3); ctx.fillText(sub, x, y + size + 3);
        }
      }
      if (pill && sIt) {
        const { px, py, pw, ph, text } = pill;
        ctx.font = `600 12px ui-sans-serif,system-ui,-apple-system,"Segoe UI","Malgun Gothic",sans-serif`;
        ctx.globalAlpha = 1;
        ctx.fillStyle = "rgba(12,18,17,.9)"; ctx.strokeStyle = `rgba(${rgb(COLOR[sIt.n.layer])},.55)`; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.roundRect ? ctx.roundRect(px, py, pw, ph, 11) : ctx.rect(px, py, pw, ph); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#e8eee7"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
        ctx.fillText(text, px + 10, py + ph / 2 + 0.5);
      }
      ctx.globalAlpha = 1;
      projRef.current = proj;
      labelRef.current = { drawn: drawnLabels, hidden: hiddenLabels };
      return births;
    };

    let dragging = false;
    const visibleNow = () => onScreen && (typeof document === "undefined" || document.visibilityState !== "hidden");
    const tick = (now: number) => {
      raf = 0;
      if (!visibleNow()) { last = 0; return; }
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
      last = now;
      const moving = step(now, dt);
      const births = draw(now);
      if (!reducedRef.current || moving || births) schedule(); else last = 0;
    };
    function schedule() { if (!raf) raf = requestAnimationFrame(tick); }
    requestRef.current = schedule;

    // ----- input -----
    const pointers = new Map<number, { x: number; y: number }>();
    let downAt = { x: 0, y: 0 }, moved = false, pinchD = 0, lastMove = 0;
    let panId: number | null = null, panLast = { x: 0, y: 0 };
    const local = (e: PointerEvent | WheelEvent) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const pick = (x: number, y: number, touch: boolean) => {
      let best: Proj | null = null, bd = Infinity;
      for (const p of projRef.current) {
        const d = Math.hypot(p.sx - x, p.sy - y);
        const lim = Math.max(p.r * 0.45, touch ? 24 : 14);
        if (d > lim) continue;
        // hubs win ties inside their bright core; nearer (smaller depth) stars win small distance differences
        const score = p.hub ? d * 0.55 : d;
        if (score < bd - (best && p.depth < best.depth ? 0 : 1)) { best = p; bd = score; }
      }
      return best?.id ?? null;
    };
    const interact = () => { view.lastInteract = performance.now(); view.easing = false; };
    const hideTip = () => { const t = tipRef.current; if (t) t.dataset.show = "false"; };
    const showTip = (id: string, x: number, y: number) => {
      const t = tipRef.current, n = sceneRef.current.byId.get(id);
      if (!t || !n) return;
      const [a, b] = t.children as unknown as HTMLElement[];
      a.textContent = trunc(n.label, 60);
      b.textContent = `${LAYER_LABEL[n.layer]} · ${sceneRef.current.groupLabel.get(n.group) ?? LAYER_LABEL.common}${n.pending ? " · 번역 대기" : ""}`;
      t.dataset.show = "true";
      const tw = t.offsetWidth, th = t.offsetHeight;
      const left = clamp(x + 14, 8, w - tw - 8), top = y + 18 + th > h - 8 ? y - th - 14 : y + 18;
      t.style.transform = `translate(${Math.round(left)}px,${Math.round(Math.max(8, top))}px)`;
    };
    const onDown = (e: PointerEvent) => {
      if (e.button === 1) {
        // middle (wheel) button held: move the whole view
        e.preventDefault();
        canvas.setPointerCapture?.(e.pointerId);
        panId = e.pointerId; panLast = local(e); dragging = true;
        view.vYaw = view.vPitch = 0; canvas.style.cursor = "grabbing";
        interact(); hideTip(); return;
      }
      if (e.button !== undefined && e.button > 0) return;
      canvas.setPointerCapture?.(e.pointerId);
      const p = local(e);
      pointers.set(e.pointerId, p);
      if (pointers.size === 1) { downAt = p; moved = false; dragging = true; view.vYaw = view.vPitch = 0; }
      if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinchD = Math.hypot(a.x - b.x, a.y - b.y); moved = true; }
      interact(); hideTip();
    };
    const onMove = (e: PointerEvent) => {
      const p = local(e);
      if (panId === e.pointerId) {
        view.panX = view.tPanX = clamp(view.panX + p.x - panLast.x, -w, w);
        view.panY = view.tPanY = clamp(view.panY + p.y - panLast.y, -h, h);
        panLast = p; interact(); schedule(); return;
      }
      if (!pointers.has(e.pointerId)) {
        if (e.pointerType === "mouse") {
          const id = pick(p.x, p.y, false);
          if (id !== hoverRef.current) { hoverRef.current = id; canvas.style.cursor = id ? "pointer" : ""; schedule(); }
          if (id) showTip(id, p.x, p.y); else hideTip();
        }
        return;
      }
      const prev = pointers.get(e.pointerId)!;
      pointers.set(e.pointerId, p);
      if (pointers.size >= 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchD > 0) { view.zoom = view.tZoom = clamp(view.zoom * (d / pinchD), ZOOM_MIN, ZOOM_MAX); }
        pinchD = d; interact(); schedule(); return;
      }
      const dx = p.x - prev.x, dy = p.y - prev.y;
      if (Math.hypot(p.x - downAt.x, p.y - downAt.y) > 5) moved = true;
      if (!moved) return;
      view.yaw += dx * 0.0062; view.pitch = clamp(view.pitch + dy * 0.0052, -1.25, 1.25);
      view.tYaw = view.yaw; view.tPitch = view.pitch;
      const now = performance.now(), dtm = Math.max(8, now - lastMove); lastMove = now;
      view.vYaw = clamp(((dx * 0.0062) / dtm) * 1000 * 0.6, -2.4, 2.4); view.vPitch = clamp(((dy * 0.0052) / dtm) * 1000 * 0.6, -1.2, 1.2); // gentle fling
      interact(); schedule();
    };
    const onUp = (e: PointerEvent) => {
      if (panId === e.pointerId) { panId = null; dragging = false; canvas.style.cursor = ""; interact(); schedule(); return; }
      if (!pointers.has(e.pointerId)) return;
      const wasSingle = pointers.size === 1;
      pointers.delete(e.pointerId);
      if (pointers.size === 1) { pinchD = 0; const [only] = [...pointers.values()]; downAt = only; }
      if (pointers.size === 0) {
        dragging = false;
        if (performance.now() - lastMove > 90) { view.vYaw = view.vPitch = 0; }
        if (wasSingle && !moved && e.type === "pointerup") {
          const p = local(e);
          const id = pick(p.x, p.y, e.pointerType !== "mouse");
          setSelected(id);
          view.vYaw = view.vPitch = 0;
        }
        interact(); schedule();
      }
    };
    // Windows shows an auto-scroll cursor on middle press unless mousedown is cancelled
    const onMouseDown = (e: MouseEvent) => { if (e.button === 1) e.preventDefault(); };
    const onLeave = () => { if (hoverRef.current) { hoverRef.current = null; canvas.style.cursor = ""; schedule(); } hideTip(); };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      view.zoom = view.tZoom = clamp(view.zoom * Math.exp(-dy * 0.0014), ZOOM_MIN, ZOOM_MAX);
      interact(); schedule();
    };
    const onKey = (e: KeyboardEvent) => {
      const s = 0.14;
      if (e.key === "ArrowLeft") view.tYaw = view.yaw - s * 2;
      else if (e.key === "ArrowRight") view.tYaw = view.yaw + s * 2;
      else if (e.key === "ArrowUp") view.tPitch = clamp(view.pitch - s, -1.25, 1.25);
      else if (e.key === "ArrowDown") view.tPitch = clamp(view.pitch + s, -1.25, 1.25);
      else if (e.key === "+" || e.key === "=") view.tZoom = clamp(view.zoom * 1.2, ZOOM_MIN, ZOOM_MAX);
      else if (e.key === "-" || e.key === "_") view.tZoom = clamp(view.zoom / 1.2, ZOOM_MIN, ZOOM_MAX);
      else if (e.key === "Escape") { setSelected(null); return; }
      else return;
      e.preventDefault();
      view.lastInteract = performance.now(); view.easing = true; view.vYaw = view.vPitch = 0; schedule();
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("keydown", onKey);
    // test/QA probe: projected positions of the last frame (read-only copy)
    (canvas as unknown as { __galaxyProbe?: () => Proj[] }).__galaxyProbe = () => projRef.current.map(p => ({ ...p }));
    (canvas as unknown as { __galaxyLabels?: () => unknown }).__galaxyLabels = () => JSON.parse(JSON.stringify(labelRef.current));

    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    ro?.observe(wrap);
    const io = typeof IntersectionObserver !== "undefined" ? new IntersectionObserver(es => { onScreen = es.some(x => x.isIntersecting); if (onScreen) schedule(); }) : null;
    io?.observe(canvas);
    const onVis = () => { if (document.visibilityState !== "hidden") schedule(); };
    document.addEventListener("visibilitychange", onVis);
    resize();
    return () => {
      cancelAnimationFrame(raf); ro?.disconnect(); io?.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      canvas.removeEventListener("pointerdown", onDown); canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("pointerup", onUp); canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("pointerleave", onLeave); canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("keydown", onKey);
      requestRef.current = () => {};
    };
  }, []);

  const resetView = () => {
    const v = viewRef.current;
    const turns = Math.round((v.yaw - DEFAULT_VIEW.yaw) / (Math.PI * 2));
    const r = wrapRef.current?.getBoundingClientRect();
    Object.assign(v, { tYaw: DEFAULT_VIEW.yaw + turns * Math.PI * 2, tPitch: r ? pitchFor(r.width, r.height) : DEFAULT_VIEW.pitch, tZoom: 1, tPanX: 0, tPanY: 0, vYaw: 0, vPitch: 0, easing: true, lastInteract: -1e9 });
    requestRef.current();
  };
  const focusNode = (id: string) => {
    setSelected(id);
    const p = posRef.current.get(id), v = viewRef.current;
    if (!p || Math.hypot(p.x, p.z) < 1) return;
    let target = Math.atan2(p.x, p.z);
    target += Math.round((v.yaw - target) / (Math.PI * 2)) * Math.PI * 2;
    Object.assign(v, { tYaw: target, tPitch: v.pitch, tZoom: v.zoom, easing: true, vYaw: 0, vPitch: 0, lastInteract: performance.now() });
    requestRef.current();
  };
  const toggleLayer = (l: GalaxyLayer) => setLayers(prev => { const next = new Set(prev); if (next.has(l)) next.delete(l); else next.add(l); return next; });

  const counts = useMemo(() => {
    const c = Object.fromEntries(LAYERS.map(l => [l, 0])) as Record<GalaxyLayer, number>;
    for (const n of data.nodes ?? []) c[n.layer] = (c[n.layer] ?? 0) + 1;
    return c;
  }, [data]);
  const summary = `기억 은하: ${LAYERS.filter(l => counts[l]).map(l => `${LAYER_LABEL[l]} ${counts[l]}개`).join(", ") || "표시할 별 없음"}. 아래 '별 목록'에서 키보드로 하나씩 고를 수 있습니다.`;
  const node = selected ? scene.byId.get(selected) ?? (data.nodes ?? []).find(n => n.id === selected) ?? null : null;
  const listNodes = useMemo(() => {
    if (!listOpen) return [];
    const order: Record<GalaxyLayer, number> = { common: 0, project: 1, bot: 2, user: 3, knowledge: 4, memory: 5, skill: 6 };
    return (data.nodes ?? []).filter(n => filter.visible.has(n.id) && (!hasQuery || filter.matched.has(n.id)))
      .sort((a, b) => order[a.layer] - order[b.layer] || a.group.localeCompare(b.group) || a.label.localeCompare(b.label, "ko"));
  }, [listOpen, data, filter, hasQuery]);
  const genTime = fmtTime(data.generatedAt);
  const { hubLeaves, hubMix } = useMemo(() => {
    if (!node || !isHub(node)) return { hubLeaves: [] as GalaxyNode[], hubMix: [] as string[] };
    const kids = scene.nodes.filter(n => scene.hubOf.get(n.id) === node.id);
    const mix = LAYERS.map(l => [l, kids.filter(k => k.layer === l).length] as const).filter(([, c]) => c).map(([l, c]) => `${LAYER_LABEL[l]} ${c}`);
    return { hubLeaves: kids.slice(0, 8), hubMix: mix };
  }, [node, scene]);

  return <section className="g-root" aria-label="기억 은하">
    <div className="g-toolbar">
      <div className="g-chips" role="group" aria-label="보여줄 종류">
        {LAYERS.map(l => <button key={l} type="button" className="g-chip" aria-pressed={layers.has(l)} onClick={() => toggleLayer(l)} style={{ "--g-c": rgb(COLOR[l]) } as CSSProperties}>
          <span className="g-chip-dot" aria-hidden="true" />{LAYER_LABEL[l]}<span className="g-chip-n">{counts[l]}</span>
        </button>)}
      </div>
      <div className="g-row">
        <label className="g-search"><span className="g-sr">별 찾기</span>
          <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14"><circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M10.5 10.5 14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="찾을 말 (예: 배포, 디자인)" />
        </label>
        <div className="g-btns">
          <button type="button" className="g-btn" onClick={resetView}>시점 초기화</button>
          <button type="button" className="g-btn" aria-pressed={!spin} onClick={() => setSpin(s => !s)}>{spin ? "회전 멈춤" : "회전 재생"}</button>
        </div>
      </div>
    </div>

    <div className="g-stage">
      <div className="g-view">
        <div className="g-canvas-wrap" ref={wrapRef}>
          <canvas ref={canvasRef} className="g-canvas" role="img" tabIndex={0} aria-label={summary} />
          <div className="g-live" aria-hidden="true"><span className="g-live-dot" data-still={reduced} />실시간{genTime ? ` · ${genTime}` : ""}{born ? <b> · 새 별 {born}개</b> : null}</div>
          <div className="g-tip" ref={tipRef} data-show="false" aria-hidden="true"><strong /><span /></div>
        </div>
        <ul className="g-legend" aria-label="범례">
          <li><i className="g-lg-hub" aria-hidden="true" />큰 별 = 공통·프로젝트·봇</li>
          <li><i className="g-lg-leaf" aria-hidden="true" />작은 별 = 기억 조각</li>
          <li><i className="g-lg-line" aria-hidden="true" />선 = 어디에 속하는지</li>
          <li className="g-hint">끌어서 돌리기 · 휠 버튼 누른 채 끌어 이동 · 휠로 확대</li>
        </ul>
      </div>
      <aside className="g-inspector" aria-live="polite" aria-label="고른 별 정보">
        {node ? <>
          <div className="g-ins-head">
            <span className="g-ins-layer" style={{ "--g-c": rgb(COLOR[node.layer]) } as CSSProperties}><i aria-hidden="true" />{LAYER_LABEL[node.layer]}</span>
            {node.pending && <span className="g-badge">번역 대기</span>}
          </div>
          <h3 className="g-ins-title">{node.label}</h3>
          <dl className="g-ins-meta">
            {isHub(node) ? <>
              {node.layer !== "common" && <div><dt>{node.layer === "bot" ? "맡은 프로젝트" : "위에 있는 곳"}</dt><dd>{(data.groups.find(g => g.key === node.group)?.parents ?? []).filter(p => p !== "common" || node.layer === "project").map(p => scene.groupLabel.get(p) ?? p).join(", ") || LAYER_LABEL.common}</dd></div>}
              <div><dt>딸린 조각</dt><dd>{scene.leafCount.get(node.id) ?? 0}개{hubMix.length ? ` · ${hubMix.join(", ")}` : ""}</dd></div>
            </> : <div><dt>소속</dt><dd>{scene.groupLabel.get(scene.hubOf.get(node.id)?.slice(4) ?? node.group) ?? LAYER_LABEL.common}</dd></div>}
            {fmtTime(node.updatedAt) && <div><dt>최근 수정</dt><dd>{fmtTime(node.updatedAt)}</dd></div>}
          </dl>
          {(node.text || !isHub(node)) && <p className="g-ins-text">{node.text || node.label}</p>}
          {node.original && node.original !== node.text && <details className="g-orig"><summary>원문(영어) 보기</summary><p lang="en">{node.original}</p></details>}
          {isHub(node) && hubLeaves.length > 0 && <div className="g-ins-leaves"><span className="g-ins-sub">둘레의 기억 조각</span><ul>{hubLeaves.map(n => <li key={n.id}>
            <button type="button" onClick={() => focusNode(n.id)} style={{ "--g-c": rgb(COLOR[n.layer]) } as CSSProperties}><i aria-hidden="true" /><span>{n.label}</span></button>
          </li>)}</ul>{(scene.leafCount.get(node.id) ?? 0) > hubLeaves.length && <p className="g-ins-more">외 {(scene.leafCount.get(node.id) ?? 0) - hubLeaves.length}개 · 아래 '별 목록'에서 볼 수 있어요</p>}</div>}
          <button type="button" className="g-btn g-btn-quiet" onClick={() => setSelected(null)}>선택 해제</button>
        </> : <>
          <span className="g-ins-eyebrow">살펴보기</span>
          <h3 className="g-ins-title">별을 눌러 보세요</h3>
          <p className="g-ins-text g-ins-empty">큰 별은 공통·프로젝트·봇이고, 그 둘레의 작은 별이 하나하나의 기억 조각입니다. 새로 생긴 기억은 반짝이며 나타납니다.</p>
        </>}
      </aside>
    </div>

    {(scene.capped || (hasQuery && filter.matched.size === 0)) && <p className="g-note">
      {scene.capped && `별이 너무 많아 최근 ${MAX_NODES.toLocaleString("ko-KR")}개만 그립니다(전체 ${scene.total.toLocaleString("ko-KR")}개). 아래 목록에는 모두 있습니다. `}
      {hasQuery && filter.matched.size === 0 && "찾는 말과 맞는 별이 없습니다."}
    </p>}
    {hasQuery && filter.matched.size > 0 && <p className="g-note">맞는 별 {filter.matched.size}개를 밝게 표시했습니다.</p>}

    <details className="g-list" onToggle={e => setListOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary>별 목록 ({hasQuery ? filter.matched.size : filter.visible.size}개) · 키보드로 고르기</summary>
      {listOpen && <ul aria-label="별 목록">{listNodes.map(n => <li key={n.id}>
        <button type="button" aria-pressed={selected === n.id} onClick={() => focusNode(n.id)} style={{ "--g-c": rgb(COLOR[n.layer]) } as CSSProperties}>
          <i aria-hidden="true" /><span className="g-li-label">{n.label}</span><span className="g-li-meta">{LAYER_LABEL[n.layer]}{isHub(n) ? "" : ` · ${scene.groupLabel.get(n.group) ?? LAYER_LABEL.common}`}{n.pending ? " · 번역 대기" : ""}</span>
        </button>
      </li>)}</ul>}
    </details>
  </section>;
}

const P = ".agentos-hermes .g-";
export const galaxyStyles = `
${P}root{container-type:inline-size;display:grid;grid-template-columns:minmax(0,1fr);gap:12px;min-width:0;color:var(--h-text,#e8eee7);--g-line:var(--h-line,rgba(216,232,213,.11));--g-line-strong:var(--h-line-strong,rgba(216,232,213,.2))}
${P}root *{box-sizing:border-box}
${P}sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
${P}toolbar{display:grid;grid-template-columns:minmax(0,1fr);gap:10px;min-width:0}
${P}chips{display:flex;flex-wrap:wrap;gap:6px;min-width:0}
${P}chip{display:inline-flex;align-items:center;gap:7px;height:32px;padding:0 11px 0 10px;border:1px solid var(--g-line-strong);border-radius:999px;background:transparent;color:var(--h-muted,#829185);font:inherit;font-size:12px;font-weight:560;cursor:pointer;transition:background 140ms cubic-bezier(.23,1,.32,1),border-color 140ms cubic-bezier(.23,1,.32,1),color 140ms}
${P}chip:hover{border-color:rgba(var(--g-c),.5);color:var(--h-secondary,#b3beb2)}
${P}chip[aria-pressed=true]{color:var(--h-text,#e8eee7);background:rgba(var(--g-c),.1);border-color:rgba(var(--g-c),.4)}
${P}chip-dot{width:8px;height:8px;border-radius:50%;flex:none;background:rgb(var(--g-c));box-shadow:0 0 8px rgba(var(--g-c),.75)}
${P}chip[aria-pressed=false] .g-chip-dot{background:transparent;box-shadow:inset 0 0 0 1.5px rgba(var(--g-c),.55)}
${P}chip-n{font-variant-numeric:tabular-nums;font-size:11px;color:var(--h-muted,#829185);font-weight:500}
${P}row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;min-width:0}
${P}search{position:relative;flex:1 1 260px;min-width:0;display:block}
${P}search svg{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--h-muted,#829185);pointer-events:none}
${P}search input{width:100%;height:40px;padding:0 12px 0 34px;background:var(--h-input,#0e1413);border:1px solid var(--g-line-strong);border-radius:6px;color:var(--h-text,#e8eee7);font:inherit;min-width:0}
${P}search input::placeholder{color:var(--h-muted,#829185)}
${P}btns{display:flex;gap:6px}
${P}btn{min-height:40px;padding:8px 14px;border:1px solid var(--g-line-strong);border-radius:6px;background:var(--h-raised,#1b2522);color:var(--h-text,#e8eee7);font:inherit;font-weight:570;cursor:pointer;white-space:nowrap;transition:background 140ms cubic-bezier(.23,1,.32,1),border-color 140ms cubic-bezier(.23,1,.32,1)}
${P}btn:hover{background:#24312b;border-color:rgba(189,209,170,.34)}
${P}btn:active{transform:scale(.97)}
${P}btn[aria-pressed=true]{border-color:rgba(189,209,170,.5);background:rgba(189,209,170,.14);color:var(--h-accent,#bdd1aa)}
${P}btn-quiet{background:transparent;margin-top:16px;width:100%}
${P}stage{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:12px;align-items:start;min-width:0}
${P}view{display:grid;grid-template-columns:minmax(0,1fr);gap:10px;min-width:0}
${P}canvas-wrap{position:relative;height:560px;min-width:0;border:1px solid var(--g-line);border-radius:10px;overflow:hidden;background:#080c0b;box-shadow:inset 0 0 0 1px rgba(0,0,0,.4),0 18px 40px -24px rgba(0,0,0,.7)}
${P}canvas{position:absolute;inset:0;display:block;width:100%;height:100%;touch-action:none;cursor:grab;outline:none}
${P}canvas:active{cursor:grabbing}
${P}canvas:focus-visible{box-shadow:inset 0 0 0 2px var(--h-accent,#bdd1aa)}
${P}live{position:absolute;left:12px;top:12px;display:inline-flex;align-items:center;gap:7px;height:26px;padding:0 10px;border-radius:999px;background:rgba(10,15,14,.62);border:1px solid var(--g-line);color:var(--h-secondary,#b3beb2);font-size:11px;pointer-events:none;backdrop-filter:blur(6px);max-width:calc(100% - 24px);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
${P}live b{color:var(--h-warn,#d6bd91);font-weight:620}
${P}live-dot{width:6px;height:6px;border-radius:50%;background:var(--h-accent,#bdd1aa);box-shadow:0 0 0 0 rgba(189,209,170,.6);animation:g-pulse 2.4s ease-out infinite;flex:none}
${P}live-dot[data-still=true]{animation:none}
@keyframes g-pulse{0%{box-shadow:0 0 0 0 rgba(189,209,170,.55)}70%{box-shadow:0 0 0 7px rgba(189,209,170,0)}100%{box-shadow:0 0 0 0 rgba(189,209,170,0)}}
${P}tip{position:absolute;left:0;top:0;display:grid;gap:2px;max-width:260px;padding:8px 10px;border-radius:7px;background:rgba(14,20,19,.92);border:1px solid var(--g-line-strong);box-shadow:0 8px 24px -8px rgba(0,0,0,.7);font-size:12px;line-height:1.45;pointer-events:none;opacity:0;transition:opacity 120ms;backdrop-filter:blur(6px)}
${P}tip[data-show=true]{opacity:1}
${P}tip strong{font-weight:620;color:var(--h-text,#e8eee7)}
${P}tip span{color:var(--h-muted,#829185);font-size:11px}
${P}legend{display:flex;flex-wrap:wrap;gap:4px 16px;margin:0;padding:0 2px;list-style:none;font-size:11px;color:var(--h-muted,#829185)}
${P}legend li{display:inline-flex;align-items:center;gap:6px}
${P}legend i{display:inline-block;flex:none}
${P}lg-hub{width:10px;height:10px;border-radius:50%;background:radial-gradient(circle,#fffdf6 0 20%,#e6c688 45%,rgba(230,198,136,0) 72%)}
${P}lg-leaf{width:6px;height:6px;border-radius:50%;background:#eef3ea;box-shadow:0 0 5px rgba(238,243,234,.7)}
${P}lg-line{width:16px;height:1px;background:linear-gradient(90deg,rgba(230,198,136,.7),rgba(189,209,170,.7))}
${P}hint{margin-left:auto}
${P}inspector{position:relative;min-width:0;min-height:560px;max-height:560px;overflow:auto;padding:18px;border:1px solid var(--g-line);border-radius:10px;background:linear-gradient(180deg,var(--h-raised,#1b2522),var(--h-panel,#161e1c));overscroll-behavior:contain}
${P}ins-eyebrow{color:var(--h-accent,#bdd1aa);font-size:10px;font-weight:700;letter-spacing:.15em}
${P}ins-head{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
${P}ins-layer{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:650;letter-spacing:.04em;color:rgb(var(--g-c))}
${P}ins-layer i{width:8px;height:8px;border-radius:50%;background:rgb(var(--g-c));box-shadow:0 0 8px rgba(var(--g-c),.8)}
${P}badge{display:inline-flex;align-items:center;height:20px;padding:0 8px;border-radius:999px;font-size:10px;font-weight:700;letter-spacing:.04em;color:var(--h-warn,#d6bd91);background:rgba(214,189,145,.12);border:1px solid rgba(214,189,145,.28)}
${P}ins-title{margin:10px 0 12px;font-size:17px;line-height:1.35;font-weight:640;letter-spacing:-.02em;color:var(--h-text,#e8eee7);overflow-wrap:anywhere}
${P}ins-meta{display:grid;gap:6px;margin:0 0 14px;padding:0 0 14px;border-bottom:1px solid var(--g-line)}
${P}ins-meta div{display:grid;grid-template-columns:92px minmax(0,1fr);gap:8px;font-size:12px}
${P}ins-meta dt{color:var(--h-muted,#829185)}
${P}ins-meta dd{margin:0;color:var(--h-secondary,#b3beb2);overflow-wrap:anywhere}
${P}ins-text{margin:0;white-space:pre-wrap;line-height:1.7;color:var(--h-text,#e8eee7);font-size:13px;overflow-wrap:anywhere}
${P}ins-empty{color:var(--h-secondary,#b3beb2)}
${P}ins-sub{display:block;margin:16px 0 6px;color:var(--h-muted,#829185);font-size:11px;font-weight:600;letter-spacing:.04em}
${P}ins-leaves ul{margin:0;padding:0;list-style:none;display:grid;grid-template-columns:minmax(0,1fr);gap:2px}
${P}ins-leaves button{display:flex;align-items:center;gap:8px;min-height:36px;padding:6px 8px;margin:0 -8px;width:calc(100% + 16px);border:0;border-radius:5px;background:none;color:var(--h-secondary,#b3beb2);font:inherit;font-size:12.5px;text-align:left;cursor:pointer}
${P}ins-leaves button:hover{background:rgba(189,209,170,.08);color:var(--h-text,#e8eee7)}
${P}ins-leaves button i{width:6px;height:6px;border-radius:50%;flex:none;background:rgb(var(--g-c));box-shadow:0 0 6px rgba(var(--g-c),.7)}
${P}ins-leaves button span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
${P}ins-more{margin:6px 0 0;color:var(--h-muted,#829185);font-size:11px}
${P}orig{margin-top:14px;border-top:1px solid var(--g-line)}
${P}orig summary{min-height:44px;display:flex;align-items:center;padding:0;cursor:pointer;color:var(--h-secondary,#b3beb2);font-size:12px}
${P}orig p{margin:0 0 4px;padding:12px;border-radius:6px;background:rgba(0,0,0,.2);white-space:pre-wrap;line-height:1.65;color:var(--h-secondary,#b3beb2);font-size:12.5px;overflow-wrap:anywhere}
${P}note{margin:0;color:var(--h-muted,#829185);font-size:11px;line-height:1.55}
${P}list{border-top:1px solid var(--g-line)}
${P}list summary{min-height:44px;display:flex;align-items:center;padding:0;cursor:pointer;color:var(--h-secondary,#b3beb2)}
${P}list ul{margin:0;padding:0 0 12px;list-style:none;display:grid;grid-template-columns:minmax(0,1fr);gap:2px;max-height:320px;overflow:auto}
${P}list button{display:flex;align-items:center;gap:8px;width:100%;min-height:40px;padding:6px 10px;border:0;border-radius:5px;background:none;color:var(--h-secondary,#b3beb2);font:inherit;text-align:left;cursor:pointer}
${P}list button i{width:7px;height:7px;border-radius:50%;flex:none;background:rgb(var(--g-c))}
${P}list button:hover,${P}list button[aria-pressed=true]{background:rgba(189,209,170,.1);color:var(--h-accent,#bdd1aa)}
${P}li-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
${P}li-meta{flex:none;max-width:45%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;color:var(--h-muted,#829185)}
@container (max-width:860px){${P}stage{grid-template-columns:minmax(0,1fr)}${P}inspector{min-height:0;max-height:none}${P}hint{margin-left:0}}
@media (max-width:767px){${P}canvas-wrap{height:420px}${P}chips{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;padding:0 0 2px;-webkit-mask-image:linear-gradient(90deg,#000 85%,transparent);mask-image:linear-gradient(90deg,#000 85%,transparent)}${P}chips::-webkit-scrollbar{display:none}${P}chip{flex:none;min-height:44px}${P}btn,${P}search input{min-height:44px}${P}btns{flex:1 1 100%}${P}btns ${P}btn{flex:1}${P}list button,${P}ins-leaves button{min-height:44px}${P}hint{display:none}}
@media (pointer:coarse){${P}chip,${P}btn,${P}search input,${P}list button,${P}ins-leaves button{min-height:44px}}
@media (prefers-reduced-motion:reduce){${P}live-dot{animation:none}${P}btn,${P}chip,${P}tip{transition:none}${P}btn:active{transform:none}}
`;
