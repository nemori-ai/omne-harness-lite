# Clock reservation verification

`models/ClockLease.tla` checks a bounded reservation protocol with two concurrent
requests, wall times from 0 through 6, and a reservation width of 2. The wall clock
can move in either direction. Durable commit and receipt confirmation are separate
steps. The bound permits two successful extensions in one lifetime. The model includes definite no-write, unknown receipts, close, crash, and
restart. Unknown receipts retain the old confirmed range. Conditional reclamation
uses the last write confirmed by this owner; an unconfirmed higher write is retained.

`ClockLease.cfg` checks type consistency, nondecreasing published time, durable
coverage before publication, and a fresh wall-clock sample at publication.
`EarlyPublish.cfg`, `StaleSample.cfg`, and `EarlyRelease.cfg` each remove one guard.
Each negative configuration must produce an invariant counterexample. A successful
negative run without a counterexample is a verification failure.

Run from the repository root:

```sh
tlc -workers 1 -noGenerateSpecTE \
  -metadir tmp/clock-lease-model \
  -config packages/infra/clock-lease/verification/models/ClockLease.cfg \
  packages/infra/clock-lease/verification/models/ClockLease.tla
```

Repeat with each negative configuration and a different `-metadir`. Record exit
status and the violated invariant. Keep generated traces and run logs in `tmp/`.

This model checks safety in a finite abstraction. It does not prove liveness,
arbitrary-scale behavior, worker shutdown, filesystem sync, or physical durability.
SQLite commits and exclusion are assumptions. Real provider tests check worker
exit, native transaction results, held owner locks, and close drain. Clock tests
check retry bounds, concurrent reservation sharing, rollback, explicit resource
creation, resource identity, and backup-floor adoption.
