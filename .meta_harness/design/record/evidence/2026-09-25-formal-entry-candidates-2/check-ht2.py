from pathlib import Path
import re,json,hashlib
p=Path('.meta_harness/design/spec/compositions/governance-center-entry-https-json/v2/examples.md');s=p.read_text();blocks=re.findall(r'```text\n(.*?)\n```',s,re.S);checks=[]
for i,b in enumerate(blocks):
 if not b.startswith('HTTP/1.1 '):continue
 data=b.replace('\\r\\n\n','\r\n').encode();head,body=data.split(b'\r\n\r\n',1);length=int(re.search(rb'Content-Length: ([0-9]+)',head)[1]);hexdata=bytes.fromhex(blocks[i+1]);assert data==hexdata;assert length==len(body)
 sha=hashlib.sha256(data).hexdigest();assert sha in s
 checks.append({'bytes':len(data),'bodyBytes':len(body),'sha256':sha})
assert len(checks)==7,checks
assert checks[0]['bytes']==133
print(json.dumps({'checks':checks,'passed':len(checks)},indent=2))
