"""Read only the explicitly approved inputs; never run paid scripts or read secrets."""
from pathlib import Path
from decimal import Decimal
import datetime
import hashlib
import json
import re
import shutil
import subprocess

PACK = Path(__file__).resolve().parent
HUB = PACK.parents[2]
ROOT = HUB / 'tmp/priority-certification'
SOURCE = ROOT / 'paid-claude-opus-5.5-cache-20260929-hub1'
CATALOG = ROOT / 'catalog-claude-opus-5.5-cache-20260929-hub1'
LEDGER = HUB / 'tmp/model-request-runtime/ledger.json'

def read(path):
    return json.loads(path.read_text())

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n')

def copy_safe(source, target):
    # Only explicit public/receipt/source inputs reach this function. This is an
    # additional marker check, not a general proof of absence of arbitrary secrets.
    data = source.read_bytes()
    assert not re.search(rb'sk-or-v1-[A-Za-z0-9]{12,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|Bearer [A-Za-z0-9._-]{16,}', data), source.name
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, target)
    assert sha(source) == sha(target)

manifest = read(SOURCE / 'manifest.json')
scenario = ROOT / 'claude-opus-5.5-cache-approved.json'
assert sha(scenario) == manifest['scenarioSha256']
assert sha(CATALOG / 'catalog.json') == manifest['catalogSha256']
catalog = read(CATALOG / 'catalog.json')
for name, key in [('directory.raw.json', 'directoryRawSha256'), ('endpoint.raw.json', 'endpointRawSha256')]:
    assert sha(CATALOG / name) == catalog[key]
    copy_safe(CATALOG / name, PACK / 'inputs' / name)
copy_safe(CATALOG / 'catalog.json', PACK / 'inputs/catalog.json')
copy_safe(scenario, PACK / 'inputs/scenario.json')

receipts = []
for source in sorted(SOURCE.glob('*.json')):
    assert source.name == 'manifest.json' or source.name.startswith(('public-', 'service-')), source.name
    value = read(source)
    if 'entryId' in value:
        assert value['modelId'] == 'anthropic/claude-opus-5.5'
        assert value['outcome'] == 'complete'
        receipts.append(value)
    copy_safe(source, PACK / 'outputs' / source.name)
assert len(receipts) == 5
ids = {r['entryId'] for r in receipts}
assert len(ids) == 5
# Select only these five original entries; never copy or report other entries.
selected = [e for e in read(LEDGER)['entries'] if e.get('id') in ids]
assert len(selected) == 5 and {e['id'] for e in selected} == ids
assert all(e['state'] == 'settled' and e['model'] == manifest['modelId'] for e in selected)
for receipt in receipts:
    entry = next(e for e in selected if e['id'] == receipt['entryId'])
    assert Decimal(entry['actualUsd']) == Decimal(str(receipt['cost']['cost_usd']))
    assert entry['estimateUsd'] == receipt['estimateUsd']
write(PACK / 'outputs/ledger-five-entries.json', selected)
total = sum((Decimal(e['actualUsd']) for e in selected), Decimal('0'))
pair = read(SOURCE / 'public-cache-pair.json')
by_id = {r['entryId']: r for r in receipts}
assert by_id[pair['coldEntryId']]['usage']['cache_write_tokens'] == pair['coldWriteTokens'] == 8256
assert by_id[pair['warmEntryId']]['usage']['cache_read_tokens'] == pair['warmReadTokens'] == 8256
assert all(by_id[pair[k]]['wireSha256'] == pair['wireSha256'] == manifest['publicWireSha256'] for k in ['coldEntryId', 'warmEntryId'])
services = sorted((r for r in receipts if r['case'] == 'service'), key=lambda r:r['turn'])
assert [r['approvedLocalWireSha256'] for r in services] == manifest['approvedLocalServiceWireSha256']
assert all(r['durable'] and r['requestInput'] == 'known' and r['observedInput'] == 'from_usage' for r in services)
assert all(r['liveWireSha256'] == 'unavailable' for r in services)
closes = list(SOURCE.glob('service-close*.json'))
assert len(closes) == 1
close = read(closes[0])
assert close['complete'] and close['businessComplete'] and close['hostReleasedAfterBusiness']
assert not close['hostReleasedBeforeBusiness']
assert close['completedEntries'] == [r['entryId'] for r in services]

source_checks = []
for relative, expected in manifest['sourceSha256'].items():
    source = HUB / relative
    actual = sha(source)
    source_checks.append({'path':relative,'expectedSha256':expected,'observedSha256':actual,'matches':actual == expected})
    if relative.startswith('tmp/priority-certification/'):
        assert actual == expected, 'Do not substitute a changed execution script'
        copy_safe(source, PACK / 'scripts' / source.name)
write(PACK / 'outputs/pack-verification.json', {
    'result':'receipt-and-input-checks-pass',
    'scenarioAndCatalogManifestHashes':True,
    'publicCatalogRawHashes':True,
    'allSixExecutionScriptHashes':True,
    'fiveReceiptsMatchSelectedOriginalLedgerEntries':True,
    'publicSameWireColdWriteWarmRead':True,
    'serviceApprovedLocalHashesAndCloseOrder':True,
    'physicalBatchVerification':'not-performed; no service-data or session log read',
    'sourceChecks':source_checks,
})
write(PACK / 'inputs.json', {
    'format':1,
    'status':'unreviewed-evidence-candidate',
    'packagedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'packagingHead':subprocess.check_output(['git','rev-parse','HEAD'],cwd=HUB,text=True).strip(),
    'executionCommit':'not independently established; exact execution source hashes are in manifest',
    'executionEnvironment':'not independently established in the allowed receipts',
    'sourceDirectory':str(SOURCE.relative_to(HUB)),
    'selectedLedgerSource':str(LEDGER.relative_to(HUB)),
    'totalActualUsd':str(total),
    'requests':5,
    'selectedUnknownEntries':0,
    'unknownAddedAmongTheseFiveRequests':0,
    'globalLedgerUnknownDelta':'not assessed; no claim about unrelated entries',
    'files':{str(f.relative_to(PACK)):sha(f) for f in sorted(PACK.rglob('*')) if f.is_file() and f.name != 'inputs.json'},
})
print(json.dumps({'requests':5,'totalActualUsd':str(total),'selectedUnknownEntries':0,'sourceHashMismatches':[x['path'] for x in source_checks if not x['matches']]}))
