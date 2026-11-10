"""The finite reference relation of permission evaluation (HJ0), never production conformance.

The oracle is a relation over candidates: it returns every result that set membership and the
dominance clauses permit. `oracle-cases.py` emits its expectations for the production evaluator.
"""
from dataclasses import dataclass

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
