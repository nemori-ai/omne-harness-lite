"""Finite contract oracle for scoped release; this is not a production registry test."""
import hashlib
import itertools
import json
from pathlib import Path


def release(entries, trusted_scope, token, fault="none"):
    if trusted_scope != token[:2] and fault != "scope":
        return "denied", entries
    if fault == "generation":
        remaining = frozenset(e for e in entries if e[:2] + e[3:] != token[:2] + token[3:])
    elif fault == "siblings":
        remaining = frozenset(e for e in entries if e[:2] != token[:2])
    else:
        remaining = entries - {token}
    return "released", remaining


def satisfies(entries, trusted_scope, token, outcome):
    status, remaining = outcome
    allowed = trusted_scope[0] == token[0] and trusted_scope[1] == token[1]
    if not allowed:
        return status == "denied" and remaining == entries
    if status != "released":
        return False
    # Per-entry membership is independent of the set-removal implementation.
    for entry in entries | {token}:
        expected = entry in entries and any(a != b for a, b in zip(entry, token))
        if (entry in remaining) != expected:
            return False
    return remaining <= entries


def main():
    tokens = list(itertools.product(("tenant-a", "tenant-b"),
                                   ("service-a", "service-b"), (1, 2), (1, 2)))
    scopes = list(itertools.product(("tenant-a", "tenant-b"), ("service-a", "service-b")))
    states = [frozenset(c) for size in (0, 1, 2)
              for c in itertools.combinations(tokens, size)]
    partitions = list(itertools.product(states, scopes, tokens))
    for entries, scope, token in partitions:
        outcome = release(entries, scope, token)
        assert satisfies(entries, scope, token, outcome)
        assert release(outcome[1], scope, token) == outcome
    negative = {}
    for fault in ("scope", "generation", "siblings"):
        witness = next((p for p in partitions
                        if not satisfies(*p, release(*p, fault=fault))), None)
        assert witness is not None, fault
        entries, scope, token = witness
        negative[fault] = {"entries": sorted(entries), "trustedScope": scope, "token": token}
    path = Path(__file__).resolve()
    contract = path.parents[3] / "assets/docs/governance-contributions.md"
    print(json.dumps({"kind": "finite-contract-oracle", "partitions": len(partitions),
                      "negativeControls": negative,
                      "inputs": {str(p): hashlib.sha256(p.read_bytes()).hexdigest()
                                 for p in (path, contract)},
                      "limits": ["Two tenants, two services, two generations, two contributor slots",
                                 "At most two live leases; abstract transition only",
                                 "No production registry, database or Cordis conformance"]}, indent=2))


if __name__ == "__main__":
    main()
