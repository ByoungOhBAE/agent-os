import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const own = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(own, '../..');
const evidence = path.join(own, 'evidence');
fs.mkdirSync(evidence, { recursive: true });
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const files = execFileSync('git', ['--no-optional-locks', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
const baseline = {};
for (const f of new Set(files)) {
  if (f.startsWith('plugins/agentos-youtube/') || f.startsWith('.unlazy/') || /(^|\/)(\.env(?:\..*)?|auth\.json|credentials[^/]*|secrets[^/]*)$/i.test(f)) continue;
  const full = path.join(root, f);
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) continue;
  baseline[f] = sha(fs.readFileSync(full));
}
const baselineFile = path.join(evidence, 'baseline.local.json');
fs.writeFileSync(baselineFile, JSON.stringify({ at: new Date().toISOString(), head: execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding:'utf8'}).trim(), files: baseline }, null, 2), {flag:'wx'});
async function get(port, endpoint) {
  const r = await fetch(`http://127.0.0.1:${port}${endpoint}`, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) return {http:r.status};
  return r.json();
}
const health = await get(3100, '/api/health');
const companies = await get(3100, '/api/companies');
if (!Array.isArray(companies) || companies.length !== 1) throw new Error('Expected a uniquely identified company; stop and inspect');
const company = companies[0];
const agents = await get(3100, `/api/companies/${company.id}/agents`);
if (!Array.isArray(agents)) throw new Error('Agent list unavailable');
const rows = agents.map(a => ({id:a.id,name:a.name,title:a.title,status:a.status,adapterType:a.adapterType,profile:String(a.adapterConfig?.apiBaseUrl??'').match(/\/p\/([\w-]+)/)?.[1]??null,model:a.adapterConfig?.model??null}));
const chief = rows.find(a => a.title === '비서실장' && a.status !== 'terminated');
if (!chief) throw new Error('Chief not found');
const bundle = await get(3100, `/api/agents/${chief.id}/instructions-bundle/file?path=AGENTS.md`);
const content = typeof bundle.content === 'string' ? bundle.content : '';
const skills = await get(3100, `/api/agents/${chief.id}/skills`);
const plugins = await get(3100, '/api/plugins');
const safe = {at:new Date().toISOString(),company:{id:company.id,name:company.name},health:{status:health.status,deploymentMode:health.deploymentMode},agents:rows,chief:{id:chief.id,hermesDefault:content.includes('기억을 가진 Hermes 봇'),hireCommand:content.includes('hermes-bots.mjs'),findSkillsMention:content.includes('find-skills'),instructionsDigest:sha(content),skills:Array.isArray(skills.entries)?skills.entries.map(s=>({key:s.key,desired:s.desired})):[]},plugins:Array.isArray(plugins)?plugins.map(p=>({id:p.id,pluginId:p.pluginId,status:p.status,version:p.version})):Object.keys(plugins)};
fs.writeFileSync(path.join(evidence,'current-state.json'), JSON.stringify(safe,null,2));
console.log(JSON.stringify(safe,null,2));
console.log(`BASELINE_RECORDED ${Object.keys(baseline).length} files`);
