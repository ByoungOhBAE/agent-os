"""Read-only AgentOS historical latency audit. Store allowlisted metadata, never raw logs or secrets."""
import argparse, collections, datetime as dt, hashlib, json, pathlib, re, urllib.request
BASE = 'http://127.0.0.1:3100/api'
COMPANY = 'db6f5310-0afc-4b67-8ca2-8059bd26f0cb'
def get(p):
    with urllib.request.urlopen(BASE+p, timeout=45) as r:
        return json.load(r)
def seconds(a,b):
    if not a or not b:return None
    return (dt.datetime.fromisoformat(b.replace('Z','+00:00'))-dt.datetime.fromisoformat(a.replace('Z','+00:00'))).total_seconds()
def pick(d,keys):return {k:d.get(k) for k in keys.split()}
def parse_log(content):
    rows=[]
    for line in content.splitlines():
        try:
            row=json.loads(line); chunk=row.get('chunk','')
            if ' data=' not in chunk:continue
            d=json.loads(chunk.split(' data=',1)[1])
            event=d.get('event') or d.get('type')
            if not event:continue
            out={'ts':row.get('ts'),'event':event}
            for k in ['timestamp','tool','duration']:
                if k in d:out[k]=d[k]
            if event.startswith('tool.'):
                out['error']=bool(d.get('error'))
                preview=str(d.get('preview',''))
                out['previewSha256']=hashlib.sha256(preview.encode()).hexdigest()
                # Coarse observations only, not claims of a command's semantic purpose.
                tags=[]
                for tag,pattern in [('memory-profile','memories|MEMORY\\.md|profiles/|profiles.py'),('credential-scan','leak.scan|secret|token|api.?key|envvals|/\\.env|redact'),('database-inspection','sqlite|state\\.db|from messages'),('report','report\\.md|final-comment|documents/report'),('verification','verify|검증|확인|기준'),('web','https?://|urlopen|fetch\\('),('hiring','hermes-bots.*hire|agent-hires|bot-hire'),('issue-api','PAPERCLIP_API|/issues/')]:
                    if re.search(pattern,preview,re.I):tags.append(tag)
                out['tags']=tags
            rows.append(out)
        except (ValueError,TypeError):pass
    return rows

def audit(outpath):
    issues=get('/companies/'+COMPANY+'/issues')
    selected=[i for i in issues if i['identifier'] in ['HER-6','HER-7','HER-8','HER-9','HER-11','HER-12','HER-17','HER-18','HER-20','HER-21']]
    result={'observedAt':dt.datetime.now(dt.timezone.utc).isoformat(),'issues':[],'runs':{}}
    for i in selected:
        iid=i['id']; row=pick(i,'id identifier title status parentId assigneeAgentId createdAt updatedAt completedAt')
        row['elapsedSeconds']=seconds(i['createdAt'],i.get('completedAt'))
        row['interactions']=[pick(x,'id kind status createdAt resolvedAt sourceRunId') for x in get('/issues/'+iid+'/interactions')]
        row['documents']=[pick(x,'key createdAt updatedAt latestRevisionNumber') for x in get('/issues/'+iid+'/documents')]
        detail=get('/issues/'+iid)
        for key in ['blockedByIssueIds','blockedByIssues','blockingIssues','blockedBy','blocks']:
            if key in detail:
                val=detail[key]
                row[key]=[pick(x,'id identifier title status') if isinstance(x,dict) else x for x in val] if isinstance(val,list) else None
        links=get('/issues/'+iid+'/runs');row['ownRunIds']=[]
        for link in links:
            if link['agentId']!=i['assigneeAgentId']:continue
            rid=link['runId']
            if rid not in result['runs']:
                r=get('/heartbeat-runs/'+rid);rr=pick(r,'id agentId status createdAt startedAt finishedAt errorCode invocationSource triggerDetail usageJson')
                rr['adapterType']=link.get('adapterType')
                context=r.get('contextSnapshot') or {}
                rr['taskId']=context.get('taskId') or context.get('issueId')
                rr['wakeReason']=context.get('wakeReason')
                rr['queueSeconds']=seconds(r['createdAt'],r['startedAt'])
                rr['elapsedSeconds']=seconds(r['startedAt'],r['finishedAt'])
                rr['gatewayRunId']=(r.get('resultJson') or {}).get('run_id')
                rr['logBytes']=r.get('logBytes')
                if r['status'] not in ['running','queued']:
                    log=get('/heartbeat-runs/'+rid+'/log?limitBytes=4000000')['content']
                    rr['receivedLogBytes']=len(log.encode());rr['logComplete']=rr['receivedLogBytes']==rr['logBytes']
                    events=parse_log(log);rr['events']=events
                    rr['toolTelemetryObserved']=any(e['event'].startswith('tool.') for e in events)
                    rr['eventCounts']=dict(collections.Counter(e['event'] for e in events))
                    rr['toolCounts']=dict(collections.Counter(e.get('tool') for e in events if e['event']=='tool.started'))
                    rr['toolDurationSumSeconds']=sum(float(e.get('duration') or 0) for e in events if e['event']=='tool.completed')
                    rr['tagCounts']=dict(collections.Counter(t for e in events if e['event']=='tool.started' for t in e.get('tags',[])))
                    rr['toolErrors']=sum(e.get('error',False) for e in events if e['event']=='tool.completed')
                else:
                    rr['lastOutputAt']=r.get('lastOutputAt');rr['currentToolName']=r.get('currentToolName')
                result['runs'][rid]=rr
            if result['runs'][rid]['taskId']==iid:row['ownRunIds'].append(rid)
        result['issues'].append(row)
    p=pathlib.Path(outpath);p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print('saved',p,'issues',len(result['issues']),'runs',len(result['runs']))
    for i in sorted(result['issues'],key=lambda x:int(x['identifier'].split('-')[1])):
        print(i['identifier'],i['status'],'elapsed_s',i['elapsedSeconds'])
        for rid in i['ownRunIds']:
            r=result['runs'][rid]
            print(' ',rid,r['status'],'queue_s',r['queueSeconds'],'run_s',r['elapsedSeconds'],'tools',r.get('toolCounts'),'tool_s',round(r.get('toolDurationSumSeconds',0),2),'errors',r.get('toolErrors'),'complete_log',r.get('logComplete'),'tags',r.get('tagCounts'))
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('out');a=p.parse_args();audit(a.out)
