# Evaluation models

Behavior belongs to [SPEC](../../SPEC.md). Model execution and implementation tests are indexed in [verification](../README.md).

| Model | Positive commands | Negative controls | Scope |
| --- | --- | --- | --- |
| Evaluation | Six SAT witnesses and twelve UNSAT checks, named in check-evaluation.py | M1–M13 remove lock truncation, disable filtering, workspace restrictions, official facts, source-owner premise, cross-asset permission bounds, fitting picks, usableBy effects, and forbid bounds | Each original command keeps its embedded scope. Most use `for 6 but 4 Cap, 4 Assign, 3 Item, 3 Owner`; workspace checks use 5 Assign. |
| RootSettings | Two SAT witnesses and six UNSAT checks, named in check-root-settings.py | Six targeted controls remove root exclusion, projection, visibility, source consistency, outer locks, or inner overrides | `for 6 but 3 Cap, 5 Holding, 4 Assign, 3 Item, 3 Asset, 2 Owner, 2 Version`, bitwidth 4 |

Evaluation computes structural selection and source layers. It does not compute concrete values, tier distances, lockedAt, usableBy values, version selection, JSON DTO reading, cycle/unsupported failures, plugin enablement, or IO authorization.
Its root exclusion is constructed by definition, with no separate original assertion.
TeamAssetsStayInTree depends on the supplied InputHoldingsStayInTree fact. Removing that fact shows the premise is needed; it does not prove that evaluation authorizes inputs. TreeOwner includes all permitted current holding sources, including sharing, rather than only an organization tree.
RootSettings adds limited root/source-version and projection relations. It does not prove source-body authenticity, default strings, real value calculation, networking, or concurrency.

Run these from the repository root. Use the repository Python environment and installed Alloy command.

```sh
.venv/bin/python packages/core/asset-evaluation/verification/models/check-evaluation.py --output tmp/alloy/evaluation
.venv/bin/python packages/core/asset-evaluation/verification/models/check-evaluation.py --output tmp/alloy/evaluation --validity
.venv/bin/python packages/core/asset-evaluation/verification/models/check-root-settings.py --output tmp/alloy/root-settings
.venv/bin/python packages/core/asset-evaluation/verification/models/check-root-settings.py --output tmp/alloy/root-settings --validity
```

Each checker validates the exact receipt command set, run/check kind, and SAT outcome. An Alloy exit code of zero is insufficient. Positive checks require no counterexample, witnesses require instances, and every negative control requires its named counterexample. Mutation sites must match exactly or execution fails. Run outputs belong to tmp.
Finite scopes are assumptions, not proofs for arbitrary size. These models have no scheduling or fairness claim.
