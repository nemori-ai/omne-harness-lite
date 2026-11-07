# Settings local behavior

This package implements local persistence and catalog capture for [Settings](../settings/SPEC.md). Public types and runtime Schemas belong to [src/index.ts](src/index.ts); the opt-in Identity composition is exported by [src/identity.ts](src/identity.ts). The caller owns registration, trusted capability distribution, the shared SQL provider, and Identity lifecycle.

## One-target persistence

`settings.persistence` owns `st_states`, `st_operations`, and `st_changes`. It reads current state inside the tenant transaction and invokes `decideSettingsChange`. A stale expected revision returns `revision_conflict`. Only one competing command against the same revision can change that state.

A successful change stores assignments, their revision, the value-free original result, and a value-free change record in one transaction. A later participant rejection rolls them back together. A genuine no-op records its original result without incrementing the revision or appending a change. A raw assignment or lock change increments the revision even when another source masks its effective value.

Ordinary changes require the complete current definition reference and the same ordered source layout. Definition mismatch returns `definition_changed`; source-layout mismatch returns `basis_changed`. There is no implicit migration, cross-target assignment transaction, or destructive target cleanup operation. Explicit deployment maintenance is defined below.

Secret item commands return `unsupported`. The provider accepts no state-changing secret value and exposes no secret vault or secret plaintext read API. Persistence and owner rejection receipts must omit command bodies and assignment values.

## Target qualification

A preceding participant in the same SQL transaction must supply `settings.current`. Its binding covers the domain, trusted principal, complete command, and server-computed digest. Its payload supplies the current definition, exact definition reference, grants, and ordered sources. Settings verifies the digest, declaration identity, target binding, allowed action, and source membership. A boolean, prior access result, missing fact, or caller assertion cannot authorize a write.

`settingsSqlOperationBinding` produces the value-free operation binding used in receipts. A qualified owner rejection uses `SettingsSqlGuardRejectionSchema` and returns `conflict` or `unsupported`. The guard must coordinate every real writer that changes target existence, qualification, definition, or source layout in its transaction domain.

In the catalog composition, the independent and Asset owners each produce their named fact, `settings.standalone-projection` and `settings.assets-projection`. Both use `settings-projection/1` and the exact `SettingsProjectionBinding`. `settings.target-guard` requires both facts and translates one qualified target into `settings.current`. Mismatched bindings, duplicate complete targets, and more than 128 projected targets fail the transaction. No target yields `forbidden`. An assembly without Assets explicitly produces an empty Asset projection through `settings.without-assets`; it does not fabricate Asset ownership.

The central composition installs `settingsStandaloneMaterials({ settingsGuard: false })`. The direct independent persistence composition may instead use default materials and `standaloneSettingsGuards`. A combination must not register competing producers of `settings.current`.

## Independent target ownership

`settings.targets` owns `st_targets` and `st_definitions`. `createStandaloneSettingsOwner` is a trusted provisioning capability, not a tenant setting service. Provisioning validates the declaration, computes its canonical digest, and binds the target to a tenant scope with policy `independent`. The same provider, definition, and version identity cannot acquire different declaration content.

Provision and retire operations use owner revisions to reject stale editors. A retired record cannot be provisioned again under the same complete target identity. Retirement removes that target from qualified projections and prevents later writes, while preserving assignment and operation history. Owner revision and assignment revision are separate counters. Owner operation recovery returns the original receipt; Storage-confirmed `not_committed` maps to `not_found`. An indeterminate Storage result remains `unknown`. Neither observation revokes the owner capability or seals a future attempt.

Target records specify allowed source slots and actions. They do not authorize copying another tenant's values or shared organization values into those slots. Every access grant must permit reading all persisted sources in that concrete target.

## Current publication references

The trusted standalone owner can associate a complete publisher, definition and version reference with a target through its existing provision command. A null reference leaves the target usable as ordinary Settings without claiming an original publication. Changing or clearing the reference uses the same owner revision check and transaction as the definition update. The reference is part of the original command identity's immutable content. It does not authorize execution or prove a publisher's statement.

`settings.targets` owns the optional one-to-one `st_target_publication` relation. Its primary and foreign key is the complete stored target key. A named additive migration creates this relation without inferring references for existing targets. Target records, existing source reservation snapshots, values and original receipts retain their existing shape and contents. Retirement retains the association for custody but removes the target from current capture.

Publication capture produces the existing Settings projection and a separate standalone publication fact from the same owner read in one transaction. Both retain the complete capture binding, target, definition reference and owner revision. The publication fact reports a null reference explicitly. The consumer must compare the complete original declaration with its trusted publisher, and separately verify current execution availability. It must not infer a publication from a matching Settings definition or promote the stored reference into permission.

Capture remains bounded by 128 requested targets and the existing byte budget. Each publication association uses a target-key point lookup. A requested missing or retired standalone target is refused rather than omitted from a successful complete capture. Other owner policies remain the responsibility of their own projection providers.

## Coherent catalog capture

`createSettingsCatalog` verifies an issued acting-for-tenant principal, the fixed deployment, the tenant transaction domain, and every explicitly requested target scope. Each read obtains a fresh Identity standing reservation for its unique capture operation and the configured qualifications. It does not reuse a prior page's permission decision.

One tenant SQL transaction consumes the capture terminal, obtains both owner projections, and reads Settings assignment state through `settings.snapshot`. Only each owner reads its own authority tables. The snapshot participant reads `st_states`, not Asset or Identity tables. Capture does not change assignment revisions or grant write rights. It does create an operation terminal and SQL receipt for coordination.

Every explicitly requested target must appear in the qualified projections. A declaration must validate and match its exact reference digest. Persisted state must match that reference and the ordered source layout. A definition mismatch returns `definition_changed`. A source identity or order mismatch returns `basis_changed`. Invalid evaluation returns `incompatible`.

The registry generation is read before capture and checked again after settlement. A change returns `basis_changed`. Available definitions must match complete references, including digest. Missing declarations are omitted from management entries and reported through `partial` plus `unavailableProviders`. Runtime capture with a missing declaration returns `unavailable`. Settings evaluation also rejects a partial basis. An empty catalog does not by itself prove completeness.

The captured revision binds projected owner facts, included state, catalog incarnation, registry generation, expiry epoch, and selection digest. The Settings query layer also binds cursors to scope, view, filter, locale, page size, and offset. Every page recaptures. Any basis or query mismatch returns `basis_changed`, rather than combining generations.

The expiry epoch is `floor(maximumObservedTime / cursorLifetimeMs)`. The configured lifetime must be a positive safe integer. Crossing an epoch invalidates prior cursors, so a cursor can expire sooner than a full lifetime after issuance. Within one catalog instance, an observed later epoch cannot revert after wall-clock rollback. Restart generates a new incarnation. This mechanism is not a durable monotonic clock or an elapsed-time guarantee during an unobserved clock rollback.

Capture is bounded by public Schemas and input budgets. Owner facts admit at most 128 targets, each with at most 32 distinct source slots. The serialized captured basis is limited to 512 KiB. SQL storage has additional admission, command, response, and retention limits. There is no retained snapshot cache or package-owned automatic receipt collection.

## Runtime selections

Management discovery does not require runtime selection. Runtime reads require a nonempty explicit target list and a selection reference. The configured selection source must return the same deployment and exact ordered targets for the verified principal. A missing source returns `unsupported`; a mismatched selection returns `forbidden`.

`createSettingsSelections` stores bounded, expiring in-memory intent records for verified principals. Creation rejects duplicate targets. Resolution re-verifies the principal. Expired records are removed when observed; the holder tracks the maximum observed clock value. Expiry cannot revive after an observed clock rollback. Release, close, or process loss removes the selection.

A valid selection establishes consumer intent only. Every target still requires fresh owner and Identity qualification. Selection does not grant ownership, activate a target, or establish executor adoption. This package has no Assembly execution-adoption receipt.

## Declaration availability and target invalidation

Registry registration and release control declaration availability in the process. Release preserves persistent assignments and operation history. A reload of the same exact declaration can make those values readable again.

Registry unload is not atomic write-authorization removal. A pending write that already passed a read check can still commit if the authoritative target guard remains valid. To invalidate a target, the trusted owner retires the independent target or removes or changes the Asset holding through its transaction protocol. Those owner changes serialize with Settings target qualification. An Asset holding recreated under a different identity does not inherit another target's values.

## Trusted deployment rebase

`createSettingsMaintenance` is a deployment-owner capability. The assembly fixes `ownerRef`, tenant domain, storage combination, and projection commands. It uses principal identity `maintenance/<ownerRef>`. It deliberately bypasses the ordinary Identity principal, standing, and reservation route. It must not be exposed as an ordinary tenant or tool command. Its holder is responsible for authority to retain or discard the target's assignments.

`rebase` requires exact `from` and `to` definition references, the expected assignment revision, and one explicit `retain` or `discard` choice for every existing assignment. Missing, duplicate, or extra choices return `invalid_input`. Retained assignments must have a source and item in the new basis and pass evaluation. Incompatible retained data returns `incompatible`. No display-name matching or automatic conversion occurs.

The rebase still consumes the operation terminal and current projections from the same target owner through the central guard. An invalidated target cannot be rebased. State, exact new definition reference, original result, value-free rebase change, and terminal commit together. A changed basis increments the assignment revision; an identical basis can record a no-op. Expected revision and exact reference conflicts remain explicit failures.

Catalog capture rejects mismatched old state until successful rebase. Raw authorized `readState` remains a persistence inspection API and returns the stored reference, state and source provenance; it is not an evaluated current catalog. Rebase retry and lookup use the fixed maintenance identity and original operation binding. Tenant qualification revocation does not revoke this separate deployment capability.

## Terminals, retry, and unknown results

`settings.terminal` owns `st_terminals`. A normal operation consumes an absent terminal inside the same transaction as its effects. Trusted sealing turns an absent terminal into `aborted`, or returns its existing `committed` or `aborted` terminal. A terminal cannot be replaced or reopened. A late operation cannot commit after an aborted seal.

The operation identity comprises domain, principal, complete target, and `operationId`. The server hashes the semantic command with SHA-256 over canonical JSON. Only transport `requestId` is excluded. Matching retries return the original result. Different content under that identity returns `operation_conflict`, even after later revisions.

This replay guarantee covers successful participation and owner rejections conforming to the published binding schema. A damaged guard can cause Storage `fact_violation` without a usable business binding. That path returns `unsupported`, changes no assignments, and is not automatically retried. It cannot precisely distinguish business payload conflicts.

Storage `unknown` remains undetermined. Recover the same operation identity. `getOperation` maps `not_committed` to `not_found` only when no terminal exists. An aborted terminal without a prior business receipt gives `basis_changed`. A prior qualified rejection preserves that rejection. Absence, cancellation, timeout, or service close cannot release an Identity reservation. [Identity coordination](docs/coordination.md) defines settlement.

## Authorized reads and lifecycle

`readState`, `getOperation`, and `readChanges` call the configured access adapter again. The backend requires exact scope and target equality. Denied access must not disclose historical operation existence. Revocation can prevent readback without changing prior successful effects. A custom adapter's access check is not atomic write authorization; the transaction guard supplies that evidence.

Changes contain no assignment values. Ordinary changes identify revision, operation, item, and source. Rebase changes identify revision and operation. A page contains at most 100 changes and returns the last delivered revision as continuation only when another page exists. A change stream is not a catalog snapshot or an adoption receipt.

Backend, owner, maintenance, and catalog close operations stop their own admission and drain their accepted mutations or captures. They do not close shared SQL or Identity dependencies. The registry and selection holder have separate synchronous close operations. Unresolved reservations remain Identity recovery work.

The public commit port has no cancellation operation. Cancelling a Storage observer cannot withdraw accepted SQL. Worker failures, SQL limits, unsupported registration, and incomplete shared-provider close retain explicit failure or unknown semantics under the [SQL contract](../../storage/sql-contract/SPEC.md).

## Verification boundary

[tests/README.md](tests/README.md) owns current test entry points and distinguishes guard fixtures, real Identity composition, persistent independent targets, catalog capture, and Asset-owned combination tests. Source and tests do not establish independent acceptance or deployment adoption. Remote authentication, final UI, tools or Cordis plugin delivery, Calendar adoption, OS crashes, and physical power-loss recovery are outside this package's evidence.

## Source identity and persisted provenance

Owner commands supply ordered stable source identities. A source identity includes its ID, owner, scope kind and scope subject. No layer is inferred from its ID. In particular, an ID named `organization` can have an explicitly declared `owner` scope. Source IDs are unique within the complete target. A layout contains one to 32 sources.

The owner projects each source with its current persisted owner revision as `authorityRevision`. Provisioning commands cannot supply this revision. The revision describes the local owner's facts, not a proof of external Identity, Session or organization qualification. Those providers retain their own verification duties. Catalog entries preserve the complete descriptors so consumers do not reconstruct authority from names.

Assignment records store the stable layout they adopted. A bound record must have the same ordered IDs as its assignment state. Current evaluation and ordinary writes require exact ordered equality of stable identities with the owner projection. Changing only the owner's authority revision does not change value ownership. Changing an owner, scope kind, subject or order requires an explicit rebase.

Rebase may retain an assignment only when its complete stable source identity exists on both sides. Reordering can retain values after explicit rebase. A different owner or subject cannot inherit them under the same source ID. A binding change increments the assignment revision even if values are empty or unchanged. Revision exhaustion rejects that change. The adopted layout, state, result and change record commit together.

Named source-layout migrations preserve historical records that lack identity evidence as `unmapped`. They preserve IDs, values, grants, retirement and original receipts. They do not infer identities. Each migration reads primary-key pages of at most 64 records and validates existing bound or unmapped records. Malformed explicit provenance fails migration or verification.

An unmapped independent owner cannot emit a current projection. The trusted owner must supply a complete layout. Unmapped assignment provenance remains unavailable to current evaluation and ordinary writes even after this owner mapping. Explicit rebase must discard every old assignment before it binds to the new identities. An empty unmapped state also requires explicit rebase. Authorized raw storage inspection exposes the unmapped state for maintenance and does not declare its values current.

## Durable intent relations

The persistence owner's material set installs `st_governance_intent` and `st_governance_attempt` through a separate migration. These relations prepare the storage boundary for the adopted preparation protocol. The current command provider does not yet write them or implement `SettingsPreparationPort`.

A root key binds its principal, complete target and business operation within the fixed storage domain. A second unique constraint protects those components independently of the key encoding. Each attempt belongs to one root. Attempt IDs are globally unique within that domain. A partial unique index permits at most one prepared or submitted attempt per root. Attempt numbers range from 1 to 64. A next-attempt value of 65 means allocation is exhausted, not that the root is cancelled.

Root state constrains result and abort-reason columns. Pending recovery has a partial index ordered by root key. Exact attempt lookup uses its unique ID index. Foreign keys remain within `settings.persistence`. Read-only planners use declared read permissions; other owners consume explicit facts.

These constraints do not by themselves preserve command immutability or prevent terminal revival. The sole persistent writer must enforce the [root and attempt model](../settings/verification/README.md#原操作与准备尝试). Existing values, receipts and old terminals remain unchanged by this migration. Switching providers still requires draining old held reservations and explicitly preserving historical results. The presence of these tables does not complete that upgrade or authorize a direct-commit fallback in the final assembly.

### Preparing allocation

`preparing-migration.ts` adds an explicit preparing phase and a stored comparison plan. Preparing has no ready basis. The live-attempt index includes preparing, prepared, and submitted. An aborted attempt can lack a basis when preparation never completed.

The migration requires the unpublished intent relations to be empty. No previous production writer populated those relations. Unexpected records stop the upgrade before either relation changes. This check does not delete or reinterpret existing Settings values, changes, or operation receipts. The original migration remains unchanged.

`intent-records.ts` provides the private persistence participant operations for allocating and reading an intent. The caller must run allocation inside an existing SqlStorage transaction after trusted admission. This module does not authenticate callers, acquire external holds, or authorize a business commit. It is not exported as a public backend.

Allocation preserves the full original command. A different transport requestId can recognize that command, but a changed semantic command returns operation_conflict. An existing active attempt returns its original ID and comparison plan. A terminal root returns its original status. Only an open root without an active attempt can allocate a successor, within the 64-attempt budget. Root insertion, attempt insertion, and sequence advancement share the enclosing transaction.

Reads use two indexed point queries, each with LIMIT 1. They validate the stored command binding, attempt sequence, plan target, ready-basis digest, and exact SQL destination identity. They do not write or settle anything. The plan stores a SettingsCurrentBasis comparison projection. External reservation requests and custody checkpoints remain separate obligations and are not implemented by allocation.

Tests exercise this writer through the real SQLite Worker with a test participant replacing admission. They cover concurrent allocation, rollback, reopen, immutable commands, exact-ID collisions, terminal recognition, and budget boundaries. Seeded terminal/history records test recognition; they do not prove the production seal service. Checkpoint, ready, business-commit and recovery plans use production participants. The prepared coordinator and Identity attempt resolver consume these phases. Organization current/update assembly and application consumer migration remain incomplete.

## Preparation checkpoint transaction

The private checkpoint combination uses the same persistence, terminal and source owners as ready, business commit and recovery. Its read-only planner accepts a bound command from the trusted coordinator fact. It does not accept a client-selected plan or participant list. Allocation requires qualified coordinator admission. Custody recording preserves a previously requested obligation and does not require renewed permission to perform the business action.

Checkpoint commands distinguish allocation, Standing plan/request/held/settled, source manifest/request/receipt. Each binds the original domain, principal, operation, command kind, digest and exact attempt. Source-update allocation starts its exact gate in the same transaction that inserts the root and attempt. Recognition of existing work does not start another gate. Contention, ID collision or downstream failure rolls back both effects. An existing root cannot change between an ordinary target change and a source update.

A checkpoint cannot publish prepared, commit values or establish a business terminal. A late held receipt remains recordable on its original cancelled or sealed attempt. A settled receipt requires that attempt's terminal and matching outcome. It cannot revive the attempt or change a successor. The coordinator obtains authentic receipts from the actual owning services; structural validation is not proof of receipt provenance.

The private preparation read handler returns root, exact attempt, Standing custody, one source member, or a bounded source metadata page. It uses existing indexed owner reads and never seals, advances or settles work. Pages contain at most 64 members; the handler permits at most 67 rows including root, attempt and manifest. The public coordinator must establish current disclosure authority before calling it. These internal reads do not grant callers access.

Production combination tests cover allocation, custody, ready and business commit without fixture writes to the preparation relations. Named fixtures still provide coordinator admission, current material and external receipts. These tests do not establish public preparation access, external reservation orchestration or full C3b acceptance.

## Identity reservation custody

`standing-custody.ts` supplies private persistence operations for an attempt's Identity request and receipt. `st_intent_standing` belongs to settings.persistence and references that owner's attempt relation. Its primary key permits one request per exact attempt. Its unique reservation ID prevents two custody records from claiming the same Identity reservation. State constraints require receipts for held and settled records, and an outcome only for settled records.

The plan stores the complete StandingBinding and normalized qualifications before an external reserve call. The binding includes the original principal, canonical tenant, fixed destination, exact attempt ID, recovery envelope and command digest. An existing plan cannot change destination, scope or qualifications. A requested checkpoint means the call may have happened. A lost reply must be recovered using this original request.

New plans and request admission require an open root and a preparing attempt. Receipt recording can address an exact historical attempt after it becomes terminal. It validates the full request and reservation ID. A held reply cannot replace a settled receipt. A contradictory terminal outcome returns operation_conflict. A receipt for an old attempt does not change its successor or the root result.

These functions accept receipts only from the trusted owning participant. Shape validation and a deterministic reservation ID do not authenticate a caller or prove an external hold. The future coordinator must obtain actual results from Identity's public reservation service. Identity and the destination terminal enforce release ordering. Recording a settlement receipt does not itself release a reservation, seal an attempt, or publish a ready basis.

Custody readback uses indexed root, exact-attempt and custody lookups, each with LIMIT 1. It reads at most three rows and performs no writes. Private allocation/custody helpers are not exported through the package entry. Current production tenant commands do not use this new preparation path yet.

## Source retention relations

`source-retention-schema.ts`, `source-retention-migration.ts` and `source-retention-records.ts` define the private source retention mechanism. Its owner is settings.source-retention. It owns only st_source_gate and st_source_reservation. settingsSqlMaterials installs the source relations and retention participant. Direct assignment, rebase and independent-target writers consume its same-transaction write permission. Prepared business transactions can complete the exact source gate with the root result. Authenticated source admission, public coordination and destination resolution remain incomplete.

A retained source identifies a complete Settings target in a fixed storage domain. A gate protects its definition, layout, values and locks together. An inheritance sourceId or an item name is not this gate's identity. Each gate stores one pending root update, with the full immutable identity and command digest. Another root is blocked. The same root with changed content conflicts.

A reservation binds the complete source and destination. Its identity includes the destination owner, root and exact attempt. The fixed route and command digest are stored and checked in full. An existing reservation is recognized before checking a pending gate. It returns the original snapshot or terminal outcome. A changed binding under that identity conflicts. A new reservation cannot enter a pending gate. Each source permits at most128 held reservations.

The snapshot includes the current target projection and Settings state, including locks. It distinguishes absent assignments from present state. An absent state has revision zero and no assigned values. A trusted source-snapshot participant must obtain this data in the source transaction. The private record writer does not authenticate a caller or turn user-provided JSON into a current fact.

Successful update completion requires zero held reservations. Aborting an update may clear its exact gate while retaining existing holds. Neither action releases those holds. Gate completion must share the root and attempt terminal transaction. The helper does not write these other owners' tables. The caller must validate the root lifecycle before beginning an update; a cleared gate is not permission to revive an old root.

Settlement consumes a confirmed, matching destination terminal from the trusted resolver. It cannot be called by an ordinary client. A settled record keeps its original outcome. Retrying reserve cannot revive it, and a contradictory outcome conflicts. Neither elapsed time nor an absent destination row establishes a terminal.

Recovery reads held reservations and pending gates through separate partial indexes. It returns bounded keyset pages of at most100 records. Hold recovery returns binding and route metadata, without copying snapshot values into each page. Pending recovery includes gates with zero holds. Per-source held counts use a partial source index. Exact lookup, identity validation and SQL row budgets apply on readback.

Tests use real SqlStorage and SQLite with a named fixture replacing trusted admission, snapshot production and terminal resolution. They exercise persistence, isolation between source targets, competing updates, exact cleanup, capacity, rollback and indexed recovery. These relation tests do not establish cross-domain release ordering. The writer coverage below uses the actual retention participant and command services.

## Transactional source snapshot

`source-snapshot.ts` supplies a read-only participant and a bound snapshot fact. It reads independent target ownership and Settings assignments in the source transaction. Its material descriptor reads st_targets and st_states, owns no tables, and requires no upstream facts. The combination must register the actual table owners. The private material factory is not exported as a public source reservation service.

The fact binds the complete source request, including its destination owner and exact attempt. A consumer must compare this binding before using the observation. Captured observations contain the current owner projection, state and explicit absent/present marker. Missing or retired targets, unmapped source layouts, conflicting definitions and incompatible state do not become empty snapshots. Asset targets are unsupported by this participant.

The participant reuses standalone-records and projected-state with the ordinary owner and catalog paths. It validates the full definition reference against the normalized declaration. It preserves actual values, locks, source descriptors and revisions. Caller-supplied snapshot content is never read. Snapshot production does not authenticate the principal or keep the source stable after the transaction.

Source-snapshot tests combine the real target owner, assignment writer and snapshot participant with a named fact-consumer fixture. They verify absence, real values and locks, retirement, definition drift, complete destination binding, dependency ordering and snapshot retention across reopen. These tests do not complete the organization source adapter or preparation coordinator. Recovery and settlement must remain independent of obtaining a fresh source snapshot.


## Source protection on actual writes

Direct assignment commands, maintenance rebase and independent-target mutations require a source-write-open fact in their transaction. The fact binds the operation kind, domain, principal or owner capability, complete target, operation ID and command digest. The writer compares that binding against its own parsed command. A fact for another target or another command cannot permit the write.

The source-retention participant reads the exact target gate and its held count. Any pending update or held reservation rejects a direct write with basis_changed. It does not clear the gate, settle reservations or write another owner's records. The SQL transaction orders this check before the writer and prevents an intervening source reservation. A rolled-back check or writer leaves business state unchanged. Already committed operation receipts remain recognizable without fresh write permission.

settings.targets remains the sole owner of st_targets and st_definitions. settings.target-projection supplies read-only target projections and optional direct guards. It reads st_targets and requires no source-write fact. This split keeps catalog capture available while a write is blocked. Use the public command factories to obtain the correct participant identity.

Ordinary settingsSqlMaterials installs a write-only source observation participant with no source table read permissions. settingsSqlMaterials({ sourceCapture: true }) selects the full snapshot producer under the same participant identity. That assembly must include the real independent-target owner. Register one variant only. This option supplies transaction materials, not a public authenticated source reservation service.

A write observation describes the requested operation. It does not attest to source state or authorization. Reserve requires a captured snapshot fact bound to its complete destination request. The retention participant recognizes an existing reservation before attempting a new hold. Source settlement, root-owned update completion and recovery must later consume their own trusted evidence without requiring a fresh source snapshot.

Tests use real Identity, Settings services, independent ownership, source capture and retention to exercise held-source rejection, unrelated writes, original receipts and competing writes. A separately seeded pending gate verifies restart behavior when its held count is zero. That seed does not establish the production update admission or recovery coordinator. Asset holding invalidation and organization management updates require their own owning-domain integration.


## Destination custody of source requests

`source-custody.ts` persists the complete source request set for one exact attempt before any external call. settings.persistence owns the manifest header and member rows. Both relations use same-owner foreign keys. They do not write source-owner tables.

The manifest binds a canonical set of full source requests. Planning inserts the header and all members in one transaction. The digest includes every source and complete destination binding. Input order does not affect it. A different request set or a changed request route conflicts with the saved plan. No append operation exists. An explicit empty manifest is distinct from an absent plan. The provider permits at most1024 unique sources, matching the maximum policy input witnesses in CurrentBasis; byte limits also apply.

The destination identity comes from the persisted root and exact attempt, not from a supplied receipt. Each member fixes its source domain/target, destination owner, principal, root operation, exact attempt, command digest and route. Planned members become requested only while the root is open and the exact attempt is preparing. The coordinator must commit requested before calling the source service.

A matching source receipt can move requested to held or directly to settled. Held snapshots are immutable. Changed snapshots or contradictory terminal outcomes conflict. Late held replies cannot revive settled custody. Reply recording can address a terminal historical attempt without changing its successor. A receipt shape or deterministic key does not authenticate the source. The trusted coordinator must obtain the response from the actual source service.

Manifest recognition reads its primary key. An exact member read uses three indexed point queries for root, attempt and member, each limited to one row. Recovery lists request metadata for an exact attempt through the composite primary key, with source_key continuation and a maximum page of64. It does not list snapshots. Recognizing one member does not rehash or read the full manifest.

The immutable manifest partitions custody by attempt and source. Each member follows SettingsReservationCustody's state machine independently. The ready transition checks every required member. Obtaining and settling the external reservations remains a preparation coordinator obligation. These private operations do not publish a ready basis, release external reservations or supply the public preparation backend.


## Source readiness observation

The private source-readiness participant reads the source owner's gate and held count in the current transaction. It owns no tables, requires no upstream facts and does not mutate source state. Its descriptor declares read access to the two source relations; their sole writer must be registered in the combination.

The fact binds the complete intent identity, exact attempt, command kind and command digest. It reports the full source, actual pending update and bounded held count. Caller-supplied counts or gate content are not read. The downstream planner must compare the complete binding and persistent root purpose. An absent gate with zero holds is an observation, not permission to write or a proof of source ownership.

Ready, commit and seal use separate fixed combinations with exactly one finalization-plan producer. A read-only terminal observation precedes the planner. Shared terminal, source and persistence writers validate their respective actions in the same transaction. Seal does not depend on current governance or renewed qualification. Ready's nonterminal/no-action results cannot authorize business effects. The ready, business-commit and recovery combinations use production participants. The prepared coordinator consumes these combinations. The application supplies a tenant-local current composition. Organization-source adapters and actual consumer migration remain incomplete.


私有根终结写者必须核对精确 attempt 与原命令绑定。成功不能从 preparing 直接发生。普通 seal 保持根开放，源修改 seal 终结根，取消可作用于没有活跃 attempt 的开放根。旧 aborted attempt 不得修改后继，已终结根不得复活。源修改的根终结须消费同事务来源写者的精确 finished 结果；形状相符不构成来源权威。所有 SQL 异常向事务拥有者传播，根和 attempt 不得部分提交。该私有模块尚不构成公开准备提供者。


准备提供者的私有恢复组合必须在一次物理事务内执行terminal观察、原根计划、精确terminal记录、来源动作和持久终结。封口不得要求当前资格或来源快照。重复旧attempt只认回自己的终态，不能借根的后继结果改变其外部保留结果。内部取消选择与当前活跃attempt不符时整组拒绝；无活跃attempt的根可取消。空动作、finalized与直接写入open事实不可互换。该组合的实际参与者已实现；公共准备服务和resolver切换仍未完成。


preparing发布为prepared之前，必须确认原命令及精确活跃attempt、可信当前依据、开放终态观察和全部必需held。缺少来源清单不得解释为空清单，settled不得解释为held。basis一经保存不能由重传替换，已终结或历史attempt不能重新发布。ready不产生业务或terminal效果。展开后的完整来源请求集合也必须满足本成员预算，不能只检查紧凑来源列表。私有关系写者与ready事务组合已实现，应用current生产者和真实应用消费者尚未接通。

### Preparation publication combination

The ready combination uses the existing terminal observer, shared writers and one `settings.ready-plan` producer. It requires a `settings.preparation-current` fact. Only the trusted application adapter may produce that fact. A request supplies the exact attempt binding, not the current basis or custody requirements.

The planner requires matching bindings and an absent terminal. It fixes the complete current basis, Identity requirements and external source manifest in the transaction plan. The terminal writer rechecks absence without creating a terminal. The source writer consumes an explicit no-action plan. The persistence writer alone applies the preparing-to-prepared transition and publishes its result.

Missing custody returns pending. A changed basis returns rejection. Neither result changes the attempt to prepared. A sealed attempt conflicts. A later participant failure rolls back publication. Ready and seal share the same SQL domain ordering. If ready commits first, seal can subsequently abort that attempt. A prepared reference does not guarantee a future commit.

Recovery combinations do not require current facts. The material catalog permits all phase planners, but each combination must select exactly one producer of the finalization plan. No new table or migration supports this transition. The Identity-qualified preparation provider supplies caller qualification and custody orchestration. Actual application current-fact and source composition remain incomplete.

## Transaction-local value projection

The optional `settingsValueProjectionMaterials()` participant reads assignments from the existing Settings-owned state relation. It consumes both native target-owner projections for the exact `SettingsProjectionBinding`. The combination must also contain the real Settings table owner. Applications must not read Settings tables to construct this fact themselves.

`settingsValueProjectionCommand(binding)` produces `settingsValueProjectionFact`. Each result contains the target, definition, owner revision, source layout, grants, enabled state, stored assignment state and explicit absent/present status. An absent assignment has revision zero and an empty value list for each declared source. It does not mean that the target or a required owner is absent.

Requested targets must all appear in the owner facts. Duplicate targets, another capture binding, incompatible stored definitions or source layouts, and unavailable requested targets cannot produce a successful empty result. Existing target and value budgets apply. Reads use one state-key lookup per projected target and do not scan assignment history.

The read and its fact consumers share the same SqlStorage transaction. A committed assignment is visible to a later capture in the same domain order without a notification or remount. This local fact does not authorize the caller, prove Governance adoption, reserve a remote source, or grant a future execution. The trusted composition remains responsible for those checks.

### Prepared business transaction

The commit planner requires an open root and its exact prepared or submitted attempt. It reads the original command from persistence. The request cannot replace that command. Current business material, terminal observation and source readiness must bind the same request.

The trusted current producer distinguishes available material, confirmed final business refusal and unavailable material. Unavailable facts never become a final refusal or an absent source. Available material carries the complete basis, definition and action grants. The planner checks the definition digest, full target and actual local value revision before using it. Secret assignments remain unsupported by this ordinary value store.

The planner reuses the existing change and rebase decisions. Final command failures produce an abort-root plan before comparison drift is considered. Drift seals the ordinary attempt and leaves its root open. A source-update seal also aborts its root. Successful mutation requires matching preparation basis and held custody. Limits, incomplete custody and malformed facts cannot produce a successful write or an invented root abort.

The plan type ties apply to a committed terminal and an open-gate check or committed source completion. Abort outcomes require an aborted terminal and either no source action or aborted source completion. Terminal and source actions bind the exact requested identity. The source owner checks an ordinary target has no pending update or held reservation. Source completion addresses only its own exact pending root. Aborted source completion preserves outstanding held obligations.

The shared persistence writer saves assignment state, operation receipt, change record and root result in the same transaction as the terminal and source outcome. A later failure rolls everything back. A no-change result retains its value revision. Exact SQL retries return their original result after reopening. The prepared coordinator recognizes historical root results before requesting a new business transaction.

Tests run these production participants in the real SQLite Worker. Current material and initial intent/custody/gate state remain named fixtures. These tests do not establish production caller qualification, organization-source management, public preparation or full application integration.

## Protected preparation coordinator

The preparation subpath supplies a service facet and a separate control facet. The service implements the Settings-owned preparation protocol and explicit maintenance rebase. It accepts business commands and references only. The host fixes storage domain, phase registrations, caller access, initial comparison-plan capture, transaction current producers and external reservation routes. These construction adapters are trusted capabilities, not client-supplied configuration.

Every public call validates input and checks current disclosure or command access. Access results must bind the complete target and fixed storage scope. Root lookup also binds the authenticated principal. A repeated prepare recognizes the original semantic command and active attempt. Changing requestId does not change that command. A changed semantic command conflicts. A preparation reference cannot authorize another principal, target or command.

Preparation persists allocation and each requested checkpoint before the corresponding external call. A lost reply is retried using the stored request. Ready rechecks the complete current basis and held custody. A confirmed basis change seals the exact attempt and does not automatically allocate a successor. Commit reads the original persisted command and uses the fixed business combination. Query performs no cleanup. Cancellation preserves prior committed effects and only terminates an open root.

A durable SQL rolled_back receipt proves that the exact SQL attempt cannot later commit under that identity. The coordinator therefore seals the domain attempt and settles its obligations. An ordinary root stays open for a new explicit prepare; a source-update root follows the existing seal rule and also terminates its gate. The SQL receipt is not itself a business refusal. Unknown results preserve the original attempt and do not authorize replacement or release. A lost rollback reply can later be recognized through the existing receipt in an identity conflict; it is not reinterpreted as a successful command.

Before submitting business SQL for a source-update root, the coordinator reads the exact pending source update and its held count. Outstanding holds return rejected/unavailable without submitting or sealing the attempt. The operation remains pending and the same preparation can be retried after source recovery. An unavailable or mismatched readiness read leaves the operation unchanged and returns unknown. This observation grants no commit authority. The business transaction still validates the exact pending root, holds, current material and original custody. Cancellation or replacement after the read cannot bypass those guards.

Post-terminal settlement may be unavailable. The service preserves a known business result, while durable requested or held custody remains recoverable. It does not claim that those obligations were released. A read-only original-operation query never invokes settlement. Closing rejects new service and resolver calls, drains accepted calls and leaves shared storage ownership with the assembler.

The Identity adapter verifies an issued acting-for-tenant principal, current membership and configured qualifications. Tenant-domain access must match the principal's canonical tenant. System-domain access also requires organization-settings-manage. Target ownership, organization eligibility and action policy remain the injected owner's responsibility. Reservation requests bind that same principal, canonical tenant, fixed destination and complete original request.

The attempt resolver validates the versioned recovery envelope and the persisted requested/held/settled Standing request. It uses the exact fixed domain and attempt, then reads the actual terminal after sealing. It does not reacquire a qualification that withdrawal may already have removed. Wrong destination, malformed envelope, changed request or unavailable storage cannot produce a terminal response. Capture recovery stays with its capture owner; this resolver does not guess a capture route.

Public-service tests use the real Worker combinations. Separate tests connect actual Identity issuance, standing, reservation, settlement and membership removal. They cover both withdrawal/commit orders and a paused commit. Current policy material and source routing remain named construction fixtures. These tests do not prove the application's actual Governance/organization source composition, old-consumer migration or full C3b acceptance.

### Application current consumer

The harness-server [prepared Settings composition](../../../apps/harness-server/docs/rows/settings-preparation.md) consumes the public preparation SPI. It derives initial and transaction-current material from the actual native owner, Governance and assignment projections. Its first implemented source scope is tenant-local. Organization sources, maintenance current for cross-definition rebase and the server consumer switch remain incomplete. This application evidence does not enlarge the package's independent acceptance claim.


## Source reservation provider

The preparation entry exports `createSettingsSourceReservations`. Its service is a trusted coordinator port, not an ordinary client command surface. Construction fixes the source domain, SQL registration, access adapter and destination capability. Each reserve call checks current access and requires the grant to match the source target, scope and destination principal.

A new hold also requires `destination.recognize` to confirm the exact persisted destination request. Recognition does not seal or grant authority. The prepared provider exposes this capability as `control.sourceDestination`. It checks its own domain, Settings ownership, immutable root command, exact attempt, source and full custody request. Missing, merely planned or changed requests are unavailable. A guessed route cannot create an orphan hold. A terminal established after recognition remains irreversible; a delayed hold can only be settled to that original terminal.

The destination identity carries a domain, principal reference and owner-defined JSON operation object. Settings does not interpret another owner's operation. The fixed destination resolver validates that object against its own protocol and the exact persisted request. The Settings preparation resolver still requires a valid Settings intent identity. Source updates continue to require Settings intent identities. This distinction does not change existing reservation keys or serialized Settings requests. Whole-request byte limits still apply.

The source snapshot and hold are written in one source transaction. Exact retries return the original immutable snapshot or settled receipt, including an absent assignment. Existing source reservations do not bypass current read authorization. Source updates and owner mutations remain subject to the source write gate.

`settle` reads the original reservation and asks the fixed destination to seal or recognize its terminal. Only a matching terminal response releases the hold. Unavailable, malformed or mismatched results do not release it. The source snapshot producer transports the trusted settlement envelope; the retention writer checks the same envelope and owns the state transition. Neither caller-supplied JSON nor an elapsed timeout is a terminal proof.

A missing reservation can mean its reserve request was lost or remains in flight. After the exact destination confirms aborted, settlement records that original request as settled/aborted. A late reserve returns this terminal without creating a hold. The SQL writer checks absence within its transaction. It rejects committed settlement for an absent reservation, but can settle a hold established between the service read and destination response. No fresh caller qualification is needed to finish the original obligation.

An aborted reservation created without a hold stores JSON null in the existing snapshot text column. Held and committed records require a valid snapshot. The decoder enforces this distinction. Existing rows, keys, indexes and installed migrations remain unchanged. These terminal records do not enter held scans or block source updates. Unknown write outcomes are read back by the full original request.

`control.recover` reads at most 100 held metadata rows through the recovery index. It omits snapshot payloads and limits each response to a bounded metadata prefix. The cursor identifies the last returned row. A short page can have a continuation, so callers continue until the cursor is null. Unavailable items keep their holds and are retried on a later scan from null. `pendingUpdates` independently enumerates pending source gates, including gates with zero holds. It does not execute an administrator's original change. Close rejects new calls and drains accepted calls without closing shared storage or discarding durable holds.

`control.recoverSource(source, page)` restricts recovery to one complete source reference in the configured domain. It uses the existing source-key/held index and the same metadata bounds, exact settlement and continuation rules as global recovery. It does not scan other sources or require fresh caller qualification to finish an accepted obligation. A trusted update coordinator uses this method to drain only its affected source before retrying the original prepared commit. Concurrent cancellation may leave already accepted destination seals in effect; it cannot reverse them.

`createIdentityQualifiedSettingsSources` additionally verifies an issued acting-for-tenant principal, current membership, canonical destination tenant and source organization. The owner access adapter still decides disclosure of that concrete source target. Recovery uses the original obligation and does not acquire fresh membership or management authority. Organization targets use `scope=system`, `transactionDomain=system.settings` and a canonical organization scopeRef. Other system-domain independent targets remain unsupported.

Public-provider tests combine actual standalone ownership, source snapshot/retention and prepared destination recovery in SQLite Workers. Fault-isolation tests use named destination responses; the prepared composition uses the actual destination capability. Identity tests use actual membership and revocation. These source-provider checks do not establish automatic organization-update recovery, multi-tenant policy evaluation, old-consumer migration or full application acceptance. Native administrator current has separate evidence below.

## Native organization current

The preparation entry exports `settingsOrganizationCurrentMaterials` and `createOrganizationSettingsCurrent`. These are trusted composition capabilities. The current adapter supplies owner disclosure, initial planning and transaction-current commands to the existing Identity-qualified preparation provider. It is not an authenticated public service on its own. The deployment must install the fixed destination resolver with Identity and use the same destination in both providers.

Only independent targets in `scope=system`, `transactionDomain=system.settings` are supported. Their scopeRef must be the canonical organization of the actor's real tenant. The qualified provider verifies the issued principal, current membership and `organization-settings-manage`. The adapter also matches the original principal reference, domain and target. Its Standing plan retains the actor's canonical tenant scopeRef and the management qualification. It does not invent a system tenant or transfer qualification ownership to Settings.

The native producer reads Settings-owned target and assignment records. Its declaration witness binds the complete source identity and actual owner revision. Selection is explicitly not-required with the same native authority. Policy material identifies the native target-grants interpretation, actual definition and grants. Value inputs bind the source domain/target, actual stored revision and confirmed presence or absence. This interpretation governs Settings mutation; it is not a permission decision for a Tool or Agent action.

Every source in this local organization layout must be an organization source for that same organization. Other layouts return unsupported. The empty external-reservation list means the value is owned by this local source; it must not hide a remote dependency or create a hold on itself. New plans use source-update purpose and the exact source key, so root allocation closes that source's admission gate.

Capture, ready and commit use the same material function. Ready and commit bind the full original identity and command kind to the exact attempt; final planners continue to validate the original digest, root and custody. Confirmed business refusal is distinct from unavailable current. A failed deterministic SQL attempt follows the existing attempt-sealing rule; the current producer does not label unavailable information as a business denial.

Ordinary changes use the existing current-definition and source-layout checks. Explicit rebase uses the current owner definition/layout and the historical assignment revision/presence. It does not expose old assignments as valid runtime values. The existing rebase decision validates the full original and destination definitions, expected revision, source identities and assignment dispositions before any value is written.

Actual Worker tests compose native ownership/current, real Identity qualification/reservation/recovery, prepared commits, explicit rebase and administrator demotion. Two real organization tenants exercise both consumer-commit/source-update orders using the actual source/destination protocol. Their target-side current policy material remains a fixture. These tests do not establish real multi-tenant Permissions evaluation, server consumer migration or full C3b acceptance. Original pending-update recovery has separate coverage below.


## Original organization update recovery

`createOrganizationSettingsRecovery` is a trusted local control capability. The assembly fixes its Settings domain, phase registrations, native current configuration, Identity reservation port and source recovery control. It does not accept a user principal or create one. It only resumes a pending source-update root found in the configured domain, with its original command, attempt, actor tenant and qualification request.

Each call reads one bounded page of pending source gates. For each source, it drains existing holds through the source service and rechecks that exact pending gate before each page. The existing 128-hold cap bounds the work; metadata pages can be shorter than their requested count because of their byte budget. Cursors must advance. An unavailable destination remains held and does not prevent the scan from visiting later holds. Callers continue the returned source cursor, then start a later sweep from null to retry unresolved sources.

Recovery reads Settings-owned custody and calls Identity `observe` with the complete original request. It can save an originally accepted held receipt whose response was lost. A missing, planned, conflicting or unavailable reservation supplies no authority; recovery preserves the root and gate. It does not call reserve with a synthetic principal. A late held response cannot revive a sealed attempt. Native original-current commands bind the original actor organization, principal reference, destination, attempt, command digest and recovery reference. They read current owner, grants and assignments through the existing SQL participants.

Before business submission, recovery queries the persisted original SQL identity. Unknown remains pending. A durable business rollback seals the exact attempt and source root. Committed is recognized from the root. Confirmed not_committed allows only the original deterministic command identity. Recovery does not allocate a successor. Final business checks still decide races with cancellation, withdrawal, source holds and owner changes.

Ready has a separate SQL phase identity. Its rollback alone is not a business refusal. Recovery seals on a ready rejection only when the saved stopping entry identifies the fixed native ready producer, its configured protocol digest and a known business refusal basis. Generic participant failure, unavailable current and unknown outcomes remain pending. The rollback receipt remains available to the coordinator; it is not reduced to diagnostic text.

Terminal recognition settles the original Identity request. If settlement is unavailable, the business result remains terminal and the hold remains a durable obligation for Identity recovery. Install the returned destination resolver for the same fixed route after remount. Close rejects new work and waits for admitted calls; closing does not release a hold or reverse an accepted destination seal.

This local control does not authenticate remote calls or schedule its own background sweeps. Deployment owns invocation and destination routing. It does not implement runtime Permissions evaluation, the server consumer switch or distributed transport.
