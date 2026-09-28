"""Verify collected experiments against Hermes session metadata; emit public-safe evidence summary."""
import argparse, datetime as dt, json, pathlib, sqlite3, statistics
from typing import Any

def sec(a,b):return (dt.datetime.fromisoformat(b.replace('Z','+00:00'))-dt.datetime.fromisoformat(a.replace('Z','+00:00'))).total_seconds()
def runtime(home,profile,sid):
    with sqlite3.connect((pathlib.Path(home)/'profiles'/profile/'state.db').as_uri()+'?mode=ro',uri=True) as c:
        c.row_factory=sqlite3.Row
        r=c.execute('SELECT id, model, billing_provider, billing_mode, api_call_count, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, tool_call_count FROM sessions WHERE id=?',(sid,)).fetchone()
        if r is None:raise AssertionError('Missing runtime session '+sid)
        return dict(r)
def verify(row,home,profile):
    assert row['correct'] and row['filesUnchanged']
    assert not row.get('invalidToolUse') and row['eventCounts'].get('tool.started',0)==0
    assert row['terminal']['event']=='run.completed'
    r=runtime(home,profile,row['sessionId'])
    assert r['model']=='claude-opus-5-5' and r['api_call_count']==1 and r['tool_call_count']==0
    return {**{k:row.get(k) for k in ['index','mode','startedAt','postAt','runId','sessionId','payloadHash','wallMs','acceptedMs','firstOutputMs','correct','filesUnchanged']},'runtime':r}
def main(args):
    out: dict[str, Any] = {'model':'claude-opus-5-5','reasoningEffortRequested':'high','actualProviderEffort':'not independently exposed','billing':'provider session reports anthropic; billing_mode is null, not a charge confirmation'}
    primary=pathlib.Path(args.primary);manifest=json.loads((primary/'manifest.json').read_text())
    samples=[json.loads(x) for x in (primary/'samples.jsonl').read_text().splitlines()]
    assert len(samples)==6 and len({x['payloadHash'] for x in samples})==1
    out['adapterExperiment']={'scope':manifest['scope'],'adapterSha256':manifest['adapterSha256'],'samples':[verify(s,args.home,manifest['profile']) for s in samples]}
    stats={}
    for mode in ['direct','adapter']:
        allrows=[x for x in out['adapterExperiment']['samples'] if x['mode']==mode]
        warm=[x for x in allrows if x['runtime']['cache_read_tokens']>0]
        stats[mode]={'count':len(allrows),'minSeconds':min(x['wallMs'] for x in allrows)/1000,'maxSeconds':max(x['wallMs'] for x in allrows)/1000,'warmCount':len(warm),'warmMedianSeconds':statistics.median(x['wallMs'] for x in warm)/1000}
    out['adapterExperiment']['stats']=stats
    batches=json.loads((pathlib.Path(args.parallel)/'parallel.json').read_text())
    assert len(batches)==4
    out['parallelExperiment']={'scope':'Two real Hermes profiles through gateway, without Paperclip scheduler/chief','batches':[]}
    for b in batches:
        runs=[verify(r['sample'],args.home,r['profile']) for r in b['runs']]
        starts=[dt.datetime.fromisoformat(r['postAt'].replace('Z','+00:00')).timestamp() for r in runs]
        ends=[dt.datetime.fromisoformat(r['startedAt'].replace('Z','+00:00')).timestamp()+r['wallMs']/1000 for r in runs]
        overlap=max(0,min(ends)-max(starts))
        assert overlap>0 if b['parallel'] else overlap==0
        out['parallelExperiment']['batches'].append({'name':b['name'],'parallel':b['parallel'],'batchWallSeconds':b['batchWallSeconds'],'requestIntervalOverlapSeconds':overlap,'samples':runs})
    history=json.loads((primary/'history.json').read_text(encoding='utf-8'));I={i['identifier']:i for i in history['issues']}
    parent,child=I['HER-11'],I['HER-12'];approval=next(x for x in parent['interactions'] if x['status']=='accepted')
    phases={'requestToApprovalCard':sec(parent['createdAt'],approval['createdAt']),'humanApprovalWait':sec(approval['createdAt'],approval['resolvedAt']),'approvedToChildCreated':sec(approval['resolvedAt'],child['createdAt']),'childCreatedToDone':sec(child['createdAt'],child['completedAt']),'childDoneToParentDone':sec(child['completedAt'],parent['completedAt'])}
    assert abs(sum(phases.values())-parent['elapsedSeconds'])<0.001
    runs=history['runs'];queues=[r['queueSeconds'] for r in runs.values()]
    stripped={rid:{k:v for k,v in r.items() if k not in ['events','usageJson']} for rid,r in runs.items()}
    out['historical']={'observedAt':history['observedAt'],'issues':history['issues'],'runs':stripped,'queueStartSecondsRange':[min(queues),max(queues)],'blogPhasesSeconds':phases,'blogTotalSeconds':parent['elapsedSeconds'],'caveat':'Blog request explicitly included new-bot creation and memory verification; not a pure title-writing benchmark. Tool duration sum may overlap; non-tool wall time is NOT proven model computation.'}
    p=pathlib.Path(args.output);p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('VERIFIED 14/14 samples; exact primary payload hash; runtime model; correct outputs; 0 tools; unchanged config/memory; 2 parallel overlaps; historical phase sum.')
    print(json.dumps({'adapter':stats,'parallel':[{k:b[k] for k in ['name','batchWallSeconds','requestIntervalOverlapSeconds']} for b in out['parallelExperiment']['batches']],'blog':phases},indent=2))
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('primary');p.add_argument('parallel');p.add_argument('home');p.add_argument('output');main(p.parse_args())
