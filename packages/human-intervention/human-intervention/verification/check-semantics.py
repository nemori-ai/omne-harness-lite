"""Check HJ0 finite reference semantics, never production conformance.

The permission oracle is a relation over candidates. The reference evaluator
uses ordered scans and minimization. Command checks concern result closure,
observation partitions, and stable receipt readback, not service transitions.
"""
from dataclasses import dataclass
from itertools import product
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent
VALUES = ('deny', 'ask', 'auto')
SUBSETS = tuple(frozenset(v for i, v in enumerate(VALUES) if mask & (1 << i))
                for mask in range(8))
PICKS = (None,) + VALUES
# Fixtures declare both strictness and distances. No numeric enum distance exists.
UNIFORM = ((0, 1, 2), (1, 0, 1), (2, 1, 0))
NONUNIFORM = ((0, 1, 4), (1, 0, 3), (4, 3, 0))


@dataclass(frozen=True)
class Basis:
    external: frozenset | None = frozenset(VALUES)
    locks: tuple = ()
    picks: tuple = ('deny', None, None, None)  # default, organization, tenant, session
    prohibitions: tuple = (False, False, False)
    missing: tuple = ()
    distances: tuple | None = UNIFORM
    strict_order: tuple = VALUES
    valid: bool = True


def permission_relation(basis):
    """Return all results permitted by set membership and dominance clauses."""
    if not basis.valid:
        return frozenset({('invalid-input',)})
    bounds = tuple(b for b in (basis.external,) + basis.locks if b is not None)
    allowed = frozenset(v for v in VALUES if all(v in bound for bound in bounds))
    if any(basis.prohibitions):
        return frozenset({('denied', 'active-prohibition')})
    if not allowed:
        return frozenset({('denied', 'empty-bound')})
    if basis.missing or basis.external is None or None in basis.locks:
        return frozenset({('unavailable', 'required-source')})
    legal = frozenset(i for i in range(4) if basis.picks[i] in allowed)
    if legal:
        return frozenset(('effective', value, tuple(sorted(allowed)))
                         for value in allowed
                         if any(basis.picks[i] == value and all(j <= i for j in legal)
                                for i in legal))
    selected = frozenset(i for i in range(4) if basis.picks[i] is not None)
    if not selected or basis.distances is None or basis.strict_order is None:
        return frozenset({('unavailable', 'comparison')})
    # A candidate wins iff no allowed candidate dominates it by declared distance
    # and, for equal distance, by declared strictness. This is not the scan below.
    anchors = {basis.picks[i] for i in selected if all(j <= i for j in selected)}
    return frozenset(('effective', value, tuple(sorted(allowed)))
                     for value in allowed for anchor in anchors
                     if not any(
                         basis.distances[VALUES.index(other)][VALUES.index(anchor)] <
                         basis.distances[VALUES.index(value)][VALUES.index(anchor)] or
                         (basis.distances[VALUES.index(other)][VALUES.index(anchor)] ==
                          basis.distances[VALUES.index(value)][VALUES.index(anchor)] and
                          basis.strict_order.index(other) < basis.strict_order.index(value))
                         for other in allowed))


def evaluate_permission(basis, mutation=None):
    """Executable candidate reference, separate from the specification relation."""
    if not basis.valid:
        return ('invalid-input',)
    if any(basis.prohibitions) and not (mutation or '').startswith('override-active-prohibition'):
        return ('denied', 'active-prohibition')
    if mutation == 'default-deny-as-prohibition' and basis.picks[0] == 'deny':
        return ('denied', 'active-prohibition')
    allowed = set(VALUES)
    if basis.external is not None and mutation != 'omit-external-bound':
        allowed.intersection_update(basis.external)
    for lock in basis.locks:
        if lock is not None and mutation != 'omit-lock-bound':
            allowed.intersection_update(lock)
    if not allowed:
        return ('denied', 'empty-bound')
    if basis.missing or basis.external is None or None in basis.locks:
        if mutation == 'missing-source-allows':
            return ('effective', 'auto', tuple(sorted(allowed)))
        return ('unavailable', 'required-source')
    indexes = range(4) if mutation == 'outer-pick-first' else range(3, -1, -1)
    if mutation != 'fallback-before-legal-pick':
        for i in indexes:
            if basis.picks[i] in allowed:
                return ('effective', basis.picks[i], tuple(sorted(allowed)))
    anchor = next((v for v in reversed(basis.picks) if v is not None), None)
    if anchor is None or basis.distances is None or basis.strict_order is None:
        return ('unavailable', 'comparison')
    distances = UNIFORM if mutation == 'invent-uniform-distance' else basis.distances
    def key(value):
        rank = basis.strict_order.index(value)
        if mutation == 'weaker-distance-tie':
            rank = -rank
        return distances[VALUES.index(value)][VALUES.index(anchor)], rank
    value = min(allowed, key=key)
    return ('effective', value, tuple(sorted(allowed)))


def check_permission(basis):
    permitted = permission_relation(basis)
    assert len(permitted) == 1, ('non-total permission relation', basis, permitted)
    actual = evaluate_permission(basis)
    assert actual in permitted, (basis, permitted, actual)
    return actual[0]


def permission_cases():
    counts = {}
    outcomes = set()
    # Complete products within each named partition. These are bounded sweeps,
    # not a claim to exhaust the unbounded or full cross-product input domain.
    count = 0
    for external, first, second, picks, distance in product(
            SUBSETS, SUBSETS, SUBSETS, product(PICKS, repeat=4),
            (UNIFORM, NONUNIFORM, None)):
        outcomes.add(check_permission(Basis(external, (first, second), picks,
                                           distances=distance)))
        count += 1
    counts['bounds-picks-comparison'] = count
    count = 0
    for external, picks, prohibitions in product(
            SUBSETS, product(PICKS, repeat=4), product((False, True), repeat=3)):
        outcomes.add(check_permission(Basis(external, (), picks, prohibitions)))
        count += 1
    counts['default-and-three-active-prohibitions'] = count
    count = 0
    for picks, missing, lock in product(product(PICKS, repeat=4),
            ('external', 'declaration', 'organization', 'tenant', 'session', 'lock'),
            SUBSETS):
        basis = Basis(None if missing == 'external' else frozenset(VALUES),
                      (None, lock) if missing == 'lock' else (lock,), picks,
                      missing=(missing,))
        outcomes.add(check_permission(basis))
        count += 1
    counts['required-source-missing'] = count
    # Explicitly vary declared strictness, rather than relying on enum order.
    for order in (VALUES, tuple(reversed(VALUES))):
        for picks, external in product(product(PICKS, repeat=4), SUBSETS):
            check_permission(Basis(external=external, picks=picks, strict_order=order))
    counts['declared-strictness'] = 2 * 256 * 8
    check_permission(Basis(valid=False))
    counts['invalid-input'] = 1
    assert outcomes == {'effective', 'denied', 'unavailable'}
    witnesses = {
        'omit-lock-bound': Basis(locks=(frozenset({'ask'}),), picks=('auto', None, None, None)),
        'omit-external-bound': Basis(external=frozenset({'ask'}), picks=('auto', None, None, None)),
        'override-active-prohibition.organization': Basis(picks=('deny', None, None, 'auto'), prohibitions=(True, False, False)),
        'override-active-prohibition.tenant': Basis(picks=('deny', None, None, 'auto'), prohibitions=(False, True, False)),
        'override-active-prohibition.session': Basis(picks=('deny', None, None, 'auto'), prohibitions=(False, False, True)),
        'default-deny-as-prohibition': Basis(picks=('deny', None, None, 'auto')),
        'outer-pick-first': Basis(picks=('ask', None, 'auto', None)),
        'fallback-before-legal-pick': Basis(external=frozenset({'deny', 'auto'}), picks=('auto', None, None, 'ask')),
        'invent-uniform-distance': Basis(external=frozenset({'deny', 'auto'}), picks=(None, None, None, 'ask'), distances=NONUNIFORM, strict_order=tuple(reversed(VALUES))),
        'weaker-distance-tie': Basis(external=frozenset({'deny', 'auto'}), picks=(None, None, None, 'ask')),
        'missing-source-allows': Basis(missing=('external-attestation',)),
    }
    negatives = []
    for name, basis in witnesses.items():
        actual = evaluate_permission(basis, name)
        permitted = permission_relation(basis)
        assert actual not in permitted, ('surviving negative control', name, basis)
        negatives.append({'name': name, 'expected': sorted(permitted), 'mutated': actual})
    return {'partitions': counts, 'cases': sum(counts.values()), 'negativeControls': negatives}


EXPECTED_METHODS = {
    'registerRequest', 'submitReply', 'invalidateWait', 'acknowledgeDelivery',
    'getRequest', 'getCard', 'listPool', 'getOperation', 'listDeliveries',
    'getWait', 'bindReceiver', 'readInbox', 'consumeDecision', 'getRecoveryOperation',
    'DecisionCommitter.register', 'DecisionCommitter.commit',
    'DecisionCommitter.inspect', 'DecisionCommitter.seal',
}
OPERATION_QUERIES = {'getOperation', 'getRecoveryOperation',
                     'DecisionCommitter.inspect', 'DecisionCommitter.seal'}


@dataclass(frozen=True)
class Call:
    shape: bool = True
    budget: bool = True
    access: bool = True
    binding: str = 'new'
    observation: str = ''


def handle_partition(method, call, original, mutation=None):
    """Finite boundary interpreter. This does not model any service state change."""
    if not call.shape:
        return {'tag': 'invalid-input'}
    if not call.budget:
        return {'tag': 'limited'}
    if not call.access and mutation != 'disclose-before-current-access':
        return {'tag': 'denied'}
    if call.binding == 'different':
        return {'tag': 'conflict'}
    if call.binding == 'same' and method['kind'] in ('write', 'commit'):
        if mutation == 'retry-allocates-new-result':
            return {'tag': original['tag'], 'result': {'new-allocation': True}}
        return original
    tag = method['observations'][call.observation]['tag']
    if mutation == 'uncertain-submit-is-failure' and tag == 'unknown':
        tag = 'unavailable'
    if mutation == 'absent-operation-is-sealed' and call.observation == 'uncertain-operation':
        tag = 'not-committed'
    result = {'tag': tag}
    if tag == 'unknown':
        result['operationRef'] = 'original-op'
    if tag == 'not-committed':
        result['sealReceipt'] = 'late-commit-blocked'
    if tag == 'committed':
        result.update(operationRef='original-op', method='original-method',
                      inputDigest='original-digest', result=original,
                      commitReceipt='original-participant-receipt')
    return result


def partition_requirements(method, call, original, result):
    """Independent boundary properties. No method state transitions are inferred."""
    if not call.shape:
        return result == {'tag': 'invalid-input'}
    if not call.budget:
        return result == {'tag': 'limited'}
    if not call.access:
        return result == {'tag': 'denied'}
    if call.binding == 'different':
        return result == {'tag': 'conflict'}
    if call.binding == 'same' and method['kind'] in ('write', 'commit'):
        return result == original
    if call.observation == 'uncertain-operation':
        return result == {'tag': 'unknown', 'operationRef': 'original-op'}
    if call.observation == 'provider-unavailable':
        return result == {'tag': 'unavailable'}
    if result['tag'] != call.observation:
        return False
    if call.observation == 'not-committed':
        return result.get('sealReceipt') == 'late-commit-blocked'
    if call.observation == 'committed':
        return (result.get('result') == original and
                result.get('method') == 'original-method' and
                result.get('inputDigest') == 'original-digest' and
                result.get('commitReceipt') == 'original-participant-receipt')
    return True


def command_cases(manifest):
    methods = manifest['methods']
    def check_method_inventory(rows):
        assert {row['method'] for row in rows} == EXPECTED_METHODS
        assert len(rows) == len(EXPECTED_METHODS)
    check_method_inventory(methods)
    counts = {}
    for row in methods:
        name = row['method']
        assert row['idempotency']['currentDisclosureBeforeReadback'] is True
        assert {'invalid-input', 'limited', 'denied', 'unavailable'} <= set(row['commonFailures'])
        assert row['unknown']['allowed'] == ('uncertain-operation' in row['observations'])
        assert row['unknown']['allowed'] == (row['kind'] != 'query')
        if name in OPERATION_QUERIES:
            assert row['success'] == ['committed', 'not-committed']
        declared = set(row['success'] + row['businessFailures'])
        observed = {entry['tag'] for entry in row['observations'].values()}
        assert declared <= observed
        assert all(entry['condition'] for entry in row['observations'].values())
        assert observed <= declared | {'unavailable', 'unknown'}
        bound = row['kind'] != 'query'
        assert row['idempotency']['sameIdentityDifferentDigest'] == ('conflict' if bound else 'not-applicable')
        # Identity witnesses vary by method. These sentinel values are not wire
        # fixtures and do not claim to validate unimplemented result schemas.
        original = {'tag': 'original-terminal-result' if row['kind'] == 'operation-query'
                    else row['success'][0],
                    'fields': {field: name + '-original-' + field
                               for field in row['idempotency']['stableResultFields']},
                    'receipt': name + '-original-receipt', 'inputDigest': 'original-digest'}
        outputs = set()
        count = 0
        for shape, budget, access, binding, observation in product(
                (False, True), (False, True), (False, True),
                ('new', 'same', 'different') if bound else ('new',), row['observations']):
            call = Call(shape, budget, access, binding, observation)
            result = handle_partition(row, call, original)
            assert partition_requirements(row, call, original, result), (name, call, result)
            outputs.add(result['tag'])
            count += 1
        allowed = declared | set(row['commonFailures']) | ({'unknown'} if row['unknown']['allowed'] else set())
        assert outputs == allowed, (name, outputs, allowed)
        counts[name] = count
    by_name = {row['method']: row for row in methods}
    controls = [
        ('uncertain-submit-is-failure', 'registerRequest', Call(observation='uncertain-operation')),
        ('absent-operation-is-sealed', 'getOperation', Call(observation='uncertain-operation')),
        ('disclose-before-current-access', 'submitReply', Call(access=False, binding='same', observation='decided')),
        ('retry-allocates-new-result', 'bindReceiver', Call(binding='same', observation='bound')),
    ]
    negatives = []
    for name, method, call in controls:
        row = by_name[method]
        original = {'tag': row['success'][0], 'allocation': 'original', 'receipt': 'original-receipt'}
        result = handle_partition(row, call, original, name)
        assert not partition_requirements(row, call, original, result), ('surviving negative control', name)
        negatives.append({'name': name, 'method': method, 'mutated': result})
    # Manifest omission is rejected independently of the interpreter.
    try:
        check_method_inventory(methods[:-1])
    except AssertionError:
        pass
    else:
        raise AssertionError('surviving negative control: omit-public-method')
    negatives.append({'name': 'omit-public-method', 'method': methods[-1]['method']})
    return {'methods': len(methods), 'partitions': counts, 'cases': sum(counts.values()),
            'negativeControls': negatives}


def main():
    if sys.argv[1:]:
        raise ValueError('Usage: check-semantics.py')
    manifest = json.loads((ROOT / 'command-algebra.json').read_text())
    results = {'scope': 'HJ0 finite reference relations and result closure; no production implementation or arbitrary-size proof',
               'permissions': permission_cases(), 'commands': command_cases(manifest)}
    print(json.dumps(results, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
