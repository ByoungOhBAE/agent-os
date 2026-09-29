import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('setup uses bounded chief policy instead of unbounded research',()=>{
 const source=readFileSync(new URL('./setup-chief-single-window.mjs',import.meta.url),'utf8');
 assert.ok(/chief-policy\.mjs/.test(source));
 assert.ok(source.includes('desired.desiredSkills'), 'unsupported gateway sync must still read desired skill keys');
});
const {mergePolicy,START,END,POLICY,PLAN_SKILL,CHIEF_SKILL,PAPERCLIP_SKILL}=await import('./chief-policy.mjs');
test('managed replacement preserves unrelated instructions and is idempotent',()=>{
 const source='custom before\n'+START+'old'+END+'\ncustom after';
 const updated=mergePolicy(source);
 assert.ok(updated.startsWith('custom before\n')&&updated.endsWith('\ncustom after'));
 assert.equal(mergePolicy(updated),updated);
 assert.throws(()=>mergePolicy(START+'broken'),/malformed/);
 assert.throws(()=>mergePolicy(END+'broken'),/malformed/);
});
test('planning boundary, no experiments, execution delegation and review evidence exceptions are explicit',()=>{
 for(const phrase of ['계획 전 조사 경계','계획 전 실험 금지','직접 실행 금지','예외(비서실장 본업)','독립 검수자의 승인','같은 결과물 revision/commit','증거 없음','자기 승인 금지','시간 제한 때문에 작업을 쪼개지']) assert.ok(POLICY.includes(phrase),phrase);
});
test('compact hot skills retain safety and on-demand references',()=>{
 assert.ok(Buffer.byteLength(PAPERCLIP_SKILL)<6000);
 assert.ok(Buffer.byteLength(CHIEF_SKILL)<3000);
 for(const phrase of ['X-Paperclip-Run-Id','409','latestRevisionId','blockedByIssueIds','full-coordination.md','자기 승인 금지']) assert.ok(PAPERCLIP_SKILL.includes(phrase)||phrase==='latestRevisionId'&&PAPERCLIP_SKILL.includes('최신 revision'),phrase);
 assert.ok(PLAN_SKILL.includes('가정')&&PLAN_SKILL.includes('독립 검수'));
});
