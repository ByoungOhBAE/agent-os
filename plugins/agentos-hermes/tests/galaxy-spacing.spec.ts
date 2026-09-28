import { describe, expect, it } from "vitest";
import { layoutGalaxy, type GalaxyData, type GalaxyGroup, type GalaxyNode, type Vec3 } from "../src/galaxy.js";

// Real shape of the AgentOS galaxy: 3 projects, 5 Paperclip bots on agent-os (2 shared), 2 on academy, 4 room bots on rimbus.
function realistic(): GalaxyData {
  const g = (key: string, kind: GalaxyGroup["kind"], parents: string[]): GalaxyGroup => ({ key, label: key, kind, parents });
  const groups: GalaxyGroup[] = [
    g("common", "common", []),
    g("project:agent-os", "project", ["common"]), g("project:academy", "project", ["common"]), g("project:rimbus", "project", ["common"]),
    ...["design", "code", "skill", "test"].map(b => g(`bot:${b}`, "bot", ["project:agent-os"])),
    ...["blog", "sns"].map(b => g(`bot:${b}`, "bot", ["project:academy"])),
    g("bot:youtube", "bot", ["project:agent-os", "project:academy"]),
    g("bot:chief", "bot", ["project:agent-os", "project:academy", "project:rimbus"]),
    ...["dev", "review", "plan", "designer"].map(b => g(`bot:${b}`, "bot", ["project:rimbus"])),
  ];
  const nodes: GalaxyNode[] = groups.map(x => ({ id: `hub:${x.key}`, label: x.key, layer: x.kind, group: x.key }));
  for (const x of groups) {
    const n = x.kind === "common" ? 18 : x.kind === "project" ? 8 : 3;
    for (let i = 0; i < n; i++) nodes.push({ id: `${x.key}:${i}`, label: "leaf", layer: x.kind === "bot" ? "memory" : "knowledge", group: x.key });
  }
  return { generatedAt: "", groups, nodes, edges: [] };
}
const dist = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

describe("galaxy spacing", () => {
  it("keeps every pair of hubs (bots included) far apart relative to the size of the whole galaxy", () => {
    const data = realistic();
    const pos = layoutGalaxy(data);
    const hubs = data.nodes.filter(n => n.id.startsWith("hub:")).map(n => pos.get(n.id)!);
    const extent = Math.max(...[...pos.values()].map(p => Math.hypot(p.x, p.y, p.z)));
    let min = Infinity;
    for (let i = 0; i < hubs.length; i++) for (let j = i + 1; j < hubs.length; j++) min = Math.min(min, dist(hubs[i], hubs[j]));
    // labels are fixed-size pixels and the camera fits the whole extent into the frame,
    // so what separates labels on screen is this ratio, not absolute distances
    console.log(`hub spacing ratio ${(min / extent).toFixed(3)} (was 0.244)`);
    expect(min / extent).toBeGreaterThanOrEqual(0.28);
  });

  it("keeps each bot's own memory cloud clear of its sibling bots", () => {
    const data = realistic();
    const pos = layoutGalaxy(data);
    const bots = data.groups.filter(x => x.kind === "bot");
    for (const b of bots) {
      const own = pos.get(`hub:${b.key}`)!;
      for (let i = 0; i < 3; i++) {
        const leaf = pos.get(`${b.key}:${i}`)!;
        const toOwn = dist(leaf, own);
        for (const o of bots) if (o.key !== b.key) expect(dist(leaf, pos.get(`hub:${o.key}`)!), `${b.key} leaf vs ${o.key}`).toBeGreaterThan(toOwn * 1.6);
      }
    }
  });
});
