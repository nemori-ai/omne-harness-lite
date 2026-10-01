from pathlib import Path
import subprocess,hashlib,json,shutil,datetime
root=Path.cwd();src=root/'.meta_harness/design/spec/capabilities/model-request-runtime/v12/formal';out=root/'tmp/ack-spec-draft/formal-run-03';out.mkdir(exist_ok=False)
files=[src/'AckLifecycle.tla',src/'AckLifecycle.cfg',src/'AckProgress.cfg',*sorted((src/'validity-check').glob('Ack-*.cfg'))]
for p in files:
 q=out/'inputs'/p.relative_to(src);q.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,q)
(out/'input-sha256.json').write_text(json.dumps({str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in files},indent=2)+'\n')
jar=Path('/opt/tlaplus/tla2tools.jar');(out/'toolchain.json').write_text(json.dumps({'java':subprocess.run(['java','-version'],capture_output=True,text=True).stderr,'jar':str(jar),'jar_sha256':hashlib.sha256(jar.read_bytes()).hexdigest()},indent=2)+'\n')
results=[]
for cfg in files[1:]:
 cmd=['java','-XX:+UseParallelGC','-Xmx1000m','-cp',str(jar),'tlc2.TLC','-workers','1','-cleanup','-noGenerateSpecTE','-metadir',str(out/('states-'+cfg.stem)),'-config',str(out/'inputs'/cfg.relative_to(src)),str(out/'inputs/AckLifecycle.tla')]
 with (out/(cfg.stem+'.log')).open('w') as f:
  r=subprocess.run(cmd,stdout=f,stderr=subprocess.STDOUT,timeout=240)
 results.append({'config':str(cfg.relative_to(root)),'command':cmd,'exit_code':r.returncode});(out/'results.json').write_text(json.dumps(results,indent=2)+'\n');print(cfg.name,r.returncode,flush=True)
