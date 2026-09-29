// Real chief gateway / high / fresh sessions. Planning-only replay, NOT an end-to-end production benchmark.
import { readFileSync, writeFileSync, mkdirSync, appendFileSync, existsSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
const phase=process.argv[2], out=process.argv[3];
if (!['before','after'].includes(phase)||!out) throw Error('usage: before|after <output-directory>');
mkdirSync(out,{recursive:true});
const home='C:/Users/tahar/AppData/Local/hermes/profiles/pc-ebb0943f';
const env=readFileSync(path.join(home,'.env'),'utf8');
const key=env.match(/^API_SERVER_KEY=(.*)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g,'');
if(!key) throw Error('gateway credential missing');
const base='http://127.0.0.1:8645/p/pc-ebb0943f', headers={Authorization:`Bearer ${key}`,'Content-Type':'application/json'};
const hash=b=>createHash('sha256').update(b).digest('hex');
const snap=()=>Object.fromEntries(['SOUL.md','config.yaml','memories/MEMORY.md','memories/USER.md','skills/paperclip/paperclip/SKILL.md','skills/paperclip/agentos-chief-of-staff/SKILL.md','skills/paperclip/omh-plan/SKILL.md'].map(f=>{const b=readFileSync(path.join(home,f));return[f,{sha256:hash(b),bytes:b.length}]}));
const snapshot=snap();
const tasks=[
 'AgentOS 조직도에서 사장님 직속 보안검수 역할을 추가하고 싶어. 기존 검수 봇과 중복되지 않게 배분하고, 개인정보·키 유출 가능성이 있는 결과물은 보안검수에서 반려해 수정시킬 수 있어야 해. 담당 가능한 기존 봇이 있으면 재사용하고 없으면 새로 만드는 계획을 세워줘.',
 '피그마 MCP를 화면디자인·코드구현·스킬탐색·작업검수 담당 봇이 사용할 수 있도록 연결 상태를 확인하고, 안 되어 있는 봇만 연결하는 계획을 세워줘. 기존 로그인을 보존하고 사장님이 필요한 승인은 직접 하도록 해줘.'
];
const instructions='승인된 읽기 전용 계획 비교 실험입니다. 실제 비서실장 프로필과 현재 역할 지침을 사용하세요. 운영 실행이 아니므로 계획 게시, 승인 카드, 하위 작업, 봇 생성, 파일 수정, 기억 저장, 설정 변경, 인증 실행, 실험 서버 조작은 하지 마세요. 도구는 읽기만 허용합니다. 최종 답변은 사장님께 제시할 계획 자체입니다. 현재 역할에 맞는 paperclip/agentos-chief-of-staff, paperclip/paperclip, paperclip/omh-plan 스킬을 먼저 로드하세요. 목록·조직 확인은 http://127.0.0.1:3100/api 의 읽기 GET만 허용하며 전체 adapterConfig·비밀값을 출력하지 마세요. 원본 코드의 읽기 여부는 현재 비서실장 운영 지침에 따라 결정하세요.';
const manifest=path.join(out,phase+'-manifest.json');
if(existsSync(manifest)) throw Error('refusing duplicate experiment');
writeFileSync(manifest,JSON.stringify({phase,profile:'pc-ebb0943f',effort:'high',model:'claude-opus-5-5',instructions,tasks,snapshot,createdAt:new Date().toISOString()},null,2));
for(let i=0;i<tasks.length;i++){
 const label=`${phase}-${i+1}`,session_id=`chief-policy-${label}-${randomUUID()}`,input=tasks[i],t0=Date.now();
 const r=await fetch(base+'/v1/runs',{method:'POST',headers,body:JSON.stringify({input,instructions,session_id,model:'claude-opus-5-5',provider:'anthropic',model_options:{reasoning_effort:'high'}})});
 if(!r.ok)throw Error(`create HTTP ${r.status}`);
 const {run_id}=await r.json();console.log(JSON.stringify({label,runId:run_id,sessionId:session_id,startedAt:new Date(t0).toISOString()}));
 writeFileSync(path.join(out,label+'-started.json'),JSON.stringify({label,runId:run_id,sessionId:session_id,startedAt:new Date(t0).toISOString()}));
 let st;
 do{await new Promise(r=>setTimeout(r,3000));const q=await fetch(`${base}/v1/runs/${run_id}`,{headers});if(!q.ok)throw Error(`poll HTTP ${q.status}`);st=await q.json();}while(!['completed','failed','cancelled'].includes(st.status));
 const text=typeof st.output==='string'?st.output:st.result?.output??st.final_response??'';
 writeFileSync(path.join(out,label+'.md'),String(text));
 const row={label,runId:run_id,sessionId:session_id,startedAt:new Date(t0).toISOString(),status:st.status,wallSec:(Date.now()-t0)/1000,outputChars:String(text).length,promptSha256:hash(input+'\n'+instructions)};
 appendFileSync(path.join(out,'runs.jsonl'),JSON.stringify(row)+'\n');console.log(JSON.stringify(row));
 if(st.status!=='completed'||!String(text).trim())throw Error('incomplete experiment');
}
const final=snap();writeFileSync(path.join(out,phase+'-after-snapshot.json'),JSON.stringify(final,null,2));
if(JSON.stringify(final)!==JSON.stringify(snapshot))throw Error('profile changed during experiment');
console.log('CHIEF_COMPARISON_PHASE_OK '+phase);
