# Settings SQL behavior

This provider implements the persistence part of [Settings](../settings/SPEC.md). Its public types and Schemas are owned by [the root source entry](src/index.ts). The application owns SQL assembly, qualification, coherent multi-target projections, and the shared provider lifetime.

## One-target transaction

The Settings participant reads and writes only `st_states`, `st_operations`, and `st_changes`. Its required currentness fact comes from a preceding owner participant in the same SQL transaction. The fact binds domain, trusted principal, complete command, server digest, current definition, grants, and source layout. It cannot be supplied as a caller assertion.

The participant reads current assignment state inside that transaction, then calls `decideSettingsChange`. A stale expected revision returns `revision_conflict`; only one competing command against the same revision can change state. Settings does not accept a precomputed mutation as the committed result.

A successful decision stores assignment state, the revision, the value-free original-operation result, and any value-free change record together. A later participant's rejection rolls back these writes together. A no-op records its original result but does not increment the revision or append a change. A raw assignment or lock change increments the revision even when a more specific source masks its effective value.

Existing assignment state requires the same complete definition reference and ordered source layout. A different definition returns `definition_changed`; a different source layout returns `basis_changed`. This version has no implicit definition migration, source migration, cross-target transaction, or destructive target cleanup operation.

Secret item commands return `unsupported`. This provider is not a secret vault and does not introduce a secret read API. No state-changing secret value is accepted. Its operation and rejection receipts contain identity/digest metadata, not command values. Owner participants must preserve the same output restriction.

## Retry and original result

The server canonicalizes and hashes semantic commands with SHA-256. It does not accept a client-reported digest. Domain, principal, full target and operation identity select an original operation. Only `requestId` is excluded from the semantic digest. Changing the expected revision, definition, source, item, action or value changes that digest.

Retries with the same semantic input return the original terminal result without reapplying the change. Different input under the same identity returns `operation_conflict`. Transactional rejections remain recoverable through SQL receipts. Failures before SQL acceptance have no durable result and may be retried after the cause is resolved.

The strict business replay guarantee requires successful participation or a guard rejection conforming to the published schema. A damaged guard can cause Storage to record `fact_violation` before a business binding is available. That operation returns `unsupported`, makes no assignment changes, and is not automatically retried. This path cannot precisely distinguish business payload conflicts and does not satisfy the qualified replay guarantee.

Storage's `unknown` remains `unknown`. `getOperation` maps an authoritative `not_committed` proof to `not_found`; missing responses or unrecognized receipts do not establish absence. Shared Storage close, worker failure, SQL limits and unsupported assembly remain explicit failures or unknown results.

## Authorized reads

All public reads consume the owner's access adapter and validate its returned scope and target. The owner must authorize all data held in that concrete target. `readState` does not enumerate scopes, combine private sources, or independently assert owner projection consistency.

Changes contain only revision, operation identity, item identity and source identity. Pages read at most 100 changes and provide the last delivered revision only when another page exists. Each page rechecks access. A change stream is incremental recovery information; it is not a catalog snapshot or a consumer adoption receipt.

## Lifecycle and evidence

`close` rejects new calls, drains calls already accepted by this backend, and returns the same promise on repeated calls. The backend does not release the shared SQL provider. The caller closes that provider with its own public control and observes residuals if close is incomplete.

The commit port does not expose transport cancellation. Storage observation cancellation cannot withdraw an accepted operation. Callers retain the original identity and recover an unknown result.

Real SQL tests and SIGKILL recovery support provider conformity under their tested conditions. They do not prove production owner qualification, cross-domain Identity atomicity, OS-crash recovery, physical power-loss behavior, or complete system adoption. See [verification instructions](README.md#verification).
