import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const own=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const state=JSON.parse(fs.readFileSync(path.join(own,'evidence/current-state.json'),'utf8'));
const companyId=state.company.id;
const receiptFile=path.join(own,'evidence/chief-request.json');
async function api(method,endpoint,body) {
  const r=await fetch(`http://127.0.0.1:3100/api${endpoint}`,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
  const text=await r.text(); let j;try{j=JSON.parse(text);}catch{throw new Error(`Non-JSON HTTP ${r.status}`);}
  if(!r.ok)throw new Error(`HTTP ${r.status} at ${endpoint}: ${JSON.stringify(j).slice(0,800)}`);
  return j;
}
const mode=process.argv[2];
if(mode==='submit') {
  assert(!fs.existsSync(receiptFile),'request already recorded; use status');
  const input=fs.readFileSync(path.join(own,'CHIEF-BRIEF.md'),'utf8');
  assert(input.length<=8000);
  // A network timeout leaves this guard in place: recover by read-only issue lookup, never blindly resubmit.
  const intent=path.join(own,'evidence/submission-intent.local.json');
  fs.writeFileSync(intent,JSON.stringify({at:new Date().toISOString(),chiefId:state.chief.id}),{flag:'wx'});
  const j=await api('POST','/plugins/agentos.control/bridge/action',{key:'chiefRequestCreate',companyId,params:{companyId,input}});
  assert(j.data?.id, 'missing issue id');
  const saved={...j.data,chiefId:state.chief.id,companyId,createdAt:new Date().toISOString()};
  fs.writeFileSync(receiptFile,JSON.stringify(saved,null,2));
  const issue=await api('GET',`/issues/${saved.id}`);
  assert.equal(issue.description,input);assert.equal(issue.assigneeAgentId,state.chief.id);
  console.log(JSON.stringify({receipt:saved,readback:{id:issue.id,identifier:issue.identifier,status:issue.status}},null,2));
} else {
  const saved=JSON.parse(fs.readFileSync(receiptFile,'utf8'));
  if(mode==='status') {
    const j=await api('POST','/plugins/agentos.control/bridge/data',{key:'chiefRequest',companyId,params:{companyId,issueId:saved.id}});
    const d=j.data; assert(d?.request?.id===saved.id);
    fs.writeFileSync(path.join(own,'evidence/chief-status.local.json'),JSON.stringify({at:new Date().toISOString(),...d},null,2));
    console.log(JSON.stringify(d,null,2));
  } else if(mode==='accept') {
    const interactionId=process.argv[3];assert(/^[a-f0-9-]{36}$/.test(interactionId??''),'explicit reviewed interaction id required');
    const j=await api('POST','/plugins/agentos.control/bridge/action',{key:'chiefDecide',companyId,params:{companyId,issueId:saved.id,interactionId,action:'accept'}});
    const interactions=await api('GET',`/issues/${saved.id}/interactions`);
    const card=interactions.find(i=>i.id===interactionId);assert.equal(card?.status,'accepted');
    console.log(JSON.stringify({result:j.data,readback:{id:card.id,status:card.status,resolvedByUserId:card.resolvedByUserId,resolvedByAgentId:card.resolvedByAgentId}},null,2));
  } else throw new Error('mode must be submit, status, or accept');
}
