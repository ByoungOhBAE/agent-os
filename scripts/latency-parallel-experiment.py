"""WSL: compare two independent profile runs sequentially and concurrently; no config edits."""
import concurrent.futures, datetime, json, pathlib, subprocess, sys, time, urllib.request
OUT=pathlib.Path(sys.argv[1]); SCRIPT=pathlib.Path(__file__).with_name('latency-adapter-experiment.mjs')
PROFILES=['pc-2e6cbe27','pc-7686fab2']; NODE='/home/tahar/.local/node24/bin/node'
OUT.mkdir(parents=True,exist_ok=True)
if (OUT/'parallel.json').exists():raise SystemExit('Refusing to repeat existing experiment')
with urllib.request.urlopen('http://127.0.0.1:3100/api/companies/db6f5310-0afc-4b67-8ca2-8059bd26f0cb/agents') as r:agents=json.load(r)
for p in PROFILES:
    a=next(a for a in agents if (a.get('adapterConfig') or {}).get('apiBaseUrl','').endswith('/p/'+p))
    if a['status']!='idle':raise SystemExit('Profile not idle: '+p)
def run(lane,p):
    start=time.time(); folder=OUT/(lane+'-'+p)
    r=subprocess.run([NODE,str(SCRIPT),str(folder),'1',p],capture_output=True,text=True)
    print(r.stdout,flush=True)
    if r.returncode:raise RuntimeError('Experiment failed '+lane+' '+p+' exit='+str(r.returncode))
    row=json.loads((folder/'samples.jsonl').read_text().splitlines()[0])
    return {'profile':p,'processStart':start,'processEnd':time.time(),'sample':row}
results=[]
# Each profile appears once in each mode per repetition; reverse mode order for second repetition.
for name,parallel in [('seq1',False),('par1',True),('par2',True),('seq2',False)]:
    t=time.perf_counter()
    if parallel:
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool: rows=list(pool.map(lambda p:run(name,p),PROFILES))
    else:rows=[run(name,p) for p in PROFILES]
    result={'name':name,'parallel':parallel,'batchWallSeconds':time.perf_counter()-t,'runs':rows}
    results.append(result)
    (OUT/'parallel.json').write_text(json.dumps(results,indent=2))
    print('BATCH',name,round(result['batchWallSeconds'],3),flush=True)
