from pathlib import Path
import subprocess,json,time,hashlib
w=Path.cwd();f=w/'.meta_harness/design/spec/capabilities/model-request-runtime/v10/formal';out=w/'tmp/usage-calibration-spec/formal';out.mkdir(parents=True,exist_ok=True)
files=sorted(f.glob('UsageCalibration_*.cfg'))+sorted((f/'validity-check').glob('UsageCalibration_*.cfg'))
results=[]
for cfg in files:
 name=cfg.stem;negative=cfg.parent.name=='validity-check';log=out/(name+'.log');start=time.time()
 cmd=['java','-Xmx768m','-cp','/opt/tlaplus/tla2tools.jar','tlc2.TLC','-cleanup','-noGenerateSpecTE','-workers','1','-metadir',str(out/(name+'-states')),'-config',str(cfg),str(f/'UsageCalibration.tla')]
 with log.open('w') as fh:
  try:r=subprocess.run(cmd,stdout=fh,stderr=subprocess.STDOUT,timeout=180);code=r.returncode
  except subprocess.TimeoutExpired:code='timeout'
 text=log.read_text();expected=next((x.split()[-1] for x in cfg.read_text().splitlines() if x.startswith('INVARIANT ')),None)
 ok=(code!=0 and f'Invariant {expected} is violated.' in text) if negative else (code==0 and 'No error has been found.' in text)
 row={'configuration':str(cfg.relative_to(w)), 'negative':negative,'expectedInvariant':expected,'exit':code,'expectedResultObserved':ok,'seconds':round(time.time()-start,3),'command':cmd,'log':str(log.relative_to(w)),'configSha256':hashlib.sha256(cfg.read_bytes()).hexdigest()}
 results.append(row);(out/'results.json').write_text(json.dumps(results,indent=2)+'\n');print(name,code,ok,flush=True)
