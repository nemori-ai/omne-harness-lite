import json,copy
from pathlib import Path
D=Path('.meta_harness/design');R=D/'registry'
def load(n):return json.loads((R/n).read_text())
def save(n,x):(R/n).write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
c=load('catalog.json');key=next(k for k,v in c.items() if isinstance(v,list));entries=c[key]
for cid,oldv,newv,path in [('data.model-response',8,9,'spec/data/model-response'),('capability.model-request-runtime',9,10,'spec/capabilities/model-request-runtime')]:
 old=next(x for x in entries if x['coordinate']['contract_id']==cid and x['coordinate']['version']==oldv);new=copy.deepcopy(old);new['coordinate']['version']=newv;new['status']='candidate';new['acceptance']=None;new['contract_path']=f'{path}/v{newv}/contract.md';new['resources']=sorted(str(p.relative_to(D)) for p in (D/path/f'v{newv}').rglob('*') if p.is_file());
 for dep in new['dependencies']:
  dc=dep['coordinate']['contract_id']
  if cid=='capability.model-request-runtime' and dc=='data.model-response':dep['coordinate']['version']=9;dep['clauses']=sorted(set(dep['clauses']+[f'S-{i}' for i in range(41,46)]),key=lambda x:int(x[2:]))
  if dc=='data.call-accounts':dep['clauses']=sorted(set(dep['clauses']+['S-6','S-7']),key=lambda x:int(x[2:]))
  if cid=='capability.model-request-runtime' and dc=='data.messages':dep['clauses']=sorted(set(dep['clauses']+['S-27','S-28','S-29']),key=lambda x:int(x[2:]))
 existing=next((i for i,x in enumerate(entries) if x['coordinate']==new['coordinate']),None)
 if existing is None:entries.append(new)
 else:entries[existing]=new
save('catalog.json',c)
c=load('covers.json')
for cid,ov,nv in [('data.model-response',8,9),('capability.model-request-runtime',9,10)]:
 c['covers']=[x for x in c['covers'] if not(x['target']['contract_id']==cid and x['target']['version']==nv)]
 old=[x for x in c['covers'] if x['target']['contract_id']==cid and x['target']['version']==ov]
 for x in old:
  x=copy.deepcopy(x);x['target']['version']=nv;x['reviewed']=False;x['note']='2026-09-29 U1 candidate：前驱未变承诺继承；本次覆盖待独立复核，不表示接受或实现。';c['covers'].append(x)
 # New user direction is recorded in proposal, not invented as a product clause.
 c['covers'].append({'requirement':{'topic':'PF-010-context-management-and-assembly','clause':'design.md#610-压缩只能做两件事且落成同一条消息'},'target':{'contract_id':cid,'version':nv,'clauses':['S-45'] if cid.startswith('data.') else ['S-77','S-81']},'reviewed':False,'note':'候选：日志只增不改和 compaction 导致投影失效；依据 PF-010 rev6 §6.10；这条不声称实现 compaction。'})
save('covers.json',c)
f=load('formal-tasks.json');f['tasks']=[x for x in f['tasks'] if not x['id'].startswith('model-request-runtime-v10-usage-')]
for name in ['ExactOrBound','UpperBound','Estimated','Progress','ThreeCalls']:
 pref='spec/capabilities/model-request-runtime/v10/formal/';tid='model-request-runtime-v10-usage-'+name.lower();f['tasks'].append({'id':tid,'kind':'tla','artifacts':[pref+'UsageCalibration.tla',pref+'UsageCalibration_'+name+'.cfg'],'command':['${JAVA_BIN}','-Xmx768m','-cp','${TLA2TOOLS_JAR}','tlc2.TLC','-metadir','tmp/tlc/'+tid,'-cleanup','-noGenerateSpecTE','-workers','1','-config',pref+'UsageCalibration_'+name+'.cfg',pref+'UsageCalibration.tla'],'timeout_seconds':240})
save('formal-tasks.json',f)
