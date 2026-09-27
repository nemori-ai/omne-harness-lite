# Corrected P3 credential race: independent run

**Result:** one corrected public-package run passed (`run.exit` = `0`); this is partial evidence for directory V3-15 and CCL MCR-V4, not acceptance of either complete verification obligation. The original three failures in sibling `model-request-runtime-p3-joint-credential-verification/tmp/model-request-runtime/p3-joint-credential-verification/run{1,2,3}.*` remain untouched. Those earlier `unavailable` results are permitted by directory S-19 ⑧, but did not prove the required successful ordering. The corrected result supports the two-clock fixture confound; it does not prove that was the sole possible cause of an unavailable result.

## Frozen inputs and execution

- Execution checkout: `panqiwei/model-request-runtime-p3-corrected-race` at `1c7bd9ee90596bad38d6485596528bb93435abd9`, tracked clean before and after. Node `v24.18.0`, pnpm `10.28.1`.
- Authority: accepted D-075; `design/spec/capabilities/model-profile-directory/v3/contract.md` S-19/S-20; directory realization `packages/model/model-profile-directory/v3-design.md` R3-7/R3-8 and `verification.md` V3-15; CCL realization `packages/infra/credential-custodian-local/v2-design.md` K-M1/K-M2 and `verification.md` MCR-V4. These coordinates are relative to this checkout's `.meta_harness/`.
- Setup: `pnpm install --offline --frozen-lockfile` and selected package build both exited `0` (raw `install.*`, `build.*`). One run only: `timeout -s TERM 10s node tmp/model-request-runtime/p3-corrected-race/race.mjs`; command, outer PID, Node PID, stdout, stderr and exit are frozen as `run.command`, `run.outer-pid`, `race.pid`, `run.stdout`, `run.stderr`, `run.exit`. `run.stderr` is empty. The Node process reached `scratchRemoved`; no paid/external HTTP was issued by this fixture.
- Script SHA-256: `2be93ee2174031aaa9203dca49cb12d53199eb299c6360f1ddb99c6ffb73cd6b`. Product source hashes are in `inputs.sha256`: CCL model replica `ce1e8f70...b5445c`, directory plugin `b692f0a3...15f6`, directory reader `ee838c2f...6784`, clock plugin `a6b51c11...6119`. Raw SHA-256: stdout `692d54bf...867990d857d`, stderr `e3b0c442...7852b855`, exit `9a271f2a...e55d9bc94f6f3fe3ab86aa`.
- Fixture: one real temporary SQLite database, two distinct public `openStorage` instances, actual Cordis directory and OG membership services on each, actual CCL/key file, actual `createCredentialBindingReader(storage)` inside the CCL transaction. Account, membership and login identifiers were test seeded, not obtained through production authentication. The first directory owns one real `clockPlugin`; the second directory receives that same live `clock` service through its public injection dependency and remains live with the first during all races. `sameLiveClock`, `distinctStorageHandles`, `clockAvailableBeforeRace` and second membership standing were asserted before contention. No second clock plugin or fake time source was used. Sharing the service does not share either storage handle or transaction; the first clock owner was disposed only after both directories finished.

## Assertions and observations

All timestamps below are monotonic milliseconds from `run.stdout`, not a criterion for database serialization by themselves. The result/row assertions determine the verdict. Opaque A/B labels denote two test refs; no ref, body, key or ciphertext is in raw stdout/stderr.

| Scenario | Original assertion and observed value |
| --- | --- |
| Preflight | Two storage handles distinct; both directories see the same live clock; `now()` available; real second membership standing succeeds. All `true`/`success`. |
| A: store capture before rotate | Real CCL reader captured the B binding row and held its transaction at `648.673102`; second connection began B→A bind at `648.696518`. Barrier released at `698.546841`, **49.874 ms** after capture. Store returned `{stored:true}` at `698.875191`; bind returned success at `712.536494`. Store resolution precedes bind resolution. The persisted binding row was A and prior replica source B. A read was absent, late B store returned `{stored:false}`, valid A store returned `{stored:true}`, and matching A read returned exactly body A. |
| B: rotate before old store capture | Second bind A→B returned success at `717.579128`; delayed old A store returned `{stored:false}` at `718.283608`. Persisted binding row was B and prior replica source A; B read was absent until a valid B store returned `{stored:true}`, then matching B read returned exactly body B. No stale overwrite was observed. |
| Matching read overlap | Real reader locked B binding at `721.342850`; competing B→A bind began at `721.392602`. Read barrier released at `771.223261`, **49.880 ms** later. B read returned exactly body B at `771.878100`, then bind A succeeded at `785.498342`. Persisted binding row A and replica source B; subsequent A read absent. |
| Cleanup | All three CCL closures, both Cordis assemblies and both storage handles closed, temporary database/key directory removed. `run.exit=0`; no cleanup failure stage. |

The assertions compare actual persisted `model_credential_binding` and `credential_custodian_replica` rows through public storage transactions. A/B source labels in the JSON are recorded only after those row and body assertions pass. The lock barrier is placed *after* the actual directory reader returns from its row-locking operation and before its containing CCL transaction ends; the test gate holds that transaction open but does not substitute for the product's lock. The first storage/unit owns CCL read/store, and the distinct second storage/unit owns the competing directory binds, both against the same SQLite file and tenant row. The writer's later success and final rows provide ordering evidence; timestamps alone do not.

## Contract verdict and remaining work

| Obligation | Verdict in this increment | Boundary |
| --- | --- | --- |
| V3-15 successful two-connection SQLite order A and B | **Pass for those two orders** | Actual reader, CCL and directory on one database; stale write refusal and persisted rows checked. |
| V3-15 matching read versus bind | **Pass for this one interleave** | B read selected before A bind committed; later A read absent. No unbind interleave. |
| V3-15 as a whole | **Partial** | No cross/wrong/expired StorageUnit, constant reader, removed-lock negative controls, generic overwrite, afterCommit/log inspection, atomic commit-failure/body-withholding, unbind race, or PostgreSQL run. The prior sequential verifier is separate evidence, not repeated here. Product runtime `credentialUnavailable` and zero HTTP were not exercised. |
| MCR-V4 successful store/read versus bind | **Pass for observed subset** | Two real SQLite storage handles, same binding row, actual source/row matching, no observed half row or stale overwrite. |
| MCR-V4 as a whole | **Partial** | No unbind race, process termination before commit, lost receipt/reopen, fault mutations (remove lock, remove source comparison, relabel at read), transaction failure classification, or external body-release boundary. PostgreSQL untested. |

MCR-V1/V2 generic migration/read, tampering/AAD and persistence fault checks; remaining MCR-V3/V5–V8; directory V3-14/V3-16; real account/login/bootstrap authorization; app/runtime/transport; and actual production zero-HTTP behavior remain outside this run. The seeded fixture cannot establish full CCL or production authentication. The raw output contains phase names and opaque outcomes only; no claim is made that a silent fixture establishes runtime log/trace redaction.

No tracked files were edited, and this evidence is ignored local `tmp/` material. Preserve it before retiring the spoke.
