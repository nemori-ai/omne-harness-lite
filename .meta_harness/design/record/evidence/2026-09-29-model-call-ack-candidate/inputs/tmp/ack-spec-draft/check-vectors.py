from pathlib import Path
import json,hashlib,copy
p=Path('.meta_harness/design/spec/data/messages/v8/semantic-digest-vectors.json');out=Path('tmp/ack-spec-draft/digest-run-01');out.mkdir(exist_ok=False);shutil=None
(out/'input-sha256.json').write_text(json.dumps({str(p):hashlib.sha256(p.read_bytes()).hexdigest()},indent=2)+'\n')
x=json.loads(p.read_text());v={a['name']:a for a in x['vectors']}
# Independent fixed expectations, no parser/normalizer from vector-generation code.
s=lambda *n:['s',list(n)];d=lambda c,e='0':['d','+',c,e]
obj=['o',[[s(97),d('1')],[s(98),d('2')]]]
expected={'object-order-a':obj,'object-order-b':obj,'array-a':['a',[d('1'),d('2')]],'array-b':['a',[d('2'),d('1')]],'missing':['o',[]],'null':['o',[[s(97),['z']]]],'escape':s(97),'literal':s(97),'composed':s(233),'decomposed':s(101,769),'large-a':d('9007199254740992'),'large-b':d('9007199254740993'),'huge-exponent':d('1','100000000000000000000'),'huge-equivalent':d('1','100000000000000000000'),'negative-zero':d('0'),'zero':d('0'),'role-isolation':obj,'astral-order':['o',[[s(55357,56832),d('1')],[s(57344),d('2')]]]}
for name,n in [('source-version-a',49),('source-version-b',50)]:expected[name]=['o',[[s(115,111,117,114,99,101,86,101,114,115,105,111,110,115),['o',[[s(112,114,111,102,105,108,101),s(n)]]]]]]
for name,e in expected.items():
 a=v[name];encoded=json.dumps([a['role'],e],separators=(',',':'),ensure_ascii=True);assert encoded==a['canonicalAscii'],name;assert hashlib.sha256(encoded.encode('ascii')).hexdigest()==a['sha256'],name
for a,b in x['equalPairs']:assert v[a]['sha256']==v[b]['sha256'],(a,b)
for a,b in x['differentPairs']:assert v[a]['sha256']!=v[b]['sha256'],(a,b)
print('20 independently enumerated canonical vectors, 4 equal and 6 different pairs PASS; not a production codec test')
