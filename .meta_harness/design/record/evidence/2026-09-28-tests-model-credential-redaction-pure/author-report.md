# D093 shared credential redaction implementation handoff

2026-09-28. Implementation and author verification complete for the assigned **pure text/header/raw-error JSON** slice; dispatcher integration, independent verification and final acceptance are pending. No commit, merge, push, paid model request, production client switch, design/spec/registry edit or new dependency occurred.

## Authority and exact scope

Worktree: `/data/qiwei/repos/omne-harness-lite/.worktrees/model-request-runtime-g6-policy-implementation`, branch `panqiwei/model-request-runtime-g6-policy-implementation`, base `ac977b7ac5897288f214f8d28ac13efdb651943d`. Brief revision1 SHA `7590a871591566079bc922ef035563b3ef2202cd980b34ac643972e32461ae26`; all twelve frozen inputs initially verified and copied from the exact base into `frozen/inputs/`. D093 limited rev2 adopted design SHA `843b6101c7ff4f50cf8f4bd755a2617688e935cb0fdb9843cba97b4b90b1c6c2`. Additional MR5 RawHeaders/UpstreamError Schema was read and copied, without changing the twelve-item input ledger.

Seven owned files changed: `src/credential-redaction.ts`, `src/credential-redaction-types.ts`, `src/index.ts` export lines, the two dedicated credential-redaction test files, README and README_ZH. No other product, tool, lock, dependency or design source changed. Source layout and exact hashes are in FREEZE.json; complete runtime source15/dist60 snapshots are in frozen/runtime and SOURCE.json/DIST.json.

Public additions: `createCredentialRedactionPolicy(config)`, immutable explicit `openRouterCredentialRedactionConfig`, `CredentialRedactionConfigurationError`, `redact(value, knownCredential, params)` and readonly public types. Policy exposes only bind; the bound closure exposes only text/headers/json, each with `{ok}` or `{rejected:'invalidInput'}`. No credential, original value, window table, policy pointer, length/hash or resource metadata accessor is exposed. Algorithm source imports only the existing content-blocks public root; no service/plugin/fiber/storage/environment/network operation was added. Existing runtime root has its existing transitive dependencies; this report does not claim the whole pre-existing package became dependency-free.

## Construction and verification checklist

| Required behavior/evidence | Actual result and scope |
| --- | --- |
| Explicit three parameters, immutable exact baseline, finite legal domains, own-data admission and controlled static errors | Exact 11-header/3-pattern/m8 baseline verified; missing/extra/duplicate/illegal values, limits, accessors, cycles and reflection errors tested. Root clarified generic arrays have no positive lower bound; generic empties are accepted but never represented as production eligibility. Eight strengthened-baseline mechanism cases retain original entries and exercise added entries; production assembly qualification was not executed. |
| Shared original-input interval union, full short V, every >=m fragment, finite token descriptors | Independent all-substring brute-force original-input oracle, exhaustive finite fragment combinations, overlap, retained markers, both exact alphabets, case/SP/HTAB/newline/word-prefix boundaries tested. Known windows use exact Set string equality. Four endpoint arrays prevent repeating full-tail scans on overlapping prefixes. |
| Original-name sensitive-header removal; string/ordered string[]/empty/duplicate preservation and collision safety | All eleven names in uppercase plus mixed spellings, unchanged empties/duplicates, original-name-before-renaming, no trim or Unicode fold, key collisions and `__proto__` tested; outputs are null-prototype independent deeply frozen data. |
| Raw/error JSON all keys/scalars, exact numbers/booleans/null, shape/idempotence/no aliases | Short true/false/null credentials, scalar-token hits, precise huge integers/exponents/negative zero, original numeric spelling/type preservation, null-prototype collision maps, arrays, frozen input and depth20000 tested. Required business facts were not passed through this general mapper. |
| Caller getter/toJSON/foreign error admission and internal-defect distinction | Input-descriptor accessors rejected without invocation; caller reflection traps/errors become admission refusal without original exception. Valid internal processing faults propagate fixed input-free ordinary Error, not invalidInput/raw/new domain failure. Actual Uint32Array fault test exercises text/JSON/header/S60 paths. |
| Actual public artifact/type consumers and bilingual newly-added literals | Two independently packed current runtime artifacts, fifteen product-pack transitive closure, two fresh isolated consumers, strict public-type compilation and public execution, both new bilingual literals compile/run in both consumers, private subpath import rejected. Every one of 718 installed product members in each consumer was byte-checked against its selected tar member. External dependencies and install resolution are fixed by each consumer's pnpm lock; their entire external installation is not archived. |
| Four isolated actual compiled behavior negatives | Current-byte source mutations: short full V missed, boolean/null bypass, header array flattened, config retained by reference. Compilers all exit0, original unchanged oracle all exit1 at the corresponding behavioral assertion. Original source oracle exits0. Mutant source/patch/dist/raw streams/PIDs are retained. |
| Finite actual resources and original behavior regression | Packed finite resource PID226147 passes sizes/invariants below. Final build PID227145 exit0, typecheck227189 exit0, test227235 exit0: 11 files/233 tests, no type errors (85 dedicated behavior cases plus public type checks and existing suite). Post-fix rules PID226198 passes27 package+6 repository rules; owned format226396 and diff226434 pass. |

## Discovered precise numeric counterexample and correction

An extra actual packed probe found a counterexample after the earlier finite passes. **Original PID220815 exit1**, stdout/stderr at `evidence/numeric-proxy-probe.*`; its original consumer script is `consumer-a/numeric-proxy-probe.mjs`. A real LosslessNumber subclass retains its brand and a prototype Proxy reports the trusted source descriptor. Calling jsonNumberSource on that foreign receiver performs ordinary Get: trap calls1, original private source `1` becomes success token `9007199254740993123`. The report did not reinterpret that failure as a pass. Affected source/dist SHA snapshot is `evidence/known-state-at-numeric-probe.json`; exact old source/dist and both old packs remain in `evidence/numeric-before/`, including old runtime A SHA `9990987ecd55cf0d5b50cfcb4512a59d21fb10d3b7ae19b188427c618817d885` and B SHA `43a38017aef8b532d63d88a76ccc511df88d4448188ea24c768de8979b5359e8`.

Dependent admission work stopped and the counterexample was reported. Dispatcher explicitly approved use of the existing public precise read getter, not a new core API or narrower numeric domain: capture the trusted LosslessNumber.prototype source getter at module initialization, validate the encountered source descriptor against it, explicitly Reflect.apply it to the branded input, immediately construct a standard owned LosslessNumber, and use jsonNumberSource only on owned numbers thereafter. Direct caller source-getter overrides still reject without invoking them. No private field/subpath access or core edits were made.

**Corrected actual new packed probe PID226549 exit0**, raw streams at `evidence-numeric-fixed/numeric-proxy-fixed.*`, current script `consumer-numeric-fixed-a/numeric-proxy-probe.mjs`: private original=1, preserved token=1, original-token hit yields marker, Get trap calls0 on both paths. The same regression and direct overriding-getter refusal are in maintained tests. Fresh post-fix packs, consumer runs, negative controls and resources were repeated. This protects the tested admission boundary, not arbitrary hostile same-process code or replacement of the trusted dependency before module initialization.

## Actual finite resource observations

Packed public root, Node v24.18.0, one process PID226147. Timings are observed samples, not universal guarantees. RSS below is before/after, not an instrumented peak or an isolated allocator measurement.

| Input | Time | Observed RSS before/after |
| --- | --- | --- |
| n100000, 64 overlapping prefixes length1..64, credential8190, m64 | 1109.69ms | 179056640 /180899840 bytes |
| n200000, same descriptors and credential | 2193.01ms | 180899840 /184143872 bytes |
| 20000 objects,120000 scalar values | 547.90ms | 184954880 /295813120 bytes |
| depth20000 | 50.79ms | 295813120 /304099328 bytes |
| n200000 credential-window input, credential8190,m64 | 52.46ms | 304099328 /307601408 bytes |

All cases check independently fixed expected values/shape and relevant freeze/input-preservation invariants. The maximum generic config uses128 headers/64 descriptors; it is not represented as approved production m64. Text work is bounded by credential-window setup plus one input scan with bounded literals: O(km+n(m+64d)+output), endpoint memory O(n), plus exact-window/config/output memory. JSON traversal is iterative, with owned snapshots/output and key suffix collision work including required output length. Runtime event-loop scheduling, whole-provider resource limits and model request capacity were not measured or invented.

## Catch and lifecycle responsibility

- Static config snapshot/validation exceptions: factory throws fixed ConfigurationError, no input/cause retained; standalone redact maps this normal illegal-configuration case to invalidInput.
- Explicit data shape/cycle/accessor failures and caller reflection exceptions: private InputAdmissionError; bound JSON/header admission returns invalidInput. Reflection traps are not claimed as sandboxed.
- Allocation/other unexpected defects outside those admission facts, bound match preparation, text matching and captured JSON/header projection: fixed ordinary Error `Credential redaction processing failed`, no cause/original value. Standalone redact does not swallow this into invalidInput.
- No async resource, disposer or service is owned here; copied config and known-value closures are held by their eventual consumers. No physical memory erase, actual network stop or durable writer completion is claimed.

## Failure retention and limits

First type-test directive and test-narrowing errors; an initially invalid empty-header refusal fixture; isolation setup mistakes (workspace install, wrong temporary @types version, absent local dependency overrides); null-prototype expected-value errors; a resource-script SyntaxError; and the m1 fixture's protected `t` in `Kept` are retained alongside corrections. The m1 original input remains in the maintained case and expects `Kep█` per the explicit protected fragment rule, not a lowered oracle. These failures are separated from the actual proxy implementation defect. Old pre-proxy finite passes have their original scope and do not prove that counterexample.

Paid requests0; production network0; formal tools/tasks0; new bindings0. Raw.body source-byte projection/attachment IO, production eligibility/wiring, send/read error paths, stop/stopped/Header transfer, complete S20, G4 required status/identity/cost conflict, durable13-operation service, actual TLS→invoke→append/reopen and37 model certifications remain outside this implementation. R5R-V1/V2/V4/V6/V7 have only the listed **pure constituent** evidence here, not their complete real provider obligations. Dispatcher and independent verifier must decide scoped acceptance; no acceptance is asserted by this report.
