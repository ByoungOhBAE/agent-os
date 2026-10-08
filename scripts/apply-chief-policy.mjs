// Approved chief-only migration. Default dry-run; --apply backs up, writes, then reads every target back.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {mergePolicy,SECTION,VERSION,PLAN_SKILL,CHIEF_SKILL,PAPERCLIP_SKILL} from './chief-policy.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const home='C:/Users/tahar/AppData/Local/hermes/profiles/pc-ebb0943f';
const api='http://127.0.0.1:3100/api', company='db6f5310-0afc-4b67-8ca2-8059bd26f0cb', id='23dd30d4-9a68-4a5d-83f6-942c4380462d';
const apply=process.argv.includes('--apply'),check=process.argv.includes('--check');
const sha=x=>createHash('sha256').update(x).digest('hex');
async function http(route,method='GET',body){const r=await fetch(api+route,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});if(!r.ok)throw Error(`${method} ${route}: ${r.status}`);return r.json();}
const a=await http('/agents/'+id);
if(a.adapterConfig?.apiBaseUrl!=='http://127.0.0.1:8645/p/pc-ebb0943f')throw Error('chief mapping changed');
if(apply&&a.status!=='idle')throw Error('chief must be idle; do not alter an active request');
const route='/agents/'+id+'/instructions-bundle/file';
const agents=(await http(route+'?path=AGENTS.md')).content;
const skill=(await http('/companies/'+company+'/skills')).find(s=>s.slug==='omh-plan');
if(!skill)throw Error('plan company skill missing');
const skillRoute=`/companies/${company}/skills/${skill.id}/files`;
const oldPlan=(await http(skillRoute+'?path=SKILL.md')).content;
const files=new Map([
 ['SOUL.md',mergePolicy(readFileSync(path.join(home,'SOUL.md'),'utf8'))],
 ['skills/paperclip/agentos-chief-of-staff/SKILL.md',CHIEF_SKILL],
 ['skills/paperclip/paperclip/SKILL.md',PAPERCLIP_SKILL],
 ['skills/paperclip/agentos-chief-plan/SKILL.md',PLAN_SKILL],
]);
const oldChief=readFileSync(path.join(home,'skills/paperclip/agentos-chief-of-staff/SKILL.md'),'utf8');
const oldPaperclip=readFileSync(path.join(home,'skills/paperclip/paperclip/SKILL.md'),'utf8');
const refs=[['skills/paperclip/agentos-chief-of-staff/references/legacy-chief.md',oldChief],['skills/paperclip/paperclip/references/full-coordination.md',oldPaperclip]];
const coord='skills/paperclip/agentos-chief-of-staff/references/coordination.md';
// Preserve audited operational recipes; only coordination, not the obsolete research/supervision sections.
if(!existsSync(path.join(home,coord))){
 const sections=oldChief.split(/(?=^## )/m).filter(s=>/^## (0\.|2\.|3\.|5\.)/.test(s));
 if(sections.length!==4)throw Error('unexpected old chief headings; review before migration');
 const lines=sections.join('\n').split('\n').filter(l=>!/^(- Re-check|5\. Before writing)/.test(l)&&!l.includes('Re-check `git log')&&!l.includes("Check the template's `skills/`")&&!l.includes('Check the template')&&!l.includes('4b. External skill')&&!l.includes('npx skills find'));
 files.set(coord,'# 조정 API 상세 참조\n현재 chief-policy-v2가 우선입니다. 아래의 기술 설치/검증/원본 확인 절차는 실행/검수 봇에게 지시할 내용이며 비서실장이 실행하지 않습니다. 단계에 필요한 절만 읽습니다.\n\n'+lines.join('\n'));
}
for(const [f,body] of refs)if(!existsSync(path.join(home,f)))files.set(f,body);
const next=mergePolicy(agents);
if(check){
 if(agents!==next||oldPlan!==PLAN_SKILL)throw Error('canonical policy drift');
 for(const [f,body] of files)if(readFileSync(path.join(home,f),'utf8')!==body)throw Error('profile policy drift: '+f);
 const ledger=JSON.parse(readFileSync(path.join(root,'.unlazy/chief-improve/applied.json'),'utf8'));
 for(const item of ledger.backups)if(sha(readFileSync(item.path))!==item.sha256)throw Error('backup integrity: '+item.path);
 if(!readFileSync(path.join(home,'SOUL.md'),'utf8').includes(SECTION))throw Error('soul policy missing');
 console.log('CHIEF_POLICY_LIVE_OK');process.exit(0);
}
console.log(JSON.stringify({mode:apply?'apply':'dry-run',profile:'pc-ebb0943f',version:VERSION,files:[...files].map(([f,s])=>({file:f,before:existsSync(path.join(home,f))?readFileSync(path.join(home,f)).length:null,after:Buffer.byteLength(s)}))},null,2));
if(!apply)process.exit(0);
const dir=path.join(root,'.unlazy/chief-improve/backups',new Date().toISOString().replace(/[:.]/g,'-'));mkdirSync(dir,{recursive:true});
const backups=[];
function backup(name,bytes){const target=path.join(dir,name);mkdirSync(path.dirname(target),{recursive:true});writeFileSync(target,bytes,{flag:'wx'});backups.push({path:target,sha256:sha(bytes)});}
backup('AGENTS.md',Buffer.from(agents));backup('company-plan.md',Buffer.from(oldPlan));
const configHash=sha(readFileSync(path.join(home,'config.yaml')));
for(const [f] of files)if(existsSync(path.join(home,f)))backup(f,readFileSync(path.join(home,f)));
for(const [f,body] of files){const target=path.join(home,f);mkdirSync(path.dirname(target),{recursive:true});writeFileSync(target,body);}
await http(route,'PUT',{path:'AGENTS.md',content:next});
await http(skillRoute,'PATCH',{path:'SKILL.md',content:PLAN_SKILL});
if((await http(route+'?path=AGENTS.md')).content!==next)throw Error('AGENTS readback mismatch');
if((await http(skillRoute+'?path=SKILL.md')).content!==PLAN_SKILL)throw Error('plan readback mismatch');
for(const [f,body] of files)if(readFileSync(path.join(home,f),'utf8')!==body)throw Error('local readback mismatch: '+f);
if(sha(readFileSync(path.join(home,'config.yaml')))!==configHash)throw Error('config changed unexpectedly');
writeFileSync(path.join(root,'.unlazy/chief-improve/applied.json'),JSON.stringify({version:VERSION,backups,files:[...files.keys()],configHash},null,2));
console.log('CHIEF_POLICY_APPLIED_AND_READBACK_OK');
