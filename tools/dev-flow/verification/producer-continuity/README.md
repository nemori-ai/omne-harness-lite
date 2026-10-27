# Producer continuity bounded models

These models check the producer custody and durable preparation protocol in [delivery SPEC](../../src/delivery/SPEC.md#生产者接管与转移). They provide bounded safety checks under the assumptions below. They do not add product guarantees.

## Run and judge

Use Java 21 and TLA2Tools 1.7.4. The runner checks the JAR SHA-256 before execution. Each run records the actual Git HEAD and mapped source hashes in its output directory. It fails if those source inputs change during the run. These records identify the evaluated version and do not prove implementation conformance.

```sh
python3 tools/dev-flow/verification/producer-continuity/check.py \
  --output tmp/producer-continuity-check
```

The output directory must be new. Use a task tmp directory, with an absolute path or a path relative to the calling directory. `TLA2TOOLS_JAR` must be set. The runner has no machine-specific fallback. Each Java process has a 55-second limit. Timeout, unavailable tools, parsing errors, incomplete search, and wrong negative properties fail the runner. It kills and reaps a timed-out child process group. Input copies, hashes, commands, versions, stdout, stderr, state counts, and action coverage remain in the output directory.

Positive checks require TLC's completion message, exit code 0, positive state counts, and an empty search queue. They also require generated successors for the named protocol actions. Negative checks require exit code 12, exactly the expected invariant, a concrete initial-state trace, and completed TLC output. Parser self-tests reject exit-only success, wrong properties, missing traces, incomplete search, parse errors, and timeouts.

## State and implementation mapping

A file token represents exact immutable bytes and their path. `g1old` and `g2old` represent retained source generations. This abstraction assumes byte comparison and SHA-256 checks accept only matching data. `g3current` represents later destination growth. The finite model does not implement hashing or JSON parsing.

| Model state or action | Implementation mapping | Abstracted step and responsibility |
|---|---|---|
| `Transfer.reservation`, `importInventory` | `transferProducer` computes `activation` and saves `ADOPTION` | Each destination has one adopted descriptor and inventory. The inventory stays separate from later journal growth. |
| `ReserveFile`, `ReserveLink`, `ReserveDir` | `saveBytes` writes and fsyncs a temporary file, calls `linkSync`, then syncs parent directories | File fsync occurs before visibility. Directory fsync is a separate transition. Existing records must match exactly. |
| `SelectFile`, `CopyFile`, `CopyLink`, `CopyDir` | `transferProducer` validates source hashes and calls `saveBytes` for every entry | A crash can occur before publication or before directory fsync. Retry compares existing bytes and repeats persistence work. |
| `CheckInventory`, `CheckSource` | destination inventory equality, source/current assertions, activation/adoption and inventory rechecks | The source is stopped and immutable under the operator prerequisite. Malformed input is outside this valid-input model. |
| `RetireFile`, `RetireLink`, `RetireDir` | `save(from, RETIRED, retirement)` | The exclusive link chooses one destination. A different destination reaches `conflict`. Visibility and durability are distinct. |
| `ActiveFile`, `ActiveLink`, `ActiveDir` | `save(gitDir, ACTIVE, activation)` | Activation follows copy completion and durable source retirement. The invariant itself is not an activation guard. |
| `Bootstrap` | `readProducerState` compares activation/adoption, syncs activation and Git directory, then verifies imports | Another caller can observe activation before the transfer caller syncs its directory. Bootstrap completes that sync before use. |
| `RetryCompleted` | active-record branch in `transferProducer` | It checks imported bytes and matching source retirement, syncs existing records, and preserves the growing journal. |
| `AppendGeneration` | successful immutable journal append in `operationJournal.save` | A completed append is one abstract action here. `Intent` expands creation, write, and fsync boundaries. |
| `Crash`, `Restart` | process exit and another transfer invocation | Volatile progress disappears. Visible files remain under a process crash. Incomplete directory sync remains incomplete. |
| `ProbeRetiredSource` | `readProducerState` refuses a producer when `RETIRED` exists; preparation calls `assertActive` | This checks a cooperative current-tool startup after retirement. It cannot revoke an unmodified legacy process. |
| `Intent.stage`, `owner`, `pc` | `operationJournal.save` uses `O_EXCL`; preparation continues only after save succeeds | Exclusive creation, complete bytes, file fsync, and directory fsync are separate. Only the current successful call holds POST authority. |
| `CreateConflict` | `O_EXCL` failure enters the preparation unknown path | The loser does not acquire the creator's POST authority. |
| `Post` | POST follows `journal.save(intent)` and `assertActive()` | POST increments the external-attempt count once. Its result is unknown until observation. Restart cannot resume that call at POST. |
| `Observe`, `Complete`, `PublishFacts` | `observe` uses the intent's original deployment and authenticated run/facts evidence | GitHub identities, attempt validation, nonce association, and pagination are assumed validated by the adopted parser. |
| `Begin`, `VerifyFailedPredecessor`, `ReadFactsAbsence` | explicit `retryFailed`, fresh predecessor equality, complete facts absence | Only this route reaches successor creation. Unknown, pending, and successful generations cannot create a successor. |
| `binding`, `originalBinding`, `predecessor` | `parseIntent`, `adoptedInstallations`, and preserved `intent-N.json` | Imported generation 1 keeps its old deployment. New generations use the current deployment. Existing records cannot be replaced. |

`Transfer` models one transfer invocation per destination, with two competing destinations. It does not model two concurrent invocations against the same destination. The [producer state tests](../../tests/delivery-producer-state.spec.ts) cover that additional case with real processes. Each modeled process can crash and restart repeatedly. Retries reuse immutable records, so the state graph remains finite without limiting the number of crashes.

Refusal and completed terminal states are permitted. Deadlock checking is disabled. There are no fairness or eventual-progress claims.

## Properties and negative controls

| Property | Positive obligation | Fault injection and exact expected failure |
|---|---|---|
| `UniqueCustody` | At most one destination has a visible activation for this source. | `transfer-second-destination.cfg` replaces exclusive retirement with overwrite. It must violate `UniqueCustody`. |
| `ActivationRequiresDurability` | Activation requires durable adoption, all imported entries, and source retirement bound to that destination. | `transfer-early-activation.cfg` activates after adoption. It must violate `ActivationRequiresDurability`. |
| `RetirementBinding`, `ReservationFrozen` | Durable retirement keeps its destination. Reservation keeps its original inventory. | Positive assertions across both transfers and all crash/retry states. |
| `ImportedGenerationsPreserved`, `GrowthPreserved` | Imported records and later durable additions survive retry. | `transfer-retry-truncation.cfg` restores an old snapshot over later growth. It must violate `GrowthPreserved`. |
| `SourceNeverResumes` | A cooperative startup cannot return a producer after retirement becomes visible. | `transfer-source-resume.cfg` ignores retirement. It must violate `SourceNeverResumes`. |
| `AtMostOnePost`, `ExclusiveCreatorPosts` | Each generation has at most one POST, made by its exclusive creator. | `intent-repost.cfg` allows another caller to POST an unknown imported generation. It must violate `AtMostOnePost`. |
| `DurableIntentBeforePost` | File and directory fsync precede POST. | `intent-early-post.cfg` permits POST after only file fsync. It must violate `DurableIntentBeforePost`. |
| `OriginalBindingPreserved`, `NewGenerationsUseCurrent` | Original deployment bindings stay fixed. Successors use the current deployment. | Fresh and imported positive configurations. |
| `RetryHasFailedPredecessor`, `NoGenerationGap` | A successor requires explicit retry and fresh failure evidence. The chain remains contiguous. | Fresh and imported positive configurations. |

Each negative configuration checks `TypeOK` and its named property. All safety assertions remain enabled in the positive configurations. This isolates the intended failure when one mutation can break several properties.

## Composition and boundaries

`Intent` checks one journal slot with two callers and two generations. Imported initial states include zero or one prior POST. Zero means a durable intent whose creator stopped before POST. One includes unknown, pending, failure, or success observations. It treats custody admission as an external input. Its per-slot append and no-repost properties do not prove exclusion across installations.

`Transfer` checks two destinations and two imported generation tokens. Its future append action only adds immutable tokens. `Intent` supplies append-only behavior for the modeled journal writer. `Transfer` supplies unique activated custody and complete imported bytes. This is an explanatory composition argument. It is not a refinement proof or a machine-checked theorem between modules.

The stopped-source prerequisite belongs to the operator. No source-writing transition occurs during transfer. The startup probe applies only to software that honors retirement. A marker cannot stop a running or legacy writer. Independent initial-producer assertions on unrelated machines are outside the model.

Process crashes preserve visible filesystem state. Durability variables record completed fsync operations. The model does not erase unsynced links on an OS crash. Physical power loss, filesystem guarantees, permissions, symlink attacks, SHA-256 collisions, GitHub behavior, credentials, descriptor trust validation, and legacy binaries need separate evidence.

The models assume accepted descriptors, readable historical workflows, unchanged repository/Project/Bot identity, valid journal records, and unchanged source files. They abstract each imported generation as matching immutable bytes. They do not prove malformed input rejection or validate the actual descriptor parser. Model execution performs no backend operation, workflow dispatch, external POST, deployment, or user acceptance.

## Evidence and complementary checks

Run the command from the repository root after configuring the [formal toolchain](../../../../docs/verification.md). The output directory retains the evaluated inputs and results. Keep execution evidence in the task directory; do not commit generated TLC state or per-run logs here.

[Producer state tests](../../tests/delivery-producer-state.spec.ts), [installation tests](../../tests/delivery-collaboration-installation.spec.ts), and [preparation tests](../../tests/integration-prepare-delivery-facts.spec.ts) check the corresponding implementation, including real process interruption and filesystem behavior. Model results do not replace these checks, independent source correspondence review, real deployment, or acceptance evidence.
