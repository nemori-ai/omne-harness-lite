from pathlib import Path
import subprocess,json
p=Path(__file__).resolve().parent
base=['docker','run','--rm','--network','none','--entrypoint','java','--mount',f'type=bind,source={p},target=/model','--workdir','/model','sha256:e091a9e923255f077d7103ca424cc29c79c701c82df53ccd894d9ad555758750','-XX:+UseParallelGC','-cp','tla2tools.jar','tlc2.TLC','-workers','1','-metadir','/tmp/tlc','-noGenerateSpecTE']
results=[]
for cfg,model,want in [('valid','LoginLifetime',0),('bad-admission','LoginLifetime',12),('revision-valid','CredentialRevision',0),('revision-bad','CredentialRevision',12)]:
 cmd=base+['-config',cfg+'.cfg',model+'.tla'];r=subprocess.run(cmd,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=60)
 (p/(cfg+'.log')).write_bytes(r.stdout);results.append({'config':cfg,'model':model,'exit':r.returncode,'expected_exit':want,'command':cmd});print(cfg,r.returncode,flush=True)
(p/'results.json').write_text(json.dumps(results,indent=2)+'\n')
assert all(x['exit']==x['expected_exit'] for x in results),results
