import json,re,sys,warnings
from pathlib import Path
warnings.filterwarnings('ignore',category=DeprecationWarning)
from jsonschema import Draft202012Validator
from referencing import Registry,Resource
root=Path('.meta_harness/design');p=root/'spec/data/model-response/v9';schema=json.loads((p/'model-response.schema.json').read_text());store={}
for f in (root/'spec').rglob('*.schema.json'):
 d=json.loads(f.read_text())
 if '$id' in d:store[d['$id']]=d
Draft202012Validator.check_schema(schema)
registry=Registry().with_resources((k,Resource.from_contents(d)) for k,d in store.items())
v=Draft202012Validator(schema,registry=registry)
def relations(x):
 c=x['inputCalibration'];r=c['requestInput'];o=c['observedInput'];g=c['outputGroup'];route=x['route'];u=x['usage']
 if r['kind']=='known':
  if g['kind']=='known' and g['projectionRevision']!=r['projectionRevision']:return False
  if r['countingBasis']['binding']!=route['adaptation'] or r['projectionRevision']!=r['countingBasis']['projectionRevision']:return False
 if o['kind']=='upstream_total' and o['tokens']<sum(u[k] for k in ['input_tokens','cache_read_tokens','cache_write_tokens'] if isinstance(u[k],int)):return False
 if o['kind']!='unavailable':
  if any(k in o['provenance'] and k in route and o['provenance'][k]!=route[k] for k in ['upstreamRequestId','upstreamModel','servingProvider']):return False
 if g['kind']=='known':
  src=g['source'];blocks=x.get('reply',{}).get('blocks',[]) if src=='reply' else x.get('delivered',[]) if src=='delivered' else []
  if (src=='reply' and 'reply' not in x) or (src=='delivered' and 'delivered' not in x) or (src=='none' and ('reply' in x or 'delivered' in x)) or len(blocks)!=len(g['blockDigests']):return False
 return True
failed=[]
for e in json.loads((p/'examples.json').read_text()):
 validator=Draft202012Validator({**schema,'$ref':'#/$defs/'+e.get('schemaDefinition','ModelResponse')},registry=registry); errors=list(validator.iter_errors(e['value']));sv=not errors;rv=sv and relations(e['value']);ok=(sv==e['schemaValid'] and rv==e['relationsValid']);print(e['name'], 'PASS' if ok else 'FAIL', 'schema=',sv,'relations=',rv)
 if not ok:failed.append(e['name']);print([e.message for e in errors][:3])
print('Schema instances:',len(json.loads((p/'examples.json').read_text())),'failures:',len(failed))
sys.exit(bool(failed))
