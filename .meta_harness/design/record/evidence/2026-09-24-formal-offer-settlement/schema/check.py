from pathlib import Path
import json
from jsonschema import Draft202012Validator
p=Path('.meta_harness/design/spec/data/offer-expiry/v2/offer-expiry.schema.json')
schema=json.loads(p.read_text());Draft202012Validator.check_schema(schema)
checks=[]
for definition,values in [('OfferState',[('pending',True),('accepted',True),('withdrawn',True),('declined',True),('expired',True),('cancelled',False)]),('SettledState',[('accepted',True),('withdrawn',True),('declined',True),('pending',False),('expired',False)])]:
 validator=Draft202012Validator(dict(schema,**{'$ref':'#/$defs/'+definition}))
 for value,want in values:
  actual=validator.is_valid(value);assert actual==want,(definition,value,actual,want)
  checks.append({'definition':definition,'value':value,'expectedValid':want,'valid':actual})
validator=Draft202012Validator(schema)
for case in schema['$defs']['OfferTiming']['x-counterexamples']:
 assert validator.is_valid(case['value']) == (not case['rejectedBySchema'])
 checks.append({'definition':'OfferTiming','value':case['value'],'expectedValid':not case['rejectedBySchema'],'valid':validator.is_valid(case['value'])})
for value in schema['$defs']['OfferTiming']['examples']:
 assert validator.is_valid(value)
 checks.append({'definition':'OfferTiming','value':value,'expectedValid':True,'valid':True})
print(json.dumps({'checks':checks,'count':len(checks),'limits':'Shape checks only; no temporal, authorization, atomicity or migration evidence.'},ensure_ascii=False,indent=2))
