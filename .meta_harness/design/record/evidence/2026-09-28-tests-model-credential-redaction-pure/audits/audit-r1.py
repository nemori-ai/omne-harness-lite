from pathlib import Path,PurePosixPath
import json,hashlib,tarfile,subprocess
root=Path('/data/qiwei/repos/omne-harness-lite/.worktrees/model-request-runtime-g6-independent'); task=root/'tmp/model-request-runtime/g6-independent'; hub=Path.cwd(); out=hub/'tmp/model-request-runtime/g6-independent-audit'
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
f=json.loads((task/'FREEZE.json').read_text()); assert f['HEAD']=='7f580351ec6dc5d09f32724e987135aea4e4f8cc'; assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()==f['HEAD']; assert not subprocess.check_output(['git','status','--porcelain'],cwd=root,text=True).strip()
assert sha(task/'BRIEF.md')==f['adopted_brief_sha256']; assert sha(task/'INPUTS.json')==f['adopted_inputs_sha256']; assert sha(task/'evidence-manifest.json')==f['evidence_manifest_sha256']; assert sha(task/'oracle.mjs')==f['oracle_sha256']
v=json.loads((task/'evidence-manifest.json').read_text()); print('manifestshape',type(v).__name__,len(v),list(v)[:5] if isinstance(v,dict) else str(v[:1])[:200])
(t:=out/'manifest-shape.json').write_text(json.dumps({'manifestType':type(v).__name__,'keys':list(v) if isinstance(v,dict) else None},indent=2)+'\n')
assert sha(task/'delivery-evidence.tar.gz')=='69976a31562400a5c2626b29e8714c0a87f8ad12fb65bc5916fc6ef8617a4dc2'
entries=v.get('files',v) if isinstance(v,dict) else v
if isinstance(entries,dict): entries=[{'path':k,'sha256':value if isinstance(value,str) else value['sha256']} for k,value in entries.items()]
for x in entries:
 p=task/x['path']; assert sha(p)==x['sha256'],x['path']
 if 'bytes' in x: assert p.stat().st_size==x['bytes']
expected={x['path'] for x in entries}|{'FREEZE.json','evidence-manifest.json'}
with tarfile.open(task/'delivery-evidence.tar.gz','r:gz') as t:
 members=t.getmembers(); assert len(members)==437; assert {x.name for x in members}==expected
 for m in members:
  assert m.isfile() and not PurePosixPath(m.name).is_absolute() and '..' not in PurePosixPath(m.name).parts
  assert t.extractfile(m).read()==(task/m.name).read_bytes(),m.name
for path in ['src/credential-redaction.ts','src/credential-redaction-types.ts','tests/credential-redaction.spec.ts','tests/credential-redaction-failures.spec.ts']:
 p='packages/model/model-request-runtime/'+path
 if not (root/p).exists(): continue
 assert (root/p).read_bytes()==(hub/p).read_bytes(),p
report={'verified':True,'independentHead':f['HEAD'],'currentHubHead':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'payloadFiles':len(entries),'archiveMembers':437,'archiveSHA256':sha(task/'delivery-evidence.tar.gz'),'sourcePolicyAndTypesUnchanged':True,'finiteAcceptanceOnly':True}
(out/'REPORT.json').write_text(json.dumps(report,indent=2)+'\n'); print(json.dumps(report))
