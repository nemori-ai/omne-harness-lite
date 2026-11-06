"""Emit HJ0 relation expectations; never call its reference evaluator."""
import importlib.util
import itertools
import json
from pathlib import Path
import sys

path = Path(__file__).resolve().parents[3] / 'human-intervention/human-intervention/verification/check-semantics.py'
spec = importlib.util.spec_from_file_location('hj0_relation', path)
oracle = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = oracle
spec.loader.exec_module(oracle)


def emit(partition, basis):
    expected = list(oracle.permission_relation(basis))
    assert len(expected) == 1
    print(json.dumps([partition, {
        'external': None if basis.external is None else sorted(basis.external),
        'locks': [None if bound is None else sorted(bound) for bound in basis.locks],
        'picks': basis.picks, 'prohibitions': basis.prohibitions,
        'missing': basis.missing, 'distances': basis.distances,
        'strictOrder': basis.strict_order, 'valid': basis.valid,
    }, expected[0]], separators=(',', ':')))



if '--witnesses' in sys.argv:
    witnesses = {
        'omit-lock-bound': oracle.Basis(locks=(frozenset({'ask'}),), picks=('auto', None, None, None)),
        'omit-external-bound': oracle.Basis(external=frozenset({'ask'}), picks=('auto', None, None, None)),
        'override-active-prohibition.organization': oracle.Basis(picks=('deny', None, None, 'auto'), prohibitions=(True, False, False)),
        'override-active-prohibition.tenant': oracle.Basis(picks=('deny', None, None, 'auto'), prohibitions=(False, True, False)),
        'override-active-prohibition.session': oracle.Basis(picks=('deny', None, None, 'auto'), prohibitions=(False, False, True)),
        'default-deny-as-prohibition': oracle.Basis(picks=('deny', None, None, 'auto')),
        'outer-pick-first': oracle.Basis(picks=('ask', None, 'auto', None)),
        'fallback-before-legal-pick': oracle.Basis(external=frozenset({'deny', 'auto'}), picks=('auto', None, None, 'ask')),
        'invent-uniform-distance': oracle.Basis(external=frozenset({'deny', 'auto'}), picks=(None, None, None, 'ask'), distances=oracle.NONUNIFORM, strict_order=tuple(reversed(oracle.VALUES))),
        'weaker-distance-tie': oracle.Basis(external=frozenset({'deny', 'auto'}), picks=(None, None, None, 'ask')),
        'missing-source-allows': oracle.Basis(missing=('external-attestation',)),
    }
    for name, basis in witnesses.items():
        emit(name, basis)
    sys.exit(0)

for external, first, second, picks, distance in itertools.product(
        oracle.SUBSETS, oracle.SUBSETS, oracle.SUBSETS,
        itertools.product(oracle.PICKS, repeat=4),
        (oracle.UNIFORM, oracle.NONUNIFORM, None)):
    emit('bounds-picks-comparison', oracle.Basis(external, (first, second), picks, distances=distance))
for external, picks, prohibitions in itertools.product(
        oracle.SUBSETS, itertools.product(oracle.PICKS, repeat=4),
        itertools.product((False, True), repeat=3)):
    emit('default-and-three-active-prohibitions', oracle.Basis(external, (), picks, prohibitions))
for picks, missing, lock in itertools.product(
        itertools.product(oracle.PICKS, repeat=4),
        ('external', 'declaration', 'organization', 'tenant', 'session', 'lock'), oracle.SUBSETS):
    emit('required-source-missing', oracle.Basis(
        None if missing == 'external' else frozenset(oracle.VALUES),
        (None, lock) if missing == 'lock' else (lock,), picks, missing=(missing,)))
for order, picks, external in itertools.product(
        (oracle.VALUES, tuple(reversed(oracle.VALUES))),
        itertools.product(oracle.PICKS, repeat=4), oracle.SUBSETS):
    emit('declared-strictness', oracle.Basis(external=external, picks=picks, strict_order=order))
emit('invalid-input', oracle.Basis(valid=False))
