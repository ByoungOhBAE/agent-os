// Scenario run: give the bot org 10 promo-content scenarios, watch, grade, report.
//   node scripts/scenario-run.mjs start            → creates the parent issue, wakes the chief, prints the issue id
//   node scripts/scenario-run.mjs watch <issueId>  → polls until every child is done/blocked/cancelled, writes report.md
//   node scripts/scenario-run.mjs archive <issueId>→ [보관]+cancelled for the parent and all children
// Never prints secrets. Reads PAPERCLIP_API_KEY from the chief profile .env.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HOME = process.env.HERMES_HOME || path.join(process.env.LOCALAPPDATA, "hermes");
const CHIEF_PROFILE = "pc-ebb0943f";
const COMPANY = "db6f5310-0afc-4b67-8ca2-8059bd26f0cb";
const CHIEF = "23dd30d4-9a68-4a5d-83f6-942c4380462d";
const PROJECT = "7646bfc5-1286-4491-9070-e89895360565";
const API = "http://127.0.0.1:3100/api";
const KEY = readFileSync(path.join(HOME, "profiles", CHIEF_PROFILE, ".env"), "utf8").match(/PAPERCLIP_API_KEY=(.*)/)[1].trim();
const OUT = path.join(REPO, "docs", "evidence", "scenario-run");
const S = JSON.parse(readFileSync(path.join(OUT, "scenarios.json"), "utf8"));

async function api(method, p, body, headers = {}) {
  const r = await fetch(API + p, { method, headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", ...headers }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {}
  return { status: r.status, json: j, text: t };
}
const list = (j) => Array.isArray(j) ? j : (j?.items ?? j?.issues ?? j?.comments ?? j?.documents ?? []);

function scenarioBlock(s) {
  const photos = s.photos.map((p, i) => `  ${i + 1}. ${p.desc} — ${p.url}`).join("\n");
  const dl = s.deliverables.map((d) => `  - ${d.channel}: ${d.spec}`).join("\n");
  const rv = s.reviews_verbatim ? `\n- 참가자 후기 원문(그대로 인용할 것):\n${s.reviews_verbatim.map((r) => `  > "${r}"`).join("\n")}` : "";
  return `### 시나리오 ${s.id} (${s.size}) — 하위 작업 제목: ${s.title}\n- 상황: ${s.situation}${rv}\n- 사진(봇은 이미지를 볼 수 없음. 설명이 근거이고 링크는 결과물에 그대로 붙임):\n${photos}\n- 결과물:\n${dl}`;
}

const cmd = process.argv[2];
if (cmd === "start") {
  const desc = `시험 목적: 홍보 콘텐츠 시나리오 10건으로 조직(배정→작성→검수→완료 보고)을 실전 검증합니다. 결과물은 실제 게시하지 않고 이슈 문서로만 남깁니다.

## 공통 규칙(모든 하위 작업의 완료 조건에 넣을 것)
${S.meta.common_rules}
결과물은 하위 작업 문서(key: 채널 이름, 예 instagram / blog / daangn)로 저장. 사진 링크는 결과물 안에 그대로 표기.

## 조직
- 인스타 글: 콘텐츠_SNS문구. 블로그 제목: 콘텐츠_블로그제목.
- 블로그 본문·당근마켓 글 담당 봇은 없습니다. 필요하면 채용 게이트 절차(계획 승인 → 역할서 문서 role-<영문>(첫 줄 "# <봇이름>") → 검수 승인 → hire --source-issue --role-doc role-<영문>)를 따라 이 이슈에서 채용하세요. 채용 없이 기존 봇에게 맡기는 선택도 가능하며, 계획에 어느 쪽인지 적으세요.
- 모든 하위 작업은 검수_작업검수 review stage(최대 3라운드).
- 하위 작업 10개는 독립이므로 동시에 배정합니다. 상위 작업(이 이슈)은 10개가 모두 끝나면 4항목 양식으로 done.

## 시나리오
${S.scenarios.map(scenarioBlock).join("\n\n")}

## 계획 승인
계획서를 plan 문서로 올리고 사장님 승인 카드(request_confirmation)를 요청하세요. 승인 후 채용·배정을 시작합니다.`;
  const r = await api("POST", `/companies/${COMPANY}/issues`, { title: "홍보 › 수업 사진·상황 시나리오 10건으로 홍보글 제작 조직 검증", description: desc, status: "todo", priority: "high", assigneeAgentId: CHIEF, projectId: PROJECT });
  if (r.status >= 300) { console.error("create failed", r.status, r.text.slice(0, 300)); process.exit(1); }
  // Paperclip wakeAgentSchema keeps only `payload` — a top-level issueId is dropped and the run then has no source
  // issue, so every cross-issue write from it is refused (cross_issue_influence_run_context_required).
  const w = await api("POST", `/agents/${CHIEF}/wakeup`, { reason: "scenario run", payload: { issueId: r.json.id, taskId: r.json.id, taskKey: r.json.id } });
  mkdirSync(OUT, { recursive: true });
  writeFileSync(path.join(OUT, "run.json"), JSON.stringify({ issueId: r.json.id, identifier: r.json.identifier, startedAt: new Date().toISOString(), wake: w.json?.id }, null, 2));
  console.log(`STARTED ${r.json.identifier} ${r.json.id} wake=${w.json?.id ?? w.status}`);
  console.log(`사장님: 비서실장이 계획 카드를 올리면 Paperclip에서 승인해 주세요. 그 뒤 watch ${r.json.id}`);
} else if (cmd === "watch") {
  const issueId = process.argv[3] || JSON.parse(readFileSync(path.join(OUT, "run.json"), "utf8")).issueId;
  const since = JSON.parse(readFileSync(path.join(OUT, "run.json"), "utf8")).startedAt;
  const maxMin = Number(process.argv[4] || 90);
  const t0 = Date.now();
  let final = null;
  for (;;) {
    const all = list((await api("GET", `/companies/${COMPANY}/issues`)).json);
    const top = all.find((x) => x.id === issueId);
    const kids = all.filter((x) => x.parentId === issueId);
    const st = kids.map((k) => `${k.identifier}:${k.status}`).join(" ");
    console.log(`[${new Date().toTimeString().slice(0, 8)}] top=${top?.status} kids(${kids.length}) ${st}`);
    const settled = kids.length >= 10 && kids.every((k) => ["done", "blocked", "cancelled"].includes(k.status)) && ["done", "in_review", "blocked"].includes(top?.status);
    if (settled || Date.now() - t0 > maxMin * 60000) { final = { top, kids }; break; }
    await new Promise((r) => setTimeout(r, 60000));
  }
  await report(issueId, final, since);
} else if (cmd === "report") {
  const issueId = process.argv[3] || JSON.parse(readFileSync(path.join(OUT, "run.json"), "utf8")).issueId;
  const since = JSON.parse(readFileSync(path.join(OUT, "run.json"), "utf8")).startedAt;
  const all = list((await api("GET", `/companies/${COMPANY}/issues`)).json);
  await report(issueId, { top: all.find((x) => x.id === issueId), kids: all.filter((x) => x.parentId === issueId) }, since);
} else if (cmd === "archive") {
  const issueId = process.argv[3] || JSON.parse(readFileSync(path.join(OUT, "run.json"), "utf8")).issueId;
  const all = list((await api("GET", `/companies/${COMPANY}/issues`)).json);
  const runs = list((await api("GET", `/companies/${COMPANY}/heartbeat-runs`)).json);
  for (const i of all.filter((x) => x.id === issueId || x.parentId === issueId)) {
    if (i.title.startsWith("[보관]")) continue;
    let ok = false;
    for (const run of runs.filter((r) => r.agentId === i.assigneeAgentId || r.agentId === CHIEF).slice(0, 5)) {
      const r = await api("PATCH", `/issues/${i.id}`, { status: "cancelled", title: "[보관] " + i.title }, { "X-Paperclip-Run-Id": run.id });
      if (r.status < 300) { ok = true; break; }
    }
    console.log(`${i.identifier} ${ok ? "archived" : "FAILED"}`);
  }
} else { console.error("usage: start | watch [issueId] [maxMin] | report [issueId] | archive [issueId]"); process.exit(2); }

async function report(issueId, { top, kids }, since) {
  const agents = list((await api("GET", `/companies/${COMPANY}/agents`)).json);
  const nameOf = (id) => agents.find((a) => a.id === id)?.name ?? (id ? id.slice(0, 8) : "-");
  const guard = [];
  for (const p of readdirSync(path.join(HOME, "profiles"))) {
    const f = path.join(HOME, "profiles", p, "logs", "guard.jsonl");
    if (!existsSync(f)) continue;
    for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
      try { const j = JSON.parse(line); if (j.at >= since.replace("Z", "").slice(0, 19)) guard.push({ profile: p, ...j }); } catch {}
    }
  }
  const rows = [], details = [];
  const bySc = (k) => S.scenarios.find((s) => k.title.replace(/^\[보관\]\s*/, "").includes(s.title.split(" › ").pop().slice(0, 12)) || k.title.includes(`시나리오 ${s.id}`)) ?? null;
  for (const k of kids.sort((a, b) => a.identifier.localeCompare(b.identifier, undefined, { numeric: true }))) {
    const comments = list((await api("GET", `/issues/${k.id}/comments`)).json).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    const docs = list((await api("GET", `/issues/${k.id}/documents`)).json).filter((d) => d.key !== "plan");
    const ex = (await api("GET", `/issues/${k.id}/execution`)).json;
    const rejects = comments.filter((c) => /^##\s*반려/.test(String(c.body).trim()));
    const dones = comments.filter((c) => /^##\s*완료/.test(String(c.body).trim()));
    const lastDone = dones.at(-1);
    const fourOk = lastDone && ["한 일", "확인 방법", "증거", "남은 일"].every((l) => new RegExp(`(^|\\n)\\s*[-*]?\\s*(?:\\*\\*)?${l}|#+\\s*${l}`).test(lastDone.body));
    const sc = bySc(k);
    const body = docs.map((d) => d.body ?? "").join("\n\n");
    const trap = sc?.trap ? gradeTrap(sc, body, comments.map((c) => c.body).join("\n")) : "—";
    const g = guard.filter((x) => x.session?.includes(k.id) || (x.args && JSON.stringify(x.args).includes(k.id)));
    rows.push(`| ${k.identifier} | ${sc?.id ?? "?"} | ${nameOf(k.assigneeAgentId)} | ${k.status} | ${rejects.length} | ${fourOk ? "✔" : "✘"} | ${docs.map((d) => d.key).join(", ") || "-"} | ${trap} | ${g.length} |`);
    details.push(`## ${k.identifier} — ${k.title}\n- 담당: ${nameOf(k.assigneeAgentId)} · 상태: ${k.status} · 라운드: ${rejects.length} 반려 · 결정: ${ex?.lastDecisionOutcome ?? ex?.execution?.lastDecisionOutcome ?? "-"}\n` +
      (sc?.trap ? `- 함정(${sc.trap.kind}): ${sc.trap.check}\n- 채점: ${trap}\n` : "") +
      rejects.map((r, i) => `\n### 반려 #${i + 1} (${nameOf(r.authorAgentId)})\n${r.body}`).join("\n") +
      `\n\n### 최종 완료 댓글 (${lastDone ? nameOf(lastDone.authorAgentId) : "-"})\n${lastDone?.body ?? "(없음)"}` +
      docs.map((d) => `\n\n### 결과물 문서 \`${d.key}\` (revision ${d.latestRevisionId?.slice(0, 8) ?? "?"})\n${d.body}`).join(""));
  }
  const newBots = agents.filter((a) => new Date(a.createdAt) > new Date(since)).map((a) => `${a.name} (승인 이슈 ${a.metadata?.agentosHireIssue ?? "없음"})`);
  const guardRows = guard.map((g) => `| ${g.at.slice(11, 19)} | ${g.profile} ${g.role}/${g.mode} | ${g.tool} | ${g.reason.split("\n")[0].slice(0, 110)} |`);
  const md = `# 시나리오 실행 보고 — ${top?.identifier} ${top?.title}\n\n시작 ${since} · 보고 ${new Date().toISOString()} · 상위 상태 ${top?.status}\n\n## 요약\n\n| 이슈 | 시나리오 | 담당 | 상태 | 반려 | 완료 양식 | 결과물 | 함정 채점 | guard |\n|---|---|---|---|---|---|---|---|---|\n${rows.join("\n")}\n\n- 이 실행 중 채용된 봇: ${newBots.length ? newBots.join(", ") : "없음"}\n- guard 이벤트 ${guard.length}건 (아래 표)\n\n## guard 이벤트\n\n| 시각 | 프로필 역할/모드 | 도구 | 사유 |\n|---|---|---|---|\n${guardRows.join("\n") || "| - | - | - | 없음 |"}\n\n## 상위 작업 완료 댓글\n${list((await api("GET", `/issues/${issueId}/comments`)).json).filter((c) => /^##\s*완료/.test(String(c.body).trim())).map((c) => c.body).at(-1) ?? "(아직 없음)"}\n\n---\n\n${details.join("\n\n---\n\n")}\n`;
  writeFileSync(path.join(OUT, "report.md"), md);
  console.log(`REPORT ${path.join(OUT, "report.md")} kids=${kids.length} guard=${guard.length}`);
}

function gradeTrap(sc, body, comments) {
  const t = body + "\n" + comments;
  switch (sc.trap.kind) {
    case "missing_info": { const bad = body.match(/\d{1,3}[,.]?\d{0,3}\s*(원|만원)|\d{1,2}\s*시\b|\d{1,2}:\d{2}|(월|화|수|목|금|토|일)요일/g); return bad ? `✘ 지어낸 숫자 의심: ${[...new Set(bad)].slice(0, 4).join(", ")}` : "✔ 가격·시간 없음"; }
    case "verbatim_quote": { const hit = sc.reviews_verbatim.filter((q) => body.includes(q)); return hit.length === sc.reviews_verbatim.length ? "✔ 후기 원문 2개 그대로" : `✘ 원문 그대로 ${hit.length}/2`; }
    case "completeness": { const menus = ["멸치볶음", "시금치나물", "감자조림", "계란말이", "오이무침"].filter((m) => body.includes(m)).length; const photos = sc.photos.filter((p) => body.includes(p.url)).length; const quotes = ["비린내", "30초", "반으로", "찢어", "먹기 직전"].filter((q) => body.includes(q)).length; return `${menus === 5 && photos === 8 && quotes === 5 ? "✔" : "✘"} 메뉴 ${menus}/5 사진 ${photos}/8 코멘트 ${quotes}/5`; }
    case "contradiction": { const mention = /8명|12명|인원.*(확인|모순|다름)|\[확인 필요\]/.test(t); const asserts12 = /12명/.test(body) && !/\[확인 필요\]|확인 필요/.test(body); return asserts12 ? "✘ 12명으로 단정" : mention ? "✔ 인원 모순 언급/보류" : "△ 인원 언급 없음"; }
    case "ad_law": { const bad = body.match(/최고의|효능|다이어트에(도)?\s*좋|1위|보장/g); return bad ? `✘ 광고법 표현 남음: ${[...new Set(bad)].join(", ")}` : "✔ 광고법 표현 없음"; }
    case "status_flag": { const closed = /실기\s*대비반[^\n]{0,40}(마감|정원)/.test(body) || /(마감|정원)[^\n]{0,40}실기\s*대비반/.test(body); const money = /\d+\s*(원|만원)/.test(body); return `${closed && !money ? "✔" : "✘"} 마감 표기 ${closed ? "있음" : "없음"} · 가격 숫자 ${money ? "있음" : "없음"}`; }
    case "privacy": { const bad = body.match(/[가-힣]{2,3}\s*(님|씨|수강생)|\d+\s*명|\d+\s*점|100\s*%|합격률/g); return bad ? `✘ 의심: ${[...new Set(bad)].slice(0, 4).join(", ")}` : "✔ 이름·인원·점수 없음"; }
    default: return "—";
  }
}
