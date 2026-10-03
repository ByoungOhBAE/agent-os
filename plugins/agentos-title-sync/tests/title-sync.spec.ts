import { describe, expect, it } from "vitest";
import { createTitleSync } from "../src/title-sync.js";
import manifest from "../src/manifest.js";

type Row = { id: string; title: string; parentId: string | null; createdAt: string; companyId: string };

function fakeCtx(rows: Row[]) {
  const db = new Map(rows.map((r) => [r.id, { ...r }]));
  const updates: Array<[string, string]> = [];
  const descendants = (id: string): Row[] => {
    const out: Row[] = [];
    for (const r of db.values()) if (r.parentId === id) out.push(r, ...descendants(r.id));
    return out;
  };
  const ctx = {
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    issues: {
      async get(id: string) { return db.get(id) ?? null; },
      async getSubtree(id: string, companyId: string) {
        const root = db.get(id)!;
        const issues = [root, ...descendants(id)];
        return { rootIssueId: id, companyId, issueIds: issues.map((i) => i.id), issues };
      },
      async update(id: string, patch: Record<string, unknown>) {
        if (Object.keys(patch).join(",") !== "title") throw new Error(`only titles may be written, got ${Object.keys(patch)}`);
        db.get(id)!.title = String(patch.title); updates.push([id, String(patch.title)]); return db.get(id);
      },
    },
  };
  return { ctx: ctx as never, db, updates };
}

const C = "co";
const tree = (): Row[] => [
  { id: "p", title: "홍보 › 가을 클래스 글-1", parentId: null, createdAt: "1", companyId: C },
  { id: "c", title: "홍보 › 가을 클래스 글-1 › 인스타-1", parentId: "p", createdAt: "2", companyId: C },
  { id: "g", title: "홍보 › 가을 클래스 글-1 › 인스타-1 › 해시태그-1", parentId: "c", createdAt: "3", companyId: C },
  { id: "f", title: "요청: 자유 형식", parentId: null, createdAt: "4", companyId: C },
  { id: "fc", title: "자유 하위", parentId: "f", createdAt: "5", companyId: C },
];

describe("상위 제목 연쇄 갱신 (worker)", () => {
  it("a renamed parent rewrites the path of children and grandchildren", async () => {
    const { ctx, db, updates } = fakeCtx(tree());
    const sync = createTitleSync(ctx);
    db.get("p")!.title = "홍보 › 봄 클래스 글-1";
    await sync.onEvent({ eventId: "e", eventType: "issue.updated", occurredAt: "", companyId: C, entityType: "issue", entityId: "p", payload: {} });
    expect(db.get("c")!.title).toBe("홍보 › 봄 클래스 글-1 › 인스타-1");
    expect(db.get("g")!.title).toBe("홍보 › 봄 클래스 글-1 › 인스타-1 › 해시태그-1");
    expect(updates).toHaveLength(2);
  });

  it("is idempotent: its own update events change nothing more", async () => {
    const { ctx, updates } = fakeCtx(tree());
    const sync = createTitleSync(ctx);
    for (const id of ["p", "c", "g"]) await sync.onEvent({ eventId: id, eventType: "issue.updated", occurredAt: "", companyId: C, entityType: "issue", entityId: id, payload: {} });
    expect(updates).toEqual([]);
  });

  it("a child renamed with a wrong path is put back under its parent, keeping its own name", async () => {
    const { ctx, db } = fakeCtx(tree());
    const sync = createTitleSync(ctx);
    db.get("c")!.title = "엉뚱 › 경로 › 릴스-1";
    await sync.onEvent({ eventId: "e", eventType: "issue.updated", occurredAt: "", companyId: C, entityType: "issue", entityId: "c", payload: {} });
    expect(db.get("c")!.title).toBe("홍보 › 가을 클래스 글-1 › 릴스-1");
    expect(db.get("g")!.title).toBe("홍보 › 가을 클래스 글-1 › 릴스-1 › 해시태그-1");
  });

  it("free-form parents and non-issue events are ignored, errors are swallowed", async () => {
    const { ctx, updates } = fakeCtx(tree());
    const sync = createTitleSync(ctx);
    await sync.onEvent({ eventId: "e", eventType: "issue.updated", occurredAt: "", companyId: C, entityType: "issue", entityId: "fc", payload: {} });
    await sync.onEvent({ eventId: "e", eventType: "agent.updated", occurredAt: "", companyId: C, entityType: "agent", entityId: "p", payload: {} });
    await sync.onEvent({ eventId: "e", eventType: "issue.updated", occurredAt: "", companyId: C, entityType: "issue", entityId: "missing", payload: {} });
    expect(updates).toEqual([]);
  });
});

describe("권한 경계", () => {
  it("asks only for what the cascade needs: events, issue reads and issue updates; no UI, no agents, no comments", () => {
    expect([...manifest.capabilities].sort()).toEqual(["events.subscribe", "issue.subtree.read", "issues.read", "issues.update"]);
    expect(manifest.entrypoints).toEqual({ worker: "./dist/worker.js" });
  });
});
