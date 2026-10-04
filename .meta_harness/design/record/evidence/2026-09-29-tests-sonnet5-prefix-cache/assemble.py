"""Assemble only approved safe paid receipts; never invoke model or read secrets."""
from pathlib import Path
from decimal import Decimal
import datetime, hashlib, json, re, shutil, subprocess

PACK = Path(__file__).resolve().parent
HUB = PACK.parents[2]
SHORT, MODEL, EXPECTED = ('sonnet', 'claude-sonnet-5', 5) if PACK.name.startswith('sonnet') else ('sol', 'gpt-6-sol', 4)
ROOT = HUB / 'tmp/priority-certification'
SOURCE = ROOT / f'paid-{SHORT}-v2-20260929-hub1'
CATALOG = ROOT / f'catalog-{SHORT}-v2-20260929-hub1'
LEDGER = HUB / 'tmp/model-request-runtime/ledger.json'
def read(path): return json.loads(path.read_text())
def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False)+'\n')
def copy_safe(source, target):
    data = source.read_bytes()
    assert not re.search(rb'sk-or-v1-[A-Za-z0-9]{12,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|Bearer [A-Za-z0-9._-]{16,}',data), source.name
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source,target)
    assert sha(source)==sha(target)

m=read(SOURCE/'manifest.json'); summary=read(SOURCE/'run-summary.json')
scenario=ROOT/f'{MODEL}-v2-approved-20260929-hub2.json'
assert sha(scenario)==m['scenarioSha256']==summary['scenarioSha256']
assert sha(CATALOG/'catalog.json')==m['catalogSha256']==summary['catalogSha256']
c=read(CATALOG/'catalog.json')
for name,key in [('directory.raw.json','directoryRawSha256'),('endpoint.raw.json','endpointRawSha256')]:
    assert sha(CATALOG/name)==c[key]
    copy_safe(CATALOG/name,PACK/'inputs'/name)
copy_safe(CATALOG/'catalog.json',PACK/'inputs/catalog.json')
copy_safe(scenario,PACK/'inputs/scenario.json')
receipts={}; observations={}
for f in sorted(SOURCE.glob('*.json')):
    assert f.name in ['manifest.json','run-summary.json'] or f.name.startswith(('public-','service-'))
    v=read(f)
    if 'entryId' in v:
        assert v['modelId']==m['modelId'] and v['outcome']=='complete'
        destination=observations if f.name.startswith('service-observed-') else receipts
        assert v['entryId'] not in destination
        destination[v['entryId']]=v
    copy_safe(f,PACK/'outputs'/f.name)
assert len(receipts)==EXPECTED and len(observations)==3
assert summary['ownersClosed'] and len(summary['public'])+len(summary['service'])==EXPECTED
for r in summary['public']+summary['service']:
    assert all(receipts[r['entryId']][k]==v for k,v in r.items())
for id, observed in observations.items():
    final=receipts[id]
    assert observed['durable'] is False and final['durable'] is True
    assert {k:v for k,v in observed.items() if k!='durable'}=={k:v for k,v in final.items() if k!='durable'}
selected=[e for e in read(LEDGER)['entries'] if e.get('id') in receipts]
assert len(selected)==EXPECTED and {e['id'] for e in selected}==set(receipts)
assert all(e['state']=='settled' and e['model']==m['modelId'] for e in selected)
for e in selected:
    r=receipts[e['id']]
    assert Decimal(e['actualUsd'])==Decimal(str(r['cost']['cost_usd']))
    assert e['estimateUsd']==r['estimateUsd']==m['estimateUsdPerRequest']
write(PACK/'outputs/ledger-selected-entries.json',selected)
total=sum((Decimal(e['actualUsd']) for e in selected),Decimal(0))
services=sorted((r for r in receipts.values() if r['case']=='service'),key=lambda r:r['turn'])
assert [r['approvedLocalWireSha256'] for r in services]==m['approvedLocalServiceWireSha256']
assert all(r['durable'] and r['requestInput']=='known' and r['observedInput']=='from_usage' and r['liveWireSha256']=='unavailable' for r in services)
for r in receipts.values():
    if r['case']=='public': assert r['wireSha256']==m['publicWireSha256']
closefiles=list(SOURCE.glob('service-close*.json'));assert len(closefiles)==1
close=read(closefiles[0])
assert close['complete'] and close['businessComplete'] and close['hostReleasedAfterBusiness'] and not close['hostReleasedBeforeBusiness']
assert close['completedEntries']==[r['entryId'] for r in services]
if SHORT=='sonnet':
    pair=read(SOURCE/'public-cache-pair.json')
    assert receipts[pair['coldEntryId']]['usage']['cache_write_tokens']==pair['coldWriteTokens']==8256
    assert receipts[pair['warmEntryId']]['usage']['cache_read_tokens']==pair['warmReadTokens']==8256
    assert pair['wireSha256']==m['publicWireSha256']
    assert [(r['usage']['cache_read_tokens'],r['usage']['cache_write_tokens']) for r in services]==[(0,8222),(8222,20),(8242,19)]
else:
    assert all(r['usage']['cache_read_tokens']==r['usage']['cache_write_tokens']==0 for r in receipts.values())
source_checks=[]
for relative,expected in m['sourceSha256'].items():
    source=HUB/relative;actual=sha(source)
    source_checks.append({'path':relative,'expectedSha256':expected,'observedSha256':actual,'matches':actual==expected})
    if relative.startswith('tmp/priority-certification/runner-v2/'):
        assert actual==expected, 'Do not replace executed scripts with different versions'
        copy_safe(source,PACK/'scripts'/source.name)
copy_safe(HUB/'tmp/model-request-runtime/vendor-completion-root/sonnet-v2-production-preflight-failure.txt',PACK/'outputs/root-preflight-observation.txt')
write(PACK/'outputs/pack-verification.json',{
    'result':'receipt-and-input-checks-pass','scenarioAndCatalogHashes':True,'rawCatalogHashes':True,
    'executionScriptHashes':True,'uniqueRequests':EXPECTED,'serviceObservationPairs':3,
    'observationOnlyDifference':'durable false before, true after; same entryId counted once',
    'ledgerReceiptAndSummaryValuesMatch':True,'closeOrder':True,
    'cacheClaim':'explicit prefix write/read observed' if SHORT=='sonnet' else 'no cache hit observed',
    'physicalBatchVerification':'not performed; no service-data/session-log read',
    'sourceChecks':source_checks})
write(PACK/'inputs.json',{
    'format':1,'status':'unreviewed-evidence-candidate','packagedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'packagingHead':subprocess.check_output(['git','rev-parse','HEAD'],cwd=HUB,text=True).strip(),
    'executionCommit':'root reports 7595c196; safe receipts contain source hashes, not an independently established commit',
    'executionEnvironment':'not independently established in allowed receipts',
    'sourceDirectory':str(SOURCE.relative_to(HUB)),'selectedLedgerSource':str(LEDGER.relative_to(HUB)),
    'requests':EXPECTED,'totalActualUsd':str(total),'selectedUnknownEntries':0,
    'unknownAddedAmongSelectedRequests':0,'globalLedgerUnknownDelta':'not assessed',
    'files':{str(f.relative_to(PACK)):sha(f) for f in sorted(PACK.rglob('*')) if f.is_file() and f.name!='inputs.json'}})
print(json.dumps({'pack':PACK.name,'requests':EXPECTED,'totalActualUsd':str(total),'selectedUnknownEntries':0,'sourceHashMismatches':[c['path'] for c in source_checks if not c['matches']]}))
