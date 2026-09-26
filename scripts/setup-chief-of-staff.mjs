// Production setup of the 비서실장 (chief of staff) agent. Idempotent.
// 1) back up the current AGENTS.md (gitignored ledger dir)  2) CEO(board) appoints the chief through the org plugin
//    (Paperclip title "비서실장" + native agents:configure grant)  3) append the org-management section to AGENTS.md.
// Usage: node scripts/setup-chief-of-staff.mjs <apiBase> <companyId> <agentId>
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const [api, company, agentId] = process.argv.slice(2);
if (!api || !company || !agentId) throw new Error("usage: <apiBase> <companyId> <agentId>");
const MARK = "<!-- agentos-org:chief-of-staff -->";

async function http(path, init = {}) {
  const r = await fetch(api + path, { ...init, headers: { "Content-Type": "application/json", ...(init.headers ?? {}) } });
  const text = await r.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!r.ok) throw new Error(`${init.method ?? "GET"} ${path} -> ${r.status}: ${String(text).slice(0, 200)}`);
  return data;
}

const SECTION = `
${MARK}
## 비서실장 역할 (AgentOS 조직 배치도)

당신은 이 회사의 **비서실장**입니다. CEO(보드 사용자)와 직접 소통하고, 조직 배치도를 CEO와 함께 관리합니다.

권한
- 부서 만들기·이름/아이콘/보고선 변경·삭제·순서 변경, 구성원 배치·이동·직함·담당·부서장 지정·배치 해제.
- Paperclip 에이전트 설정 편집(\`agents:configure\`): 부서원의 실행 설정·지시문 편집.
- 비서실장 지정·교체와 권한(permissions) 변경은 CEO만 할 수 있습니다. 시도하지 마세요.

조직 배치도 API — 반드시 실행 환경변수를 그대로 쓰고, 키를 출력·기록하지 마세요.
\`\`\`bash
# 현재 배치도 보기 (version, departments, unassigned, permissions)
curl -s -X POST "$PAPERCLIP_API_URL/api/plugins/agentos.org/bridge/action" \\
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" -H "Content-Type: application/json" \\
  -d "{\\"key\\":\\"view\\",\\"companyId\\":\\"$PAPERCLIP_COMPANY_ID\\",\\"params\\":{}}"

# 변경 (여러 op를 한 번에, expectedVersion은 방금 본 version)
curl -s -X POST "$PAPERCLIP_API_URL/api/plugins/agentos.org/bridge/action" \\
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" -H "Content-Type: application/json" \\
  -d "{\\"key\\":\\"apply\\",\\"companyId\\":\\"$PAPERCLIP_COMPANY_ID\\",\\"params\\":{\\"expectedVersion\\":VERSION,\\"ops\\":[ ... ]}}"
\`\`\`
op 목록
- \`{"op":"createDepartment","name":"콘텐츠","icon":"document","reportsTo":"chief"}\` — icon: team, document, chat, brush, code, cart, chart, shield, megaphone, compass / reportsTo: chief(기본) 또는 ceo
- \`{"op":"updateDepartment","id":"<부서ID>","name":"…","icon":"…","reportsTo":"ceo"}\`, \`{"op":"deleteDepartment","id":"…"}\`, \`{"op":"moveDepartment","id":"…","index":0}\`
- \`{"op":"assign","member":"paperclip:<agentId>" 또는 "hermes:<프로필>","departmentId":"<부서ID>"|null,"title":"콘텐츠 리드","duty":"블로그·뉴스레터","lead":true}\`
- \`{"op":"updateMember","member":"…","title":"…","duty":"…","lead":false}\`
구성원 ID는 view 응답의 departments[].members[].id / unassigned[].id 를 그대로 쓰세요.

원칙
- 조직 변경은 CEO 지시나 승인된 이슈가 있을 때만 합니다. 변경 후 결과(부서·구성원·Paperclip 반영 건수, 실패 항목)를 이슈 댓글로 보고하세요.
- \`sync.failed\`가 비어 있지 않으면 실패 사유를 그대로 보고하고 추측으로 재시도하지 마세요.
`;

const bundle = `/api/agents/${agentId}/instructions-bundle/file?path=AGENTS.md`;
const current = (await http(bundle)).content ?? "";
// Relative to this script so Windows node and WSL node both land in the repo ledger dir (never a literal "C:" folder).
const dir = fileURLToPath(new URL("../.unlazy/org-chart/backups", import.meta.url));
mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
writeFileSync(`${dir}/chief-AGENTS-${stamp}.md`, current);
console.log(`backup=${dir}/chief-AGENTS-${stamp}.md (${current.length} chars)`);

const view = await http("/api/plugins/agentos.org/bridge/action", {
  method: "POST", body: JSON.stringify({ key: "apply", companyId: company, params: { ops: [{ op: "setChief", agentId }] } }),
});
const v = view.data?.view;
console.log(`chief=${v?.chief?.name} canConfigure=${v?.chiefCanConfigure} syncFailed=${JSON.stringify(view.data?.sync?.failed ?? [])}`);

if (current.includes(MARK)) {
  console.log("instructions: section already present");
} else {
  await http(`/api/agents/${agentId}/instructions-bundle/file`, {
    method: "PUT", body: JSON.stringify({ path: "AGENTS.md", content: `${current.trimEnd()}\n${SECTION}` }),
  });
  console.log("instructions: section appended");
}
const after = await http(`/api/agents/${agentId}`);
const grants = (after.access?.grants ?? []).map((g) => g.permissionKey);
const ok = after.title === "비서실장" && grants.includes("agents:configure") && (await http(bundle)).content.includes(MARK);
console.log(`title=${after.title} grants=${grants.join(",")}`);
console.log(ok ? "CHIEF_SETUP_OK" : "CHIEF_SETUP_FAIL");
process.exit(ok ? 0 : 1);
