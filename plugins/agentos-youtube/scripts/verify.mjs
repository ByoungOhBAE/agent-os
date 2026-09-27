import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const own=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const root=path.resolve(own,'../..');
const mode=process.argv[2];
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const docs=['README.md','docs/chief-of-staff-process-plan.md','docs/dashboard-redesign-plan.md','docs/group-chat-control-plan.md','docs/hermes-bot-redesign-plan.md','docs/online-migration-runbook-b.md','docs/online-operation-plan.md','docs/unified-control-contract.md','docs/unified-control-plan.md'];
const allowed=new Set(docs);
// User-approved code exception (2026-09-28): default per-run limit for new bots raised to 4h.
const approvedCode=new Set(['scripts/hermes-bots.mjs']);
export function compare(baseline, current, permitted=new Set()) {
  return Object.entries(baseline).filter(([f,h])=>!permitted.has(f)&&current[f]!==h).map(([f])=>f);
}
if(mode==='preservation') {
  const baseline=JSON.parse(fs.readFileSync(path.join(own,'evidence/baseline.local.json'),'utf8'));
  const current={};
  for(const f of Object.keys(baseline.files)){const p=path.join(root,f);if(fs.existsSync(p))current[f]=sha(fs.readFileSync(p));}
  assert.deepEqual(compare({a:'original'}, {a:'modified'}), ['a'], 'positive control must detect a changed file');
  assert.deepEqual(compare({a:'original'}, {}), ['a'], 'missing file must not pass');
  const changed=compare(baseline.files,current,new Set([...allowed,...approvedCode]));
  assert.deepEqual(changed,[],`protected files changed: ${changed.join(', ')}`);
  const hb=read('scripts/hermes-bots.mjs');assert(hb.includes('timeoutSec: 14400,')&&!hb.includes('timeoutSec: 1800,'),'hermes-bots default limit must be 14400');
  console.log(`PRESERVATION_VERIFIED baseline=${Object.keys(baseline.files).length} allowedDocs=${allowed.size} approvedCode=${approvedCode.size}`);
} else if(mode==='docs') {
  for(const f of docs) {
    const s=read(f); assert(s.includes('OPERATIONS-AUDIT.md'), `no current audit reference: ${f}`);
    for(const match of s.matchAll(/\]\(([^)]+)\)/g)) {
      const link=match[1]; if(/^(https?:|#|mailto:)/.test(link))continue;
      assert(fs.existsSync(path.resolve(path.dirname(path.join(root,f)),link.split('#')[0])),`broken local link: ${f} -> ${link}`);
    }
  }
  const s=read('README.md'); for(const term of ['hermes_gateway','supported:false','127.0.0.1:4200','폴링','Tailscale'])assert(s.includes(term), `missing current contract: ${term}`);
  assert(!read('docs/unified-control-contract.md').includes('| 그룹방 | 서버 API 없음 |'));
  assert(!read('docs/online-operation-plan.md').includes('| GPU 없는 일반 서버로는 못 옮김 |'));
  for(const f of ['scripts/hermes-bots.mjs','plugins/agentos-control/src/chief.ts','server/rooms.mjs','plugins/agentos-control/src/ui/rooms.tsx'])assert(fs.existsSync(path.join(root,f)),f);
  const state=JSON.parse(fs.readFileSync(path.join(own,'evidence/current-state.json'),'utf8'));
  assert(state.chief.hermesDefault && state.chief.hireCommand);
  assert(state.agents.some(a=>a.id===state.chief.id&&a.adapterType==='hermes_gateway'));
  console.log(`DOCUMENTATION_VERIFIED corrected=${docs.length}`);
} else if(mode==='chief') {
  const record=JSON.parse(fs.readFileSync(path.join(own,'evidence/chief-request.json'),'utf8'));
  const r=await fetch(`http://127.0.0.1:3100/api/issues/${record.id}`,{signal:AbortSignal.timeout(15000)});assert.equal(r.status,200);
  const j=await r.json();assert.equal(j.id,record.id);assert.equal(j.assigneeAgentId,record.chiefId);
  assert.equal(j.description,fs.readFileSync(path.join(own,'CHIEF-BRIEF.md'),'utf8').trim());
  assert.equal(j.originKind,'plugin:agentos.control:chief');
  console.log(`CHIEF_REQUEST_VERIFIED issue=${j.identifier} status=${j.status}`);
} else if(mode==='commit') {
  const r=JSON.parse(fs.readFileSync(path.join(own,'evidence/task-commit.local.json'),'utf8'));
  assert(/^[a-f0-9]{40}$/.test(r.commit));
  const files=execFileSync('git',['diff-tree','--no-commit-id','--name-only','-r',r.commit],{cwd:root,encoding:'utf8'}).trim().split('\n');
  assert(files.length>0&&files.every(f=>allowed.has(f)||f.startsWith('plugins/agentos-youtube/')),`out-of-scope commit: ${files}`);
  for(const d of docs)assert(files.includes(d),`document omitted from commit: ${d}`);
  assert(!files.some(f=>f.includes('.local.')||f.includes('agent-work/')));
  console.log(`TASK_COMMIT_VERIFIED commit=${r.commit} files=${files.length}`);
} else throw new Error('mode must be preservation, docs, chief, or commit');
