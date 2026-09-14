# Tenant membership record evidence

This increment covers strict decoding and pure folding for the accepted bootstrap, personal-index,
tenant creation, and member-change record shapes. It rejects unknown kinds and versions, malformed
counters and identities, personal-owner violations, organization roots without an active
`super_admin`, skipped member revisions, and reuse of a consumed membership join.

[red.log](./red.log) is the first Vitest run before the decoder/fold existed. [green.log](./green.log)
is the final unit, build, and strict typecheck result for this increment. [sources.txt](./sources.txt)
fixes the language-neutral contracts, provider design, and actual shared public sources used.

The first implementation keyed consumed joins by a tenant-wide bare `Counter`. That rejected two
different members whose valid membership identities both used `joinedRevision="1"`, a restriction
absent from the adopted design. [join-scope-red.log](./join-scope-red.log) records that direct
counterexample. The correction keys history by the complete `(MembershipRef, joinedRevision)` pair;
different members may share a counter, while the same member cannot reuse an earlier join basis.
[join-scope-green.log](./join-scope-green.log) records the corrected tests, build, and strict
typecheck. This is a correction of an implementation overconstraint, not a new tenant policy.

The fold checks cross-member invariants on the final record group passed to it. It does not choose a
storage-provider stream-revision algorithm, persist a batch, recognize an active `GateFrame`, or
prove recovery from the real JSONL provider. Those remain separate integration obligations.
