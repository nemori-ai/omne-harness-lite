from pathlib import Path
import json,hashlib,copy
from jsonschema import Draft202012Validator,FormatChecker
from referencing import Registry,Resource
root=Path('.meta_harness/design/spec'); folders=[root/'data/messages/v8',root/'data/model-response/v11',root/'data/call-accounts/v4'];out=Path('tmp/ack-spec-draft/schema-run-02');out.mkdir(exist_ok=False)
files=list(root.rglob('*.schema.json'))
reg=Registry().with_resources([(x['$id'],Resource.from_contents(x)) for p in files if '$id' in (x:=json.loads(p.read_text()))])
inputs=[p for f in folders for p in f.glob('*.json')];(out/'input-sha256.json').write_text(json.dumps({str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in inputs},indent=2)+'\n')
rows=[]
for f in folders:
 schema=json.loads(next(f.glob('*.schema.json')).read_text());Draft202012Validator.check_schema(schema)
 for p in f.glob('*examples.json'):
  cases=json.loads(p.read_text())
  if isinstance(cases,dict):cases=cases.get('cases',[])
  if not isinstance(cases,list):continue
  for case in cases:
   if 'schemaValid' not in case:continue
   if 'definition' not in case:
    if f.name=='v11' and f.parent.name=='model-response':case['definition']='ModelResponse'
    else:continue
   selected={'$schema':schema['$schema'],'$ref':schema['$id']+'#/$defs/'+case['definition']}
   errors=list(Draft202012Validator(selected,registry=reg,format_checker=FormatChecker()).iter_errors(case['value']));valid=not errors
   rows.append({'file':str(p),'name':case['name'],'definition':case['definition'],'expected':case['schemaValid'],'actual':valid,'errors':[e.message for e in errors]})
(out/'results.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n')
failed=[r for r in rows if r['expected']!=r['actual']]
print('cases',len(rows),'mismatches',len(failed));print(json.dumps(failed,ensure_ascii=False,indent=2));raise SystemExit(bool(failed))
