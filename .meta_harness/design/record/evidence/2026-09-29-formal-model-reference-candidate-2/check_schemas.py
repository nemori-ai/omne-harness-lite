from pathlib import Path
import json,decimal,hashlib
from jsonschema import Draft202012Validator
from referencing import Registry,Resource
W=Path('/data/qiwei/repos/omne-harness-lite/.worktrees/model-request-runtime-ref-design');D=W/'.meta_harness/design';S=D/'spec'
reg=Registry();schemas={}
for p in S.rglob('*.schema.json'):
 d=json.loads(p.read_text(),parse_float=decimal.Decimal)
 if '$id' in d:schemas[d['$id']]=d;reg=reg.with_resource(d['$id'],Resource.from_contents(d))
files=[('data/model-response/v10/model-response.schema.json',['examples.json','ready-examples.json']),('data/messages/v7/messages.schema.json',['input-limit-examples.json','reference-examples.json']),('data/call-accounts/v3/call-accounts.schema.json',['ready-examples.json'])]
failed=[];n=0
for rel,fs in files:
 p=S/rel;d=json.loads(p.read_text(),parse_float=decimal.Decimal);Draft202012Validator.check_schema(d)
 for f in fs:
  data=json.loads((p.parent/f).read_text(),parse_float=decimal.Decimal);cs=data if isinstance(data,list) else data['cases']
  for c in cs:
   definition=c.get('definition',c.get('schemaDefinition'));schema={'$ref':d['$id']+('#/$defs/'+definition if definition else '')}
   errors=list(Draft202012Validator(schema,registry=reg).iter_errors(c['value']));valid=not errors;n+=1
   if valid!=c['schemaValid']:failed.append((f,c['name'],valid,[e.message for e in errors[:2]]))
 print('schema',rel,'OK')
print('CA3 >2^53 integer parse:',json.loads((S/'data/call-accounts/v3/ready-examples.json').read_text())[0]['value']['input_tokens'])
import re
md=(S/'data/messages/v7/examples.md').read_text()
rows=re.findall(r'`(\{[^`]+\})` \| (通过|拒绝) \|',md)
for raw,expected in rows:
 value=json.loads(raw,parse_float=decimal.Decimal)
 if value.get('kind') != 'model_call_ended':continue
 schema={'$ref':(S/'data/messages/v7/messages.schema.json').resolve().as_uri()}
 sid=json.loads((S/'data/messages/v7/messages.schema.json').read_text())['$id']
 errors=list(Draft202012Validator({'$ref':sid+'#/$defs/ModelCallEndedRecord'},registry=reg).iter_errors(value));n+=1
 if (not errors)!=(expected=='通过'):failed.append(('examples.md',raw,not errors,[e.message for e in errors[:2]]))
for x in failed:print('FAIL',x)
print(f'CASES {n} PASS {n-len(failed)} FAIL {len(failed)}')
raise SystemExit(bool(failed))
