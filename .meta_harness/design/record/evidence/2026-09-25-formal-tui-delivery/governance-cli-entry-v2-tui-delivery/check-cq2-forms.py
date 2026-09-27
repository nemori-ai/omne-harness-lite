from pathlib import Path
import json
from jsonschema import Draft202012Validator
r=Path('.meta_harness/design/spec/compositions');p=r/'governance-cli-entry/v2'
schema=json.loads((p/'tui-forms.schema.json').read_text());forms=json.loads((p/'forms.json').read_text());examples=json.loads((p/'examples.json').read_text())
Draft202012Validator.check_schema(schema);Draft202012Validator(schema).validate(forms)
for i,case in enumerate(examples):
 v=Draft202012Validator({'$schema':schema['$schema'],'$defs':schema['$defs'],'$ref':'#/$defs/'+case['definition']})
 assert v.is_valid(case['value'])==case['valid'],i
commands=json.loads((r/'governance-cli-entry/v1/commands.json').read_text());defs=json.loads((r/'governance-center-entry/v2/governance-center-entry.schema.json').read_text())['$defs']
assert len({f['id'] for f in forms})==34
for f,c in zip(forms,commands):
 assert f['id']==' '.join(c['command']) and f['action']==c['action'] and f['operation']==c.get('operation')
 assert {x['name'] for x in f['fields'] if x['kind']=='secret-file'}==set(c['secretFields'])
 if 'payloadSchema' in f:
  payload=defs[f['payloadSchema'].split('/')[-1]]
  assert {x['name'] for x in f['fields']}==set(payload.get('properties',{})),f['id']
  for field in f['fields']:
   if f['id']=='invitation inspect' and field['name']=='expectedTenant':assert field['when']=={'field':'callerIdentityKind','equals':'tenant'}
   else:assert field['required']==(field['name'] in payload.get('required',[]))
print(json.dumps({'status':'PASS','forms':34,'schemaExamples':len(examples),'checks':['closed metadata Schema','exact frozen command/action/operation/secret slots','exact EC2 payload fields and optional/conditional requiredness'],'scope':'mapping and metadata only; interactive decoder/CG Intent/result execution still needs tests'}))
