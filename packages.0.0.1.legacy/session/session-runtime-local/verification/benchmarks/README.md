# SessionLog benchmark

This benchmark measures compiled public components with synthetic data and real SQLite files.
It does not call a model, use credentials, or read an existing user Session.
The CLI latency acceptance remains separate.

Use Node 24 and a worktree whose dependencies and release `dist` files are already built and checked.
The script never builds or installs packages. Coordinate with other workers before running it.
From the repository root, run a small correctness check:

```sh
node packages/session/session-runtime-local/verification/benchmarks/run.mjs \
  --candidate "$PWD" --smoke \
  --output "$PWD/tmp/session-agent-runtime-phase1/latency-inspection/after-files/unit2/session-log-benchmark/smoke-1"
```

The output directory must not exist. The command creates only that directory and its children.
It retains the synthetic seed databases and JSON reports. Temporary working databases are closed and removed.
Failures produce a nonzero exit and preserve available error reports.

For an A/B run, supply two explicit, checked, compiled worktree roots:

```sh
node packages/session/session-runtime-local/verification/benchmarks/run.mjs \
  --baseline /absolute/baseline-worktree --candidate /absolute/candidate-worktree \
  --sizes 20,200,2000 --iterations 10 --pairs 5 \
  --output "$PWD/tmp/session-agent-runtime-phase1/latency-inspection/after-files/unit2/session-log-benchmark/ab-1"
```

Each size is a count of five-entry groups: 100, 1,000, and 10,000 synthetic entries by default.
The codec runs all three sizes. SQLite runs 100 and 1,000 entries by default.
Its explicit history policy permits 16,384 entries, 8 MiB of content, and 262,144 index references.
The runner reports all three limits in each sample and checks both variants use the same limits.
Use `--sqlite-sizes` to select additional SQLite cases from `--sizes`.
Use `--history-max-entries`, `--history-max-bytes`, and `--history-max-index-references` to test larger caches explicitly.
Such overrides are labelled as a custom benchmark policy, separate from CLI latency acceptance.
The runner rejects capacity fallback instead of reporting it as a cached success.
One in sixty-four initial groups contains a user message, dispatch record, opened record, assistant message, and response.
Other initial groups contain five short user notes. The final budget check requires the 10,000-row codec case to fit 8 MiB.
Full call groups include UTF-8 and fixed-length bodies. The generator seed is `1701`.
Single-entry suffixes contain user messages. Batch suffixes contain one complete five-entry group.
Final entry, canonical-byte, and exposed index-reference counts must fit the configured policy or the run fails.
The same seed databases, content, policy, model profile, and generator parameters apply to both sides.
The model profile is synthetic and never causes network work.

The runner creates its seed through public admission, Session creation, input submission, and Run start operations.
It closes the Run borrow, runtime, log, admission, and storage owners before it copies the databases.
Every measured process opens a private copy and obtains a new real Run borrow.
The controlled admission probe and bootstrap callback are fixture inputs.
The log, transactions, Run grant, source capture, suffix reads, and history owner are real providers.

The baseline adapter calls the pre-existing public `readPrefix` and complete raw inspector.
The candidate adapter requires `readModelHistory` and `captureModelLogHistory`.
A missing export or raw fallback from the candidate is a failure.
Both adapters produce equivalent content and query answers. The Call query uses the public semantic selector for records and responses. It does not substitute the wider read-key range that can include assistant messages. They do not emulate absent product behavior.
The raw adapter uses public full-prefix interpretation because the baseline has no owned history API.

| Case | Timed work | Independent check after timing |
| --- | --- | --- |
| `codec.cold-capture-inspect` | Capture and model interpretation of the full synthetic prefix | All entries, tail, and exact prefix byte charge |
| `codec.same-tail-capture-inspect` | Empty suffix capture and inspection, or baseline full-prefix interpretation | The fixed row count and final complete digest |
| `codec.append-*-capture-inspect` | One suffix capture and interpretation | Complete raw expected prefix and unchanged earlier cut |
| `sqlite.cold-read-capture-inspect` | Original Run prefix read, capture, and interpretation | Complete raw expected prefix and public read counters |
| `sqlite.same-tail-read-inspect` | Real original Run read at the same tail and interpretation | Row count, final digest, and public read counters |
| `sqlite.append-*` | Real SQLite append and commit | Receipt positions and tail |
| `sqlite.suffix-*-read-inspect` | Read after a committed suffix, capture, and interpretation | Complete raw expected prefix and unchanged earlier cut |
| `*.lookup-*` | Position, MessageId, ResponseId, or Call lookup | Exact entries selected independently from generated raw data |
| `*.settlement-prepare` | Existing public settlement-member preparation | The expected response and assistant entries |

The oracle sorts JSON object keys independently and hashes all raw entries with SHA-256.
It computes expected bytes with the public lossless wire writer, not the history's reported size.
The checks deliberately remove one expected row and require the oracle to reject it.
Noncontiguous positions, unsupported model formats, and reads after borrow closure must fail.
Expected rejection counts and unexpected errors are separate fields.
The script awaits each operation and checks every returned result. It does not time fixture generation or oracle serialization.
After each capture/read, correctness checks consume all public Session facts against their raw envelopes.
This check warms the Session semantic checkpoint before extensions; Model inspection is already part of timed capture/read.
The append cases therefore represent a prior cut whose Model and Session consumers have both read it.
Untouched Session checkpoints and their additional lazy-index reservations are a separate uncovered workload.

Every A/B pair runs baseline then candidate, in separate processes and without overlap.
At least five pairs are required for A/B measurements. Smoke mode runs one pair and cannot support a performance claim.
`summary.json` reports median, minimum, and maximum per operation, CPU time, rows, and memory observations.
It also reports the median and range across independent process medians. Use that field for run-to-run comparisons.
Raw records retain each sample, content digests, imported-package `dist` hashes, Node version, source revision, and dirty-tree fingerprint.
Each sample records the actual history limits. `config.json` records sizes, process order, and machine load.
The configuration also records a hash of all executable benchmark files.
The retained seed gives both variants identical initial Session IDs and stored bytes.
The runner checks equal initial and final digests across runs. Each child has a configurable `--timeout-ms` limit, which defaults to 120,000 ms.

Run a profile separately, with no baseline:

```sh
node packages/session/session-runtime-local/verification/benchmarks/run.mjs \
  --candidate "$PWD" --profile --sizes 2000 --iterations 10 \
  --output "$PWD/tmp/session-agent-runtime-phase1/latency-inspection/after-files/unit2/session-log-benchmark/profile-1"
```

This profile command runs the 10,000-entry codec case. Include a matching `--sqlite-sizes` value to profile SQLite as well.
Profile-mode timings must not enter an A/B claim. Inspect the `.cpuprofile` to identify a limiter before interpreting speed differences.
Treat differences smaller than run variation as inconclusive.

The public participant wrapper counts source, prefix, and suffix calls and the rows those calls return.
It does not serialize rows inside the timed region.
No public port exposes old-entry decode counts, deep checks, copies, SQL statement counts, or persistent-node allocation.
Those counters remain unmeasured here. Rows returned are not a claim about physical disk reads.
SQLite cold means a cold process-owned history, not a flushed OS page cache.
Heap deltas include garbage collection. RSS includes dependencies, database caches, and fixture data.
Neither is a retained-memory bound.

Compaction and model-switch invalidation are not covered by this composing fixture.
Neither are CLI request assembly, network time, Files execution, concurrent operations, capacity eviction, or rollback races.
The main latency acceptance, product tests, and bounded models retain those obligations.
This benchmark uses the contracts in [SessionRuntime](../../../../core/session-runtime/SPEC.md),
[Session Log](../../../../core/session-log/SPEC.md), [the provider](../../SPEC.md),
and [Model Runtime](../../../../core/model-request-runtime/SPEC.md).
