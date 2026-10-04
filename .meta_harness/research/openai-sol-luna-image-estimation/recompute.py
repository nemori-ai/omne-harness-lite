"""Offline receipt/hash audit. No HTTP, credentials, ledger or product mutation."""
import hashlib
import json
from decimal import Decimal
from pathlib import Path

root = Path(__file__).resolve().parent
for line in (root / 'SHA256SUMS').read_text().splitlines():
    digest, name = line.split('  ', 1)
    assert hashlib.sha256((root / name).read_bytes()).hexdigest() == digest, name
provenance = json.loads((root / 'provenance.json').read_text())
rows = []
base_cost = Decimal(0)
for sample in provenance['samples']:
    receipt = json.loads((root / sample['receipt']).read_text(), parse_float=Decimal)
    manifest = json.loads((root / sample['manifest']).read_text())
    scenario = json.loads((root / sample['scenario']).read_text())
    assert receipt['wireSha256'] == manifest['publicWireSha256'] == scenario['publicWireSha256']
    assert hashlib.sha256((root / sample['scenario']).read_bytes()).hexdigest() == manifest['scenarioSha256']
    assert manifest['sourceCommit'] == sample['sourceCommit'] == scenario['sourceCommit']
    assert receipt['outcome'] == 'complete'
    assert receipt['upstreamModel'] == receipt['modelId']
    assert receipt['servingProvider'] == 'OpenAI'
    observed = receipt['observedInput']
    prediction = receipt['measurement']['predictedInput']
    admission = receipt['measurement']['admissionTokens']
    usage = json.loads(receipt['usageRaw'], parse_float=Decimal)
    cost = json.loads(receipt['costRaw'], parse_float=Decimal)['cost_usd']
    pro = receipt['modelId'].endswith('-pro')
    if pro:
        assert observed == {'kind': 'unavailable', 'reason': 'scope_unknown'}
        actual, residual = None, None
    else:
        assert observed['kind'] == 'from_usage', observed
        assert usage['source'] == 'upstream'
        actual = sum(usage[key] for key in ['input_tokens', 'cache_read_tokens', 'cache_write_tokens'])
        residual = prediction - actual
        assert actual <= admission
        base_cost += cost
    rows.append({'sample': sample['name'], 'billingInputUncached': usage['input_tokens'],
                 'cacheRead': usage['cache_read_tokens'], 'cacheWrite': usage['cache_write_tokens'],
                 'contextInput': actual, 'predicted': prediction, 'admission': admission,
                 'residual': residual, 'costUsd': str(cost)})
assert base_cost == Decimal('0.02221195'), base_cost
print(json.dumps({'rows': rows, 'baseCostUsd': str(base_cost)}, indent=2))
