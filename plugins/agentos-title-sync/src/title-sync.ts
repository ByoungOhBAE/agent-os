// 상위 작업 제목이 바뀌면 하위 작업 제목의 경로도 같이 고친다 (사장님 결정 2026-10-04).
// On issue.created / issue.updated: take the issue's parent (or the issue itself when it is a root), read that
// subtree and apply cascadeSubtree(): each descendant = parent full title + " › " + its own name-N.
// Stateless and idempotent, so the plugin's own title updates (which emit issue.updated again) settle at once.
// Free-form (non-rule) parents are left alone. Work is serialized per company to avoid racing writes.
import type { PluginContext, PluginEvent } from "@paperclipai/plugin-sdk";
import { cascadeSubtree, isRuleTitle } from "../../agentos-control/src/task-title.js";

type Ctx = Pick<PluginContext, "issues" | "logger">;

export function createTitleSync(ctx: Ctx) {
  const queues = new Map<string, Promise<unknown>>();

  async function sync(issueId: string, companyId: string): Promise<number> {
    const issue = await ctx.issues.get(issueId, companyId);
    if (!issue) return 0;
    const anchor = issue.parentId ? await ctx.issues.get(issue.parentId, companyId) : issue;
    if (!anchor || !isRuleTitle(anchor.title)) return 0;
    const tree = await ctx.issues.getSubtree(anchor.id, companyId, { includeRoot: true });
    const changes = cascadeSubtree(anchor, tree.issues);
    for (const c of changes) {
      await ctx.issues.update(c.id, { title: c.to }, companyId);
    }
    if (changes.length) ctx.logger.info("task titles cascaded", { anchor: anchor.id, changed: changes.length });
    return changes.length;
  }

  /** Queue one sync per event; errors are logged, never thrown into the host event bus. */
  function onEvent(event: PluginEvent): Promise<void> {
    const id = event.entityType === undefined || event.entityType === "issue" ? event.entityId : undefined;
    if (!id || !event.companyId) return Promise.resolve();
    const prev = queues.get(event.companyId) ?? Promise.resolve();
    const next = prev.then(() => sync(id, event.companyId)).catch((error) => {
      ctx.logger.warn("task title cascade failed", { issueId: id, error: error instanceof Error ? error.message : String(error) });
    });
    queues.set(event.companyId, next);
    return next.then(() => undefined);
  }

  return { sync, onEvent };
}
