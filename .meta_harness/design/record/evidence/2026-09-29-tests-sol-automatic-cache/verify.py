#!/usr/bin/env python3
"""Offline evidence verification; never imports/runs archived paid scripts."""
import argparse
import hashlib
import json
from decimal import Decimal
from pathlib import Path
import subprocess

PACK = Path(__file__).resolve().parent

def check(value, message):
    if not value:
        raise AssertionError(message)

def sha(data):
    return hashlib.sha256(data).hexdigest()

def read(path):
    return json.loads((PACK / path).read_text(), parse_float=Decimal)

def verify(repo=None):
    info = read('inputs.json')
    inventory = read('checksums.json')
    actual = {str(p.relative_to(PACK)) for p in PACK.rglob('*') if p.is_file()}
    check(actual == set(inventory) | {'checksums.json'}, 'unexpected or missing package files')
    for path, digest in inventory.items():
        check(not (PACK / path).is_symlink(), 'symlink: ' + path)
        check(sha((PACK / path).read_bytes()) == digest, 'SHA mismatch: ' + path)
    manifest = read('receipts/manifest.json')
    summary = read('receipts/run-summary.json')
    scenario = read('approved-scenario.json')
    catalog = read('catalog/catalog.json')
    check(sha((PACK/'approved-scenario.json').read_bytes()) == manifest['scenarioSha256'], 'scenario bytes')
    check(sha((PACK/'catalog/catalog.json').read_bytes()) == manifest['catalogSha256'], 'catalog bytes')
    for name, key in [('directory.raw.json','directoryRawSha256'), ('endpoint.raw.json','endpointRawSha256')]:
        check(sha((PACK/'catalog'/name).read_bytes()) == catalog[key], 'catalog raw: '+name)
    for key in ['modelId', 'scenarioSha256', 'catalogSha256']:
        check(summary[key] == manifest[key], 'summary manifest: '+key)
    for key in ['modelId','caseKind','definitionRevision','implementation','profileSha256','publicWireSha256','sourceSha256']:
        check(scenario[key] == manifest[key], 'scenario manifest: '+key)
    check(scenario['reviewStatus'] == 'approved', 'scenario approval')
    check(scenario['serviceWireSha256'] == manifest['approvedLocalServiceWireSha256'], 'service wire approval')
    check(catalog['observedAt'] == manifest['catalogObservedAt'], 'catalog observation')
    proof = read('source-proof.json')
    check(proof['executionCommit'] == info['executionCommit'], 'source commit')
    check(set(proof['files']) == set(manifest['sourceSha256']), 'source proof scope')
    for path, digest in manifest['sourceSha256'].items():
        data = (PACK/'sources'/path).read_bytes()
        check(sha(data) == digest == proof['files'][path]['sha256'], 'manifest source: '+path)
        if repo and proof['files'][path]['kind'] == 'git':
            original = subprocess.check_output(['git','-C',str(repo),'show',info['executionCommit']+':'+path])
            check(data == original, 'git source bytes: '+path)
    card = next(c for c in catalog['cards'] if c['id'] == manifest['modelId'])
    endpoint = next(e for e in card['endpoints'] if e['tag'] == manifest['expectedEndpointTag'])
    check(endpoint['status'] == 0, 'catalog endpoint available at observation')
    pricing = endpoint['pricing']
    publics, services = summary['public'], summary['service']
    rows = publics + services
    ids = [r['entryId'] for r in rows]
    check(ids == info['entryIds'] and len(ids) == len(set(ids)), 'unique ordered entries')
    check(len(rows) == manifest['maximumPlannedRequests'] == info['requestCount'], 'request count')
    ledger = read('selected-ledger-entries.json')
    check(len(ledger) == len(ids) and {e['id'] for e in ledger} == set(ids), 'selected ledger scope')
    ledger = {e['id']: e for e in ledger}
    total = Decimal(0)
    request_ids = []
    response_ids = []
    caches = []
    for i, row in enumerate(rows):
        kind = 'public' if i < len(publics) else 'service'
        receipt = read('receipts/'+kind+'-'+row['entryId']+'.json')
        for key, value in row.items():
            check(receipt[key] == value, 'summary receipt: '+row['entryId']+'/'+key)
        check(receipt['modelId'] == manifest['modelId'], 'receipt model')
        check(receipt['outcome'] == 'complete' and receipt['failure'] is None, 'outcome/failure')
        check(receipt['httpStatus'] is None and receipt['inBandStatusCode'] is None, 'unexpected status')
        check(receipt['observedInput'] == 'from_usage' and receipt['observedInputReason'] is None, 'observation')
        check(receipt['usage']['source'] == 'upstream', 'usage source')
        cost = receipt['cost']
        check(cost['source'] == 'upstream_usage', 'cost source')
        check(cost['cost_usd'] == cost['upstream_inference_cost_usd'], 'cost agreement')
        entry = ledger[row['entryId']]
        check(entry['state'] == 'settled' and entry['model'] == manifest['modelId'], 'ledger settled/model')
        check(entry['provider'] == manifest['expectedEndpointTag'], 'ledger provider')
        check(Decimal(entry['actualUsd']) == cost['cost_usd'], 'ledger actual')
        check(Decimal(entry['estimateUsd']) == Decimal(receipt['estimateUsd']) == Decimal(manifest['estimateUsdPerRequest']), 'reservation')
        usage = receipt['usage']
        context = sum(usage[k] for k in ['input_tokens','cache_read_tokens','cache_write_tokens'])
        check(all(context < o['min_prompt_tokens'] for o in pricing.get('overrides', [])), 'sample crossed base-price threshold')
        write_price = 'input_cache_write_1h' if scenario.get('cache',{}).get('ttl') == '1h' else 'input_cache_write'
        priced = (Decimal(usage['input_tokens'])*Decimal(pricing['prompt']) + Decimal(usage['output_tokens'])*Decimal(pricing['completion']) + Decimal(usage['cache_read_tokens'])*Decimal(pricing['input_cache_read']) + Decimal(usage['cache_write_tokens'])*Decimal(pricing[write_price]))
        check(priced == cost['cost_usd'], 'catalog price arithmetic for selected sample')
        total += cost['cost_usd']
        request_ids.append(receipt['upstreamRequestId'])
        caches.append([receipt['usage']['cache_read_tokens'],receipt['usage']['cache_write_tokens']])
        if kind == 'public':
            check(receipt['wireSha256'] == manifest['publicWireSha256'], 'public wire')
            check(receipt['definitionRevision'] == manifest['definitionRevision'] and receipt['implementation'] == manifest['implementation'], 'public binding')
            check(receipt['rejectionReason'] is None, 'rejection')
            check(receipt['requestIdHeaders']['x-generation-id'] == receipt['upstreamRequestId'], 'request id headers')
        else:
            observed = read('receipts/service-observed-'+row['entryId']+'.json')
            check(observed['durable'] is False and receipt['durable'] is True, 'observed/durable stages')
            check({k:v for k,v in observed.items() if k!='durable'} == {k:v for k,v in receipt.items() if k!='durable'}, 'observed/durable values')
            turn = i-len(publics)+1
            check(receipt['turn'] == turn and receipt['requestInput'] == 'known', 'service turn/input')
            check(receipt['approvedLocalWireSha256'] == manifest['approvedLocalServiceWireSha256'][turn-1], 'approved local service wire')
            check(receipt['liveWireSha256'] == 'unavailable', 'do not invent live wire identity')
            response_ids.append(receipt['responseId'])
    check(all(isinstance(x,str) and x for x in request_ids) and len(set(request_ids)) == len(ids), 'unique upstream requests')
    check(len(set(response_ids)) == len(services), 'unique service responses')
    check(total == Decimal(info['expectedTotalUsd']), 'Decimal total')
    check(caches == info['expectedCacheReadWrite'], 'cache read/write observations')
    check(summary['ownersClosed'] is True, 'owners closed receipt')
    if services:
        check(summary['serviceNotStartedByScenario'] is False, 'service started')
        close = read('receipts/'+info['closeReceipt'])
        check(close == {'hostReleasedBeforeBusiness':False,'hostReleasedAfterBusiness':True,'complete':True,'businessComplete':True,'completedEntries':[r['entryId'] for r in services]}, 'close receipt order/flags')
        pair = read('receipts/public-cache-pair.json')
        check(pair == {'coldEntryId':ids[0],'warmEntryId':ids[1],'coldWriteTokens':caches[0][1],'warmReadTokens':caches[1][0],'wireSha256':manifest['publicWireSha256']}, 'cache pair')
        check(caches[0][1] == caches[1][0] > 0 and caches[0][0] == caches[1][1] == 0, 'cold/warm receipt relation')
    else:
        check(summary['serviceNotStartedByScenario'] is True and not list((PACK/'receipts').glob('service*.json')), 'no service in locator')
    return {'status':'pass','modelId':manifest['modelId'],'executionCommit':info['executionCommit'],'requests':len(ids),'actualUsd':str(total),'cacheReadWrite':caches,'serviceObservedDurablePairs':len(services),'limits':['receipt consistency only; no physical batch verification','no full/marginal mode assertion','old Opus unknown unchanged; original cause not established']}

if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo',type=Path,help='Optional explicit repository for git-show source-byte recheck; no guessed parent path')
    args=parser.parse_args()
    print(json.dumps(verify(args.repo),ensure_ascii=False,indent=2))
