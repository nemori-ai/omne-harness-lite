from pathlib import Path
import subprocess,json
p=Path(__file__).resolve().parent
base=['docker','run','--rm','--network','none','--entrypoint','java','--mount',f'type=bind,source={p},target=/model','--workdir','/model','sha256:f379f3a12f81844d554a11a3bdfc532aab0efdd4f3d49966f4d22bcdf49ccc9b','-XX:+UseParallelGC','-cp','tla2tools.jar','tlc2.TLC','-workers','1','-metadir','/tmp/tlc']
results=[]
for cfg,model,want in [('EntryDecision', 'EntryDecision', 0), ('Validity_Reachability', 'EntryDecision', 12), ('Validity_authBeforeEnvelope', 'EntryDecision', 12), ('Validity_defectAsResult', 'EntryDecision', 12), ('Validity_deriveBeforePayload', 'EntryDecision', 12), ('Validity_gateUnavailableAsDenied', 'EntryDecision', 12), ('Validity_inputBeforeAuth', 'EntryDecision', 12), ('Validity_passthroughStateNotValid', 'EntryDecision', 12), ('Validity_readPresentationBeforeVersion', 'EntryDecision', 12), ('Validity_unavailableAsRejected', 'EntryDecision', 12)]:
 cmd=base+['-config',cfg+'.cfg',model+'.tla'];r=subprocess.run(cmd,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=60)
 (p/(cfg+'.log')).write_bytes(r.stdout);results.append({'config':cfg,'model':model,'exit':r.returncode,'expected_exit':want,'command':cmd});print(cfg,r.returncode,flush=True)
(p/'results.json').write_text(json.dumps(results,indent=2)+'\n')
assert all(x['exit']==x['expected_exit'] for x in results),results
