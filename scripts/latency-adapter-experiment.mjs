// Read-only bounded matched-input experiment. Run under WSL node on the actual adapter host.
// No production config changes. Keys are read in memory and never printed or persisted.
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import os from 'node:os';
import path from 'node:path';
const out = process.argv[2];
if (!out) throw new Error('Usage: node latency-adapter-experiment.mjs <new-output-dir> [sample-count=6]');
mkdirSync(out, { recursive: true });
const resultFile = path.join(out, 'samples.jsonl');
if (existsSync(resultFile)) throw new Error('Refusing to overwrite/repeat an existing experiment');
const profile = process.argv[4] ?? 'pc-2e6cbe27';
if (!['pc-2e6cbe27', 'pc-7686fab2'].includes(profile)) throw new Error('Profile outside approved idle test set');
const home = '/mnt/c/Users/tahar/AppData/Local/hermes/profiles/' + profile;
const env = readFileSync(home + '/.env', 'utf8');
const key = env.match(/^API_SERVER_KEY=(.*)$/m)?.[1]?.trim();
if (!key) throw new Error('Missing gateway auth');
for (const name of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'OPENROUTER_API_KEY']) {
  if (new RegExp('^' + name + '=\\S+', 'm').test(env)) throw new Error('Unexpected provider-key override: ' + name);
}
const adapterPath = path.join(os.homedir(), '.paperclip/cli/current/node_modules/@paperclipai/hermes-paperclip-adapter/dist/gateway/server/execute.js');
const { execute, parseSseFramesForTest } = await import(pathToFileURL(adapterPath).href);
const hash = s => createHash('sha256').update(s).digest('hex');
const snapshot = () => Object.fromEntries(['config.yaml', 'memories/MEMORY.md', 'memories/USER.md', 'SOUL.md'].map(f => [f, hash(readFileSync(home + '/' + f))]));
const before = snapshot();
const input = 'Bounded read-only latency experiment. Do not use ANY tools, write files, save memory, access Paperclip or delegate. Use only this data. Orders: [{"item":"A","qty":3,"price":1200,"status":"done"},{"item":"B","qty":2,"price":2500,"status":"done"},{"item":"A","qty":1,"price":1200,"status":"cancelled"},{"item":"C","qty":4,"price":800,"status":"done"},{"item":"B","qty":1,"price":2500,"status":"done"},{"item":"A","qty":2,"price":1200,"status":"done"}]. Exclude cancelled orders. Compute total completed quantity and revenue per item, sorted A,B,C, and grand revenue. Reply ONLY as compact JSON: {"items":[{"item":"A","qty":0,"revenue":0},...],"grand_revenue":0}. No explanations.';
const instructions = 'This is an isolated no-tool read-only arithmetic experiment. Follow only the supplied task. Do not call tools, modify files or memories, or contact other agents. Return the requested JSON only.';
const base = 'http://127.0.0.1:8645/p/' + profile;
const expected = {items:[{item:'A',qty:5,revenue:6000},{item:'B',qty:3,revenue:7500},{item:'C',qty:4,revenue:3200}],grand_revenue:16700};
const payloadEffort = process.env.LATENCY_EFFORT ?? 'high';
if (!['high', 'max'].includes(payloadEffort)) throw new Error('Unsupported experiment effort');
const effort = payloadEffort;
const common = { input, instructions, model: 'claude-opus-5-5', provider: 'anthropic', model_options: { reasoning_effort: effort } };
writeFileSync(path.join(out,'manifest.json'), JSON.stringify({createdAt:new Date().toISOString(),profile,adapterSha256:hash(readFileSync(adapterPath)),payload:common,expected,before,scope:'Real installed adapter vs direct gateway; scheduler and chief excluded',ordering:['direct','adapter','adapter','direct','direct','adapter']},null,2));
const originalFetch = globalThis.fetch;
let sample;
globalThis.fetch = async (url, init) => {
  if (String(url).endsWith('/v1/runs') && init?.method === 'POST') {
    const body=JSON.parse(init.body); const {session_id,...stable}=body;
    sample.payloadHash=hash(JSON.stringify(Object.fromEntries(Object.entries(stable).sort())));
    if (JSON.stringify(stable)!==JSON.stringify(common)) throw new Error('Payload mismatch');
    sample.sessionId=session_id;
    sample.postAt=new Date().toISOString();
    const response=await originalFetch(url,init);
    sample.acceptedMs=performance.now()-sample.t0;
    const j=await response.clone().json(); sample.runId=j.run_id??j.id; sample.httpStatus=response.status;
    return response;
  }
  return originalFetch(url,init);
};
function event(d) {
  const ev=d.event??d.type;
  sample.eventCounts[ev]=(sample.eventCounts[ev]??0)+1;
  if(ev==='message.delta') {sample.firstOutputMs??=performance.now()-sample.t0;sample.answer+=d.delta??'';}
  if(ev==='tool.started') sample.invalidToolUse=true;
  if(['run.completed','run.failed','run.cancelled'].includes(ev)) {
    sample.terminalMs=performance.now()-sample.t0;
    sample.terminal={event:ev,model:d.model??null,usage:d.usage??null};
    if(typeof d.output==='string') sample.answer=d.output;
  }
}
async function direct(sessionId,requestId) {
  const headers={Authorization:'Bearer '+key,'Content-Type':'application/json','Idempotency-Key':requestId};
  const r=await fetch(base+'/v1/runs',{method:'POST',headers,body:JSON.stringify({...common,session_id:sessionId})});
  if(!r.ok) throw new Error('Gateway HTTP '+r.status);
  const resp=await fetch(base+'/v1/runs/'+sample.runId+'/events',{headers:{Authorization:'Bearer '+key}});
  if(!resp.ok)throw new Error('SSE HTTP '+resp.status);
  const reader=resp.body.getReader(), decoder=new TextDecoder();let buf='';
  while(true){const {value,done}=await reader.read(); if(done)break;buf+=decoder.decode(value,{stream:true});const parsed=parseSseFramesForTest(buf);buf=parsed.rest;for(const f of parsed.frames){try{event(JSON.parse(f.data));}catch{}}
    if(sample.terminal){await reader.cancel();break;}}
}
const order=['direct','adapter','adapter','direct','direct','adapter'].slice(0,Number(process.argv[3]??6));
for (let i=0;i<order.length;i++) {
  const mode=order[i], sessionId='latency-probe-'+randomUUID(), requestId=randomUUID();
  sample={index:i+1,mode,t0:performance.now(),startedAt:new Date().toISOString(),eventCounts:{},answer:''};
  console.log(JSON.stringify({phase:'dispatch',mode,index:i+1,sessionId,model:common.model,effort}));
  if(mode==='direct')await direct(sessionId,requestId);
  else {
    const result=await execute({runId:requestId,agent:{id:'dce6dcc3-db97-4e20-bfb5-dc8684660407',companyId:'db6f5310-0afc-4b67-8ca2-8059bd26f0cb',name:'Latency experiment'},context:{},runtime:{},config:{apiBaseUrl:base,apiKey:key,timeoutSec:0,sessionKeyStrategy:'none',payloadTemplate:{...common,session_id:sessionId}},onLog:async(_stream,line)=>{const k=line.indexOf(' data=');if(k>=0){try{event(JSON.parse(line.slice(k+6)));}catch{}}},onMeta:async()=>{}});
    sample.adapterExitCode=result.exitCode;sample.adapterModel=result.model??null;
    if(result.exitCode!==0)sample.adapterErrorCode=result.errorCode;
  }
  sample.wallMs=performance.now()-sample.t0; delete sample.t0;
  try{const x=JSON.parse(sample.answer.trim().replace(/^```(?:json)?\s*|\s*```$/g,''));sample.correct=JSON.stringify(x)===JSON.stringify(expected);}catch{sample.correct=false;}
  sample.after=snapshot();sample.filesUnchanged=JSON.stringify(before)===JSON.stringify(sample.after);
  appendFileSync(resultFile,JSON.stringify(sample)+'\n');
  console.log(JSON.stringify({phase:'completed',index:sample.index,mode,wallMs:Math.round(sample.wallMs),firstOutputMs:sample.firstOutputMs,correct:sample.correct,runId:sample.runId,filesUnchanged:sample.filesUnchanged,tools:sample.eventCounts['tool.started']??0}));
  if(!sample.correct||sample.invalidToolUse||!sample.filesUnchanged||sample.terminal?.event!=='run.completed')throw new Error('Invalid sample; stopping before further calls');
}
