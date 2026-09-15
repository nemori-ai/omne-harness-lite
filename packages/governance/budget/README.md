# `@omne-harness-lite/budget`

Pure budget-accounting values, durable-record decoding, exact Money operations, and deterministic
recovery for the accepted `budget` record owner.

The default entry exports the budget, period, source, attempt, allocation, meter-fact, and ledger
types. Results use the shared `Checked` / `ValidationIssue` shape from `@omne-harness-lite/work-data`
(one definition per concept, as the tenant package does); the budget failure category
(`money`, `revision`, `causality`, …) is the message prefix. It also exports:

- `validateMoney`, `rescaleMoney`, `addMoney`, `subtractMoney`, `compareMoney`, and `maxMoney` for
  exact integer arithmetic without floating-point conversion or currency mixing;
- `decodeBudgetEnvelope` and `decodeBudgetLine` for complete journal-codec and budget-record
  validation;
- `createBudgetLedger`, `applyBudgetEnvelope`, `foldBudgetEnvelopes`, and
  `decodeAndFoldBudgetLines` for immutable recovery; and
- `readAttemptExposure` for the current `C + R`, unknown-liability, quality, and finite-bound
  violation view of one charge attempt.

Recovery retains immutable budget identities, every period identity, original attempt allocations,
unknown exposure, meter revision history, source indexes, threshold delivery state, and explicit
terminal evidence. A budget-owned stream advances once per committed batch that touches it. This
journal counter is independent of budget, source, and meter-fact business revisions.

The package interprets already saved records. Its hard-limit and source-posture checks reject
persisted transitions that contradict the adopted accounting rules, but they do not grant runtime
admission. Evidence references remain data: decoding them does not establish that their authority
is trusted or that a cost occurred. A `final` meter component, a finished Run, a disconnect, or a
restart does not reconcile an attempt.

`createBudgetHost`, `BudgetPlugin`, and `registerChargeSourceFacts` are intentionally absent. The
runtime owner, current tenant qualification, live CostSource recognition, joint admission,
durability, and execution composition belong to later slices.

From this leaf, run:

```sh
pnpm run build
pnpm run typecheck
pnpm run test
```

The adopted language-neutral contracts and provider mapping are linked from
[design.md](./design.md). Verification scope and reproducible public-consumer inputs are under
[`evidence/records-recovery`](./evidence/records-recovery/README.md).
