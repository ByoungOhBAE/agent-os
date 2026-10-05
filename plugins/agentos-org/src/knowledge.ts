// Bot memory / skill view model for the org chart (pure; shared by the UI and tests).
export type KnAction = "move" | "keep" | "drop";
export type KnDecision = { action: KnAction; scope: string | null; group: string | null; reason: string | null };
export type KnItem = { key: string; hash: string; text: string; chars: number; ko: string | null; decision: KnDecision | null };
export type KnSkills = {
  autoLoad: string[]; local: number; external: number; total: number; visible: number; disabled: string[];
  preset: string | null; presetLabel: string | null; locked: string[]; presetDisable: string[]; toDisable: string[]; toEnable: string[]; applied: boolean;
};
export type KnBot = {
  profile: string; name: string; agentId: string | null; room: string | null; projects: string[]; missing?: boolean;
  memory: { chars: number; limit: number; planned: number; afterDecisions: number };
  user: { chars: number; limit: number };
  knowledgeSkills: string[]; drift: string[]; carried: KnItem[]; skills: KnSkills;
};
export type KnJob = { id: string; kind: "apply" | "skills"; profile: string | null; state: "running" | "done" | "failed"; startedAt: string; finishedAt: string | null; result: any; error: string | null };
export type Knowledge = {
  generatedAt: string; scopes: { scope: string; label: string }[]; presets: { key: string; label: string }[];
  bots: KnBot[]; outsiders: { profile: string; name: string; memoryChars: number }[];
  decisions: { total: number; pendingDrops: number; errors: string[] }; overlay: { entries: number; retired: number };
  job: KnJob | null; members: Record<string, string>; canEdit: boolean; viewer?: string;
};

export const WARN = 0.7, BAD = 0.85;
export const pct = (chars: number, limit: number) => (limit > 0 ? Math.round((chars / limit) * 100) : 0);
export function level(chars: number, limit: number): "ok" | "warn" | "bad" {
  const r = limit > 0 ? chars / limit : 0;
  return r >= BAD ? "bad" : r >= WARN ? "warn" : "ok";
}

export function botOfMember(kn: Knowledge | null, memberId: string): KnBot | null {
  if (!kn) return null;
  const profile = kn.members[memberId];
  return profile ? kn.bots.find((b) => b.profile === profile && !b.missing) ?? null : null;
}

export function scopeLabel(kn: Knowledge, scope: string | null, profile: string): string {
  if (!scope) return "옮길 곳 미정";
  if (scope === `bot:${profile}`) return "이 봇 전용 지식";
  return kn.scopes.find((s) => s.scope === scope)?.label ?? scope;
}

export const ACTION_LABEL: Record<KnAction, string> = { move: "옮김", keep: "남김", drop: "지움" };

/** Counts across all bots: decided by action, undecided, and how many bots sit at/over the warn line now vs after. */
export function summary(kn: Knowledge) {
  const out = { move: 0, keep: 0, drop: 0, undecided: 0, carried: 0, badNow: 0, warnNow: 0, overWarnAfter: 0, bots: 0 };
  for (const b of kn.bots) {
    if (b.missing) continue;
    out.bots++;
    for (const i of b.carried) {
      out.carried++;
      if (i.decision) out[i.decision.action]++;
      else out.undecided++;
    }
    const l = level(b.memory.chars, b.memory.limit);
    if (l === "bad") out.badNow++;
    if (l !== "ok") out.warnNow++;
    if (b.memory.afterDecisions / b.memory.limit >= WARN) out.overWarnAfter++;
  }
  return out;
}

/** Items of other bots that are the lead of a group this item belongs to (for "묶음" display). */
export function groupLead(kn: Knowledge, item: KnItem): { bot: KnBot; item: KnItem } | null {
  if (!item.decision?.group) return null;
  for (const b of kn.bots) for (const i of b.carried) if (i.key === item.decision.group) return { bot: b, item: i };
  return null;
}

/** Bots ordered for the cleanup list: worst memory first, then most undecided items. */
export function ordered(kn: Knowledge): KnBot[] {
  return kn.bots.filter((b) => !b.missing).slice().sort((a, b) =>
    b.memory.chars / b.memory.limit - a.memory.chars / a.memory.limit || b.carried.length - a.carried.length || a.name.localeCompare(b.name));
}
