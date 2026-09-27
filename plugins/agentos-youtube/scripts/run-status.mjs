import {readFileSync} from 'node:fs';
const receipt=JSON.parse(readFileSync(new URL('../evidence/chief-request.json',import.meta.url),'utf8'));
const base=`http://127.0.0.1:3100/api/heartbeat-runs/${receipt.wake.runId}`;
const [run,log]=await Promise.all([fetch(base),fetch(base+'/log')].map(async p=>(await p).json()));
const events=[];
for(const line of String(log.content??'').split('\n').filter(Boolean)){
  let x;try{x=JSON.parse(line);}catch{continue;}
  const index=String(x.chunk??'').indexOf(' data=');if(index<0)continue;
  let d;try{d=JSON.parse(x.chunk.slice(index+6));}catch{continue;}
  if(!d.event?.startsWith('tool.'))continue;
  const raw=typeof d.preview==='string'?d.preview:JSON.stringify(d.preview??'');
  const preview=raw.split('\n').filter(s=>!/(?:api[_-]?key|authorization|bearer|password|secret|token|sk-|ghp_|github_pat_|oauth)/i.test(s)).join('\n').slice(0,900);
  events.push({at:x.ts,event:d.event,tool:d.tool,error:d.error,preview});
}
console.log(JSON.stringify({status:run.status,startedAt:run.startedAt,lastOutputAt:run.lastOutputAt,error:run.error,toolEvents:events.length,recentTools:events.slice(-12)},null,2));
