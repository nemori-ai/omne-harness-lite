"""Check candidate reply wire shape and the bounded totalization decision table.

This is a reference oracle, not a production authorizer or application service.
"""
from copy import deepcopy
from itertools import product
import json
from pathlib import Path
import sys

try:
    from jsonschema import Draft202012Validator
except ImportError:
    print('jsonschema is required; no protocol checks ran', file=sys.stderr)
    sys.exit(2)

ROOT = Path(__file__).resolve().parent
SCHEMA = json.loads((ROOT / 'reply.schema.json').read_text())
Draft202012Validator.check_schema(SCHEMA)
VALIDATOR = Draft202012Validator(SCHEMA)


def classify(payload, *, qualified=True, state='pending', storage='committed'):
    if not VALIDATOR.is_valid(payload):
        return 'invalid-input'
    if not qualified or payload['operation']['tenantRef'] != payload['cardRef']['request']['tenantRef']:
        return 'denied'
    if state == 'decided':
        return 'already-decided'
    if state == 'invalidated':
        return 'invalidated'
    return {'committed': 'decided', 'unavailable': 'unavailable', 'lost-receipt': 'unknown'}[storage]


def main():
    valid = {'protocol': 'hitl/1', 'operation': {'tenantRef': 't1', 'actorRef': 'p1', 'operationId': 'o1'},
             'cardRef': {'request': {'tenantRef': 't1', 'requestId': 'r1'}, 'cardId': 'c1'},
             'expectedRevision': '0', 'reply': {'kind': 'text', 'text': '先说明影响'}}
    cases = []
    for reply in [{'kind': 'selection', 'optionId': 'yes'}, {'kind': 'text', 'text': '待解释'}, {'kind': 'decline'}]:
        value = deepcopy(valid)
        value['reply'] = reply
        cases.append((value, True))
    for value in [None, [], {}, 12, 'not-json-object']:
        cases.append((value, False))
    for key in valid:
        value = deepcopy(valid)
        del value[key]
        cases.append((value, False))
    for reply in [{'kind': 'timeout'}, {'kind': 'selection', 'optionId': 'yes', 'text': 'also'},
                  {'kind': 'decline', 'approved': True}, {'kind': 'text', 'text': ''}]:
        value = deepcopy(valid)
        value['reply'] = reply
        cases.append((value, False))
    value = deepcopy(valid)
    value['runtime'] = {'session': 'invented'}
    cases.append((value, False))
    value = deepcopy(valid)
    value['cardRef'] = {'tenantRef': 't1', 'requestId': 'r1', 'cardId': 'c1'}
    cases.append((value, False))
    value = deepcopy(valid)
    value['card'] = value.pop('cardRef')
    cases.append((value, False))
    assert all(VALIDATOR.is_valid(value) == expected for value, expected in cases)
    outputs = set()
    for payload, qualified, state, storage in product([valid, None], [True, False],
            ['pending', 'decided', 'invalidated'], ['committed', 'unavailable', 'lost-receipt']):
        result = classify(payload, qualified=qualified, state=state, storage=storage)
        outputs.add(result)
        if not qualified and payload is not None:
            assert result == 'denied'
        if payload is None:
            assert result == 'invalid-input'
        if payload is not None and qualified and state == 'pending' and storage == 'lost-receipt':
            assert result == 'unknown'
    assert outputs == {'invalid-input', 'denied', 'already-decided', 'invalidated', 'decided', 'unavailable', 'unknown'}
    foreign = deepcopy(valid)
    foreign['operation']['tenantRef'] = 't2'
    assert classify(foreign) == 'denied'
    print(json.dumps({'schemaCases': len(cases), 'totalizationCases': 36,
                      'foreignTenantCases': 1, 'scope': 'candidate reply schema and finite oracle; no production implementation proof'}))


if __name__ == '__main__':
    main()
