from pathlib import Path
import json
from jsonschema import Draft202012Validator
from referencing import Registry,Resource
root=Path('.meta_harness/design/spec'); registry=Registry()
for f in root.rglob('*.schema.json'):
 s=json.loads(f.read_text())
 if '$id' in s:registry=registry.with_resource(s['$id'],Resource.from_contents(s))
p=root/'compositions/governance-center-entry/v2';schema=json.loads((p/'governance-center-entry.schema.json').read_text());Draft202012Validator.check_schema(schema)
checks=[]
for case in json.loads((p/'examples.json').read_text()):
 v=Draft202012Validator(dict(schema,**{'$ref':'#/$defs/'+case['definition']}),registry=registry)
 errors=list(v.iter_errors(case['value']));actual=not errors
 checks.append(dict(case,actual=actual,errors=[e.message for e in errors]))
print(json.dumps(checks,ensure_ascii=False,indent=2))
assert all(c['valid']==c['actual'] for c in checks)
print('PASS',len(checks),'shape checks; no authorization or transaction claim')
