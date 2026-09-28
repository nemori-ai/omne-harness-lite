from pathlib import Path
import concurrent.futures, copy, hashlib, json, re, subprocess
from jsonschema import Draft202012Validator
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT202012
HUB=Path('/data/qiwei/repos/omne-harness-lite/.worktrees/model-request-runtime')
ROOT=HUB/'.meta_harness/design'
OUT=Path(__file__).resolve().parent
FORMAL=ROOT/'spec/capabilities/model-request-runtime/v9/formal'
JAR=Path('/data/qiwei/repos/omne-harness-lite/tmp/formal-toolchain/tla2tools.jar')
def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def dump(path,value): path.write_text(json.dumps(value,indent=2,ensure_ascii=False)+'\n')
resources=[]
for p in (ROOT/'spec').rglob('*.schema.json'):
 s=json.loads(p.read_text())
 if '$id' in s: resources.append((s['$id'],Resource.from_contents(s,default_specification=DRAFT202012)))
registry=Registry().with_resources(resources)
schema_path=ROOT/'spec/data/model-response/v8/model-response.schema.json'
schema=json.loads(schema_path.read_text()); Draft202012Validator.check_schema(schema)
root=Draft202012Validator(schema,registry=registry)
pending=Draft202012Validator({'$ref':schema['$id']+'#/$defs/PendingModelResponse'},registry=registry)
examples_path=ROOT/'spec/data/model-response/v8/examples.md';examples=examples_path.read_text()
records=[]
for m in re.finditer(r'### ([^\n]+)\n([\s\S]*?)(?=\n### |\n## |\Z)',examples.split('## v8 实际发送时刻不可用',1)[1]):
 block=re.search(r'```json\s*([\s\S]*?)```',m[2])
 if not block: continue
 value=json.loads(block[1]); expected='预期：`通过`' in m[2]
 errors=list(root.iter_errors(value)); actual=not errors
 records.append({'name':m[1],'expected':expected,'actual':actual,'matched':actual==expected,'errors':[e.message for e in errors]})
 assert actual==expected,records[-1]
blocks=[json.loads(m) for m in re.findall(r'```json\s*([\s\S]*?)```',examples[:examples.index('## 二、')])]
base=next(v for v in blocks if v.get('outcome')=='complete' and root.is_valid(v))
value=copy.deepcopy(base);value.pop('replyDisposition',None);value.pop('late',None)
for name, validator, candidate, expected in [('pending actual',pending,value,True),('pending null',pending,{**value,'timing':{**value['timing'],'sentAt':None}},False)]:
 actual=validator.is_valid(candidate); records.append({'name':name,'expected':expected,'actual':actual,'matched':actual==expected});assert actual==expected,name
for outcome in ['failed','truncated']:
 source=next(v for v in blocks if v.get('outcome')==outcome and root.is_valid(v))
 value=copy.deepcopy(source);value['timing']['sentAt']=None
 actual=root.is_valid(value);records.append({'name':outcome+' null','expected':False,'actual':actual,'matched':not actual});assert not actual,outcome
for value,name in [(copy.deepcopy(base),'missing sentAt'),(copy.deepcopy(base),'null Timing')]:
 if name=='missing sentAt': del value['timing']['sentAt']
 else: value['timing']=None
 actual=root.is_valid(value);records.append({'name':name,'expected':False,'actual':actual,'matched':not actual});assert not actual,name
dump(OUT/'schema-results.json',{'schema_sha256':sha(schema_path),'examples_sha256':sha(examples_path),'cases':records,'scope':'New MR8 timing shape and Pending boundary only; no semantic truth or pure-validation error precedence assertion'})
def run(item):
 name,cfg,expect=item;folder=OUT/name;folder.mkdir(exist_ok=True)
 args=['java','-Xmx256m','-cp',str(JAR),'tlc2.TLC','-workers','1','-metadir',str(folder/'states'),'-config',str(cfg),str(FORMAL/'RecoveryTiming.tla')]
 p=subprocess.run(args,cwd=folder,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,timeout=60)
 (folder/'stdout.log').write_text(p.stdout);(folder/'stderr.log').write_text(p.stderr)
 violated=re.findall(r'Invariant (\w+) is violated\.',p.stdout+p.stderr)
 passed=(p.returncode==0 and 'Model checking completed. No error has been found.' in p.stdout) if expect is None else (p.returncode==12 and violated==[expect] and 'State 2:' in p.stdout)
 result={'name':name,'argv':args,'returncode':p.returncode,'expected_violation':expect,'actual_violations':violated,'matched':passed,'model_sha256':sha(FORMAL/'RecoveryTiming.tla'),'config_sha256':sha(cfg),'jar_sha256':sha(JAR)}
 dump(folder/'result.json',result);return result
jobs=[('positive',FORMAL/'RecoveryTiming.cfg',None)]
for name,expect in [('SynthesizeTime','TruthfulSentAt'),('DropKnown','TruthfulSentAt'),('NullGrantsRetry','NoRetryFromNull'),('RecoverySends','RecoveryHasNoSend')]:
 jobs.append((name,FORMAL/'validity-check'/('RecoveryTiming_'+name+'.cfg'),expect))
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool: results=list(pool.map(run,jobs))
dump(OUT/'formal-results.json',{'runs':results,'scope':'One call, bounded anchor/send/stop model; stopped work and authoritative prefix are assumptions; no IO or full runtime proof'})
print(json.dumps({'schema_cases':len(records),'formal_runs':len(results),'matched':all(r['matched'] for r in results)}))
assert all(r['matched'] for r in results),results
