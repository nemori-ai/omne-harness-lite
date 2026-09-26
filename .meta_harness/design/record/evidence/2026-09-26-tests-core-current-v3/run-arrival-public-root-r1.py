from pathlib import Path
import datetime,hashlib,json,re,subprocess
hub=Path('/data/qiwei/repos/omne-harness-lite/.worktrees/core-delivery')
consumer=hub/'tmp/w3-arrival-v3-equivalence/epoch3-eabfff0f/consumer'
link=consumer/'node_modules';assert not link.exists();link.symlink_to(hub/'tools/core-verification/node_modules',target_is_directory=True)
receipt={'source':subprocess.check_output(['git','rev-parse','HEAD'],cwd=hub,text=True).strip(),'input_SHA256':{str(p.relative_to(consumer)):hashlib.sha256(p.read_bytes()).hexdigest() for p in consumer.rglob('*') if p.is_file() and 'node_modules' not in p.relative_to(consumer).parts},'runs':[]}
original=json.loads((hub/'tmp/w3-arrival-v3-equivalence/epoch3-eabfff0f/negative-types.json').read_text())
commands=[('runtime',['node',str(consumer/'runtime.mjs')],0),('positive',['pnpm','--filter','@omne-harness-lite/core-verification','exec','tsc','-p',str(consumer/'tsconfig.json')],0)]+[(x['name'],['pnpm','--filter','@omne-harness-lite/core-verification','exec','tsc','-p',str(consumer/('tsconfig-negative-'+x['name']+'.json'))],1) for x in original]
for name,argv,expect in commands:
 start=datetime.datetime.now(datetime.timezone.utc).isoformat();p=subprocess.run(argv,cwd=hub,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT);end=datetime.datetime.now(datetime.timezone.utc).isoformat()
 log=hub/'tmp/core-delivery'/('AR2-HUB-public-'+name+'.log');log.write_text(p.stdout)
 rec={'name':name,'argv':argv,'start_utc':start,'end_utc':end,'exit':p.returncode,'log':str(log.relative_to(hub)),'log_sha256':hashlib.sha256(log.read_bytes()).hexdigest()}
 assert p.returncode==expect,(name,p.returncode,p.stdout)
 if expect:
  actual=re.findall(r'negative/[^\n:]+\((\d+),(\d+)\): error TS(\d+):',p.stdout)
  sample=next(x for x in original if x['name']==name)
  declared=[re.search(r'\((\d+),(\d+)\): error TS(\d+):',x).groups() for x in sample['diagnostics']]
  assert actual==declared,(name,actual,declared)
  assert len(re.findall(r'error TS\d+',p.stdout))==len(declared)
  rec['exact_expected_diagnostics']=actual
 else:
  assert 'error TS' not in p.stdout
 receipt['runs'].append(rec)
(hub/'tmp/core-delivery/AR2-HUB-public-complete.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n')
print('AR retained2 public runtime/strict positive/five precise negative files passed,17 exact diagnostic matches')
