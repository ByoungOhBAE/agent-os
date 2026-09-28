// Remove the per-run wall-clock limit of every hermes_gateway bot: adapterConfig.timeoutSec = 0 (0 = no timer;
// a missing key falls back to the adapter default of 600 s, so the key is kept and set to 0).
// Same PATCH shape as scripts/verify-org-configure.mjs ({...before.adapterConfig, timeoutSec}); apiKey stays a secret ref.
// Usage: node.exe plugins/agentos-youtube/scripts/set-run-timeout.mjs [--apply]   (default: dry run)
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const own=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const TARGET=0;
const B='http://127.0.0.1:3100/api';
const company=JSON.parse(fs.readFileSync(path.join(own,'evidence/current-state.json'),'utf8')).company.id;
const apply=process.argv.includes('--apply');
const agents=await (await fetch(`${B}/companies/${company}/agents`)).json();
const rows=[];
for(const a of agents.filter(x=>x.adapterType==='hermes_gateway')){
  const before=a.adapterConfig?.timeoutSec;
  if(before===TARGET){rows.push({name:a.name,before,after:before,changed:false});continue;}
  if(!apply){rows.push({name:a.name,before,after:TARGET,changed:'dry-run'});continue;}
  const r=await fetch(`${B}/agents/${a.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({adapterConfig:{...a.adapterConfig,timeoutSec:TARGET}})});
  if(!r.ok)throw new Error(`${a.name}: HTTP ${r.status} ${(await r.text()).slice(0,300)}`);
  const after=(await (await fetch(`${B}/agents/${a.id}`)).json()).adapterConfig;
  if(after.timeoutSec!==TARGET)throw new Error(`${a.name}: readback ${after.timeoutSec}`);
  for(const k of Object.keys(a.adapterConfig))if(k!=='timeoutSec'&&JSON.stringify(after[k])!==JSON.stringify(a.adapterConfig[k]))throw new Error(`${a.name}: ${k} changed`);
  rows.push({name:a.name,before,after:after.timeoutSec,changed:true});
}
console.table(rows);
if(apply&&rows.every(r=>r.after===TARGET))console.log(`RUN_TIMEOUT_OK ${rows.length} bots = no limit`);
