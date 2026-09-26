import { describe, expect, it } from "vitest";
import {
  applyOps, authorize, emptyOrg, OrgError, syncPlan, viewOf,
  type Actor, type Org, type OrgOp, type Member,
} from "../src/org.js";

const CHIEF = "11111111-1111-4111-8111-111111111111";
const AGENT_A = "22222222-2222-4222-8222-222222222222";
const AGENT_B = "33333333-3333-4333-8333-333333333333";
const CEO: Actor = { kind: "ceo", label: "CEO" };
const chief: Actor = { kind: "agent", agentId: CHIEF, label: "비서실장" };
const other: Actor = { kind: "agent", agentId: AGENT_A, label: "A" };

const members: Member[] = [
  { id: `paperclip:${CHIEF}`, kind: "paperclip", ref: CHIEF, name: "비서실장", runtime: "Claude", model: "Opus 5.5", status: "idle" },
  { id: `paperclip:${AGENT_A}`, kind: "paperclip", ref: AGENT_A, name: "콘텐츠봇", runtime: "Claude", model: null, status: "idle" },
  { id: `paperclip:${AGENT_B}`, kind: "paperclip", ref: AGENT_B, name: "개발봇", runtime: "Codex", model: null, status: "paused" },
  { id: "hermes:ub514-uc790-uc774-ub108", kind: "hermes", ref: "ub514-uc790-uc774-ub108", name: "디자이너", runtime: "Hermes 봇", model: null, status: "idle" },
];
const known = new Set(members.map((m) => m.id));
let n = 0;
const ids = () => `dep-${++n}`;

function run(org: Org, actor: Actor, ops: OrgOp[], expectedVersion?: number) {
  return applyOps(org, actor, ops, { known, newId: ids, now: () => "2026-09-26T12:00:00.000Z", expectedVersion });
}

function withChief() {
  return run(emptyOrg(), CEO, [{ op: "setChief", agentId: CHIEF }]).org;
}

describe("권한", () => {
  it("CEO는 비서실장을 지정할 수 있고, 비서실장은 부서를 편집할 수 있다", () => {
    const org = withChief();
    expect(org.chiefAgentId).toBe(CHIEF);
    const next = run(org, chief, [{ op: "createDepartment", name: "콘텐츠", icon: "document" }]).org;
    expect(next.departments.map((d) => d.name)).toEqual(["콘텐츠"]);
  });

  it("비서실장은 비서실장 자리를 바꿀 수 없다", () => {
    const org = withChief();
    expect(() => run(org, chief, [{ op: "setChief", agentId: AGENT_A }])).toThrowError(/CEO만/);
  });

  it("그 밖의 에이전트는 어떤 변경도 할 수 없다 (403)", () => {
    const org = withChief();
    try {
      run(org, other, [{ op: "createDepartment", name: "몰래" }]);
      throw new Error("should fail");
    } catch (e) {
      expect(e).toBeInstanceOf(OrgError);
      expect((e as OrgError).status).toBe(403);
    }
    expect(authorize(org, other).canEdit).toBe(false);
    expect(authorize(org, chief)).toEqual({ canEdit: true, canAppointChief: false });
    expect(authorize(org, CEO)).toEqual({ canEdit: true, canAppointChief: true });
  });

  it("비서실장이 지정되지 않았으면 에이전트는 편집할 수 없다", () => {
    expect(() => run(emptyOrg(), chief, [{ op: "createDepartment", name: "콘텐츠" }])).toThrowError(OrgError);
  });
});

describe("부서", () => {
  it("이름은 앞뒤 공백을 지우고 1~40자, 같은 이름은 거부", () => {
    const org = withChief();
    expect(() => run(org, CEO, [{ op: "createDepartment", name: "   " }])).toThrowError(/부서 이름/);
    expect(() => run(org, CEO, [{ op: "createDepartment", name: "가".repeat(41) }])).toThrowError(/40자/);
    const one = run(org, CEO, [{ op: "createDepartment", name: " 콘텐츠 " }]).org;
    expect(one.departments[0].name).toBe("콘텐츠");
    expect(() => run(one, CEO, [{ op: "createDepartment", name: "콘텐츠" }])).toThrowError(/이미 있는/);
  });

  it("알 수 없는 아이콘은 기본 아이콘으로 바꾼다", () => {
    const org = run(withChief(), CEO, [{ op: "createDepartment", name: "SNS", icon: "<script>" as never }]).org;
    expect(org.departments[0].icon).toBe("team");
  });

  it("이름·아이콘·보고선 변경, 삭제하면 구성원은 미배치로 돌아간다", () => {
    let org = run(withChief(), CEO, [{ op: "createDepartment", name: "디자인", reportsTo: "chief" }]).org;
    const dep = org.departments[0].id;
    org = run(org, CEO, [
      { op: "assign", member: `paperclip:${AGENT_A}`, departmentId: dep, lead: true },
      { op: "updateDepartment", id: dep, name: "디자인팀", icon: "brush", reportsTo: "ceo" },
    ]).org;
    expect(org.departments[0]).toMatchObject({ name: "디자인팀", icon: "brush", reportsTo: "ceo" });
    org = run(org, CEO, [{ op: "deleteDepartment", id: dep }]).org;
    expect(org.departments).toHaveLength(0);
    expect(org.placements[`paperclip:${AGENT_A}`]).toBeUndefined();
  });

  it("없는 부서를 고치면 404", () => {
    expect(() => run(withChief(), CEO, [{ op: "updateDepartment", id: "nope", name: "x" }])).toThrowError(/부서를 찾을 수/);
  });

  it("부서 순서를 바꿀 수 있다", () => {
    let org = run(withChief(), CEO, [
      { op: "createDepartment", name: "가" }, { op: "createDepartment", name: "나" }, { op: "createDepartment", name: "다" },
    ]).org;
    const [a, b, c] = org.departments.map((d) => d.id);
    org = run(org, CEO, [{ op: "moveDepartment", id: c, index: 0 }]).org;
    expect(org.departments.map((d) => d.id)).toEqual([c, a, b]);
  });
});

describe("구성원", () => {
  it("배치·직함·담당·부서장 지정, 부서장은 부서당 한 명", () => {
    let org = run(withChief(), CEO, [{ op: "createDepartment", name: "콘텐츠" }]).org;
    const dep = org.departments[0].id;
    org = run(org, chief, [
      { op: "assign", member: `paperclip:${AGENT_A}`, departmentId: dep, title: "콘텐츠 리드", duty: "블로그 원고", lead: true },
      { op: "assign", member: "hermes:ub514-uc790-uc774-ub108", departmentId: dep, lead: true },
    ]).org;
    expect(org.placements[`paperclip:${AGENT_A}`]).toMatchObject({ departmentId: dep, title: "콘텐츠 리드", duty: "블로그 원고", lead: false });
    expect(org.placements["hermes:ub514-uc790-uc774-ub108"].lead).toBe(true);
  });

  it("다른 부서로 옮기면 부서장 표시는 풀린다, 미배치(null)로 빼면 배치가 사라진다", () => {
    let org = run(withChief(), CEO, [{ op: "createDepartment", name: "가" }, { op: "createDepartment", name: "나" }]).org;
    const [a, b] = org.departments.map((d) => d.id);
    org = run(org, CEO, [{ op: "assign", member: `paperclip:${AGENT_A}`, departmentId: a, lead: true }]).org;
    org = run(org, CEO, [{ op: "assign", member: `paperclip:${AGENT_A}`, departmentId: b }]).org;
    expect(org.placements[`paperclip:${AGENT_A}`]).toMatchObject({ departmentId: b, lead: false });
    org = run(org, CEO, [{ op: "assign", member: `paperclip:${AGENT_A}`, departmentId: null }]).org;
    expect(org.placements[`paperclip:${AGENT_A}`]).toBeUndefined();
  });

  it("같은 부서 안에서 직함만 바꾸면 기존 값은 유지된다", () => {
    let org = run(withChief(), CEO, [{ op: "createDepartment", name: "가" }]).org;
    const a = org.departments[0].id;
    org = run(org, CEO, [{ op: "assign", member: `paperclip:${AGENT_A}`, departmentId: a, lead: true, duty: "원고" }]).org;
    org = run(org, CEO, [{ op: "updateMember", member: `paperclip:${AGENT_A}`, title: "편집장" }]).org;
    expect(org.placements[`paperclip:${AGENT_A}`]).toMatchObject({ departmentId: a, lead: true, duty: "원고", title: "편집장" });
    org = run(org, CEO, [{ op: "updateMember", member: `paperclip:${AGENT_A}`, title: "" }]).org;
    expect(org.placements[`paperclip:${AGENT_A}`].title).toBeNull();
  });

  it("모르는 구성원·없는 부서·비서실장 배치는 거부", () => {
    let org = run(withChief(), CEO, [{ op: "createDepartment", name: "가" }]).org;
    const a = org.departments[0].id;
    expect(() => run(org, CEO, [{ op: "assign", member: "paperclip:99999999-9999-4999-8999-999999999999", departmentId: a }])).toThrowError(/구성원을 찾을 수/);
    expect(() => run(org, CEO, [{ op: "assign", member: `paperclip:${AGENT_A}`, departmentId: "zzz" }])).toThrowError(/부서를 찾을 수/);
    expect(() => run(org, CEO, [{ op: "assign", member: `paperclip:${CHIEF}`, departmentId: a }])).toThrowError(/비서실장은/);
    expect(() => run(org, CEO, [{ op: "updateMember", member: `paperclip:${AGENT_B}`, title: "x" }])).toThrowError(/배치되지 않은/);
    expect(() => run(org, CEO, [{ op: "assign", member: `paperclip:${AGENT_A}`, departmentId: a, title: "가".repeat(41) }])).toThrowError(/직함/);
  });

  it("배치된 구성원을 비서실장으로 지정하면 배치에서 빠진다", () => {
    let org = run(withChief(), CEO, [{ op: "createDepartment", name: "가" }]).org;
    org = run(org, CEO, [{ op: "assign", member: `paperclip:${AGENT_A}`, departmentId: org.departments[0].id }]).org;
    org = run(org, CEO, [{ op: "setChief", agentId: AGENT_A }]).org;
    expect(org.chiefAgentId).toBe(AGENT_A);
    expect(org.placements[`paperclip:${AGENT_A}`]).toBeUndefined();
  });

  it("비서실장은 Paperclip 에이전트여야 한다", () => {
    expect(() => run(emptyOrg(), CEO, [{ op: "setChief", agentId: "not-a-uuid" }])).toThrowError(/비서실장/);
    expect(() => run(emptyOrg(), CEO, [{ op: "setChief", agentId: "99999999-9999-4999-8999-999999999999" }])).toThrowError(/구성원을 찾을 수/);
  });
});

describe("일괄 적용과 버전", () => {
  it("여러 작업은 전부 적용되거나 전부 취소된다", () => {
    const org = withChief();
    expect(() => run(org, CEO, [{ op: "createDepartment", name: "가" }, { op: "createDepartment", name: "" }])).toThrowError();
    expect(org.departments).toHaveLength(0);
  });

  it("버전이 다르면 409, 성공하면 버전·수정자가 올라간다", () => {
    const org = withChief();
    expect(() => run(org, CEO, [{ op: "createDepartment", name: "가" }], org.version - 1)).toThrowError(/먼저 조직도를/);
    const next = run(org, chief, [{ op: "createDepartment", name: "가" }], org.version).org;
    expect(next.version).toBe(org.version + 1);
    expect(next.updatedBy).toBe("비서실장");
    expect(next.updatedAt).toBe("2026-09-26T12:00:00.000Z");
  });

  it("알 수 없는 작업·너무 많은 작업은 거부", () => {
    expect(() => run(withChief(), CEO, [{ op: "dropTables" } as never])).toThrowError(/알 수 없는 작업/);
    expect(() => run(withChief(), CEO, Array.from({ length: 51 }, (_, i) => ({ op: "createDepartment", name: `d${i}` }) as OrgOp))).toThrowError(/50개/);
    expect(() => run(withChief(), CEO, [])).toThrowError(/작업이 없습니다/);
  });

  it("부서는 30개까지", () => {
    const ops = Array.from({ length: 30 }, (_, i) => ({ op: "createDepartment", name: `d${i}` }) as OrgOp);
    const org = run(withChief(), CEO, ops).org;
    expect(() => run(org, CEO, [{ op: "createDepartment", name: "초과" }])).toThrowError(/30개/);
  });
});

describe("Paperclip 동기화 계획", () => {
  const current = [
    { id: CHIEF, reportsTo: null, title: null, capabilities: null },
    { id: AGENT_A, reportsTo: null, title: null, capabilities: null },
    { id: AGENT_B, reportsTo: AGENT_A, title: "옛 직함", capabilities: null },
  ];

  it("비서실장은 CEO 직속·직함 비서실장, 부서장은 비서실장에게, 부서원은 부서장에게 보고", () => {
    let org = run(withChief(), CEO, [{ op: "createDepartment", name: "개발", reportsTo: "chief" }]).org;
    const dep = org.departments[0].id;
    org = run(org, CEO, [
      { op: "assign", member: `paperclip:${AGENT_A}`, departmentId: dep, lead: true, title: "개발 리드", duty: "코드 리뷰" },
      { op: "assign", member: `paperclip:${AGENT_B}`, departmentId: dep },
    ]).org;
    const plan = syncPlan(org, current);
    expect(plan).toEqual([
      { agentId: CHIEF, patch: { title: "비서실장" } },
      { agentId: AGENT_A, patch: { reportsTo: CHIEF, title: "개발 리드", capabilities: "코드 리뷰" } },
    ]);
  });

  it("CEO 직속 부서의 부서장은 최상위(null), 부서장이 없으면 부서원은 부서의 상위에게 보고", () => {
    let org = run(withChief(), CEO, [{ op: "createDepartment", name: "전략", reportsTo: "ceo" }]).org;
    const dep = org.departments[0].id;
    org = run(org, CEO, [{ op: "assign", member: `paperclip:${AGENT_B}`, departmentId: dep }]).org;
    expect(syncPlan(org, current)).toEqual([
      { agentId: CHIEF, patch: { title: "비서실장" } },
      { agentId: AGENT_B, patch: { reportsTo: null } },
    ]);
  });

  it("직함이 비어 있으면 Paperclip 직함은 건드리지 않고, 변경이 없으면 계획도 비어 있다", () => {
    const org = withChief();
    const synced = [{ id: CHIEF, reportsTo: null, title: "비서실장", capabilities: null }];
    expect(syncPlan(org, synced)).toEqual([]);
  });

  it("관리하던 구성원이 미배치가 되면 보고선을 최상위로 되돌린다", () => {
    let org = run(withChief(), CEO, [{ op: "createDepartment", name: "개발", reportsTo: "chief" }]).org;
    const dep = org.departments[0].id;
    org = run(org, CEO, [{ op: "assign", member: `paperclip:${AGENT_A}`, departmentId: dep, lead: true }]).org;
    org = run(org, CEO, [{ op: "assign", member: `paperclip:${AGENT_A}`, departmentId: null }]).org;
    const plan = syncPlan(org, [{ id: CHIEF, reportsTo: null, title: "비서실장", capabilities: null }, { id: AGENT_A, reportsTo: CHIEF, title: null, capabilities: null }]);
    expect(plan).toEqual([{ agentId: AGENT_A, patch: { reportsTo: null } }]);
  });

  it("Hermes 봇 배치는 Paperclip을 바꾸지 않는다", () => {
    let org = run(withChief(), CEO, [{ op: "createDepartment", name: "디자인" }]).org;
    org = run(org, CEO, [{ op: "assign", member: "hermes:ub514-uc790-uc774-ub108", departmentId: org.departments[0].id, lead: true }]).org;
    expect(syncPlan(org, [{ id: CHIEF, reportsTo: null, title: "비서실장", capabilities: null }])).toEqual([]);
  });
});

describe("화면용 보기", () => {
  it("부서별 구성원(부서장 먼저), 미배치, 모델 개수, 사라진 구성원 표시", () => {
    let org = run(withChief(), CEO, [{ op: "createDepartment", name: "개발" }]).org;
    const dep = org.departments[0].id;
    org = run(org, CEO, [
      { op: "assign", member: `paperclip:${AGENT_B}`, departmentId: dep },
      { op: "assign", member: `paperclip:${AGENT_A}`, departmentId: dep, lead: true },
    ]).org;
    org = { ...org, placements: { ...org.placements, "hermes:gone-bot": { memberId: "hermes:gone-bot", departmentId: dep, title: null, duty: null, lead: false } } };
    const view = viewOf(org, members, CEO);
    expect(view.chief?.name).toBe("비서실장");
    expect(view.departments[0].members.map((m) => m.name)).toEqual(["콘텐츠봇", "개발봇", "(연결 끊김) gone-bot"]);
    expect(view.unassigned.map((m) => m.name)).toEqual(["디자이너"]);
    expect(view.runtimeCounts).toEqual([{ runtime: "Claude", count: 2 }, { runtime: "Codex", count: 1 }, { runtime: "Hermes 봇", count: 1 }]);
    expect(view.permissions).toEqual({ canEdit: true, canAppointChief: true });
  });
});
