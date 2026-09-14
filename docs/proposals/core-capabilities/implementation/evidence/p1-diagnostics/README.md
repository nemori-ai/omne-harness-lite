# P1 D1 shared diagnostics evidence

This directory records implementation evidence for the project-owned
`@omne-harness-lite/diagnostics` package. The product revision is
`4b8125eb953c97893bdeeeeafac3fb77d276d208`, based on implementation input revision
`0e80245bf262b13d466b9ec18bec6f9bdf7eea65`. It implements the accepted D-010 provider boundary;
this evidence is a worker verification result, not independent architecture review or final HUB
acceptance.

## Fixed inputs

The seven construction inputs were read at the fixed baseline before implementation:

| Input | SHA-256 |
|---|---|
| `README.md` | `0aeed06af6301ff6be367f30079627f278c5ba310c384697698669bd4bb0409b` |
| `scope.md` | `95c54a993dab0f750d8c61321e0956353b1bd588b21e1ddc3f8d9a76ec799ddd` |
| `acceptance.md` | `82868e685b1bc032839f915562399bd64957e09700f0f76d7a98a6e7179d0ec8` |
| `implementation-spec.md` | `cb3e2e970c1e1b4d9217f5310048c59d29e7d6d066e6224578455594f68dd05f` |
| `plan.md` | `98335bf291dbbce15b820b4d14c075095e3b9c784aa5e7d953861c7215403bfe` |
| `observability.md` | `b29fd618fb0854ad3d3884d2b0a9f7799a66d6f8307d2dd056a07366c7a2d119` |
| `shared-interfaces.md` | `8faa90a25b3009cee56027aa30b636051b8a972c6fcf9dfd28968fcad85b0fb5` |

D-010 was fixed at `5e81ee83e791d3aafffd88da2e418ff91b11b068`. The package consumes the accepted
work-data and records public entries, with input revisions listed in [environment.log](environment.log).
It does not declare source aliases, fake Principal/Counter interfaces, reverse logging edges, Cordis,
or a research `sdk-trace-base` product selection.

## Implemented boundary

The default entry publishes exactly the D-010 recording types, opaque context/span handles,
`DiagnosticsRuntime`, `LocalDiagnosticsOptions`, and `createLocalDiagnostics`. The implementation
uses one private ALS manager and one non-global OTel `TracerProvider` per runtime. A synchronous local
span processor projects completed spans into the same Pino/Sonic JSONL stream as log points.

The projector reads data descriptors only and accepts the fixed Principal, Causality, OperationRef,
Position, Watermark, phase/code/level, and measure shapes. It bounds strings and counters before they
reach Pino or OTel. Unknown keys, accessors, `toJSON`, cycles, invalid ownership associations, and
arbitrary backend codes become fixed aggregate gaps or safe codes. No raw error, body, target, URL,
header, argument, stack, message, or secret field is formatted.

Local resources use 0700 directories, 0600 files, sourceId-keyed exclusive `wx` creation, and the
same acquired descriptor for Sonic output. Record, span, Sonic buffer, source-file, directory, and
file-count budgets all stop output at their actual boundary. Status separately reports attempted,
accepted, dropped, pending, actual write callback bytes, pending age, stalled/failed state, active
spans, gaps, last safe error, and held/released/unknown resource responsibility. Startup, write, and
close failures retain acquired cleanup responsibility; deadlines only stop the caller's wait, and a
later close retries the same owner.

## O01-O08 observations

| Observation | D1 provider evidence |
|---|---|
| O01 | Exact result, synchronous throw, rejected Promise, and Promise identity are preserved. `within` calls the body once, reads no `then`, and 10,000 unresolved Promises create no span/scope task table or close dependency. Real EIO leaves a business marker unchanged. |
| O02 | Two tenants interleave across async continuations while root timers remain null. Explicit parent contexts produce one OTel trace without cross-tenant ambient attribution; separate runtimes own separate ALS/provider state. |
| O03 | Real files and OTel span records were checked with getter, `toJSON`, cyclic, overlong UTF-8/counter, body/error/rawArgs/header/URL/target/secret sentinels and an arbitrary backend code. Only fixed accepted projection remains. |
| O04 | Tests exceed UTF-8 record, two active spans, Sonic buffer repeatedly with warn/error records, source file, directory, and file-count budgets. Every fixed reason has one bounded aggregate; actual accepted/drop counters and file length remain within their caps. |
| O05 | A single low-traffic record becomes readable before another log or close. Delayed real `fs.write` reaches stalled after monotonic 1000 ms, partial callbacks advance exact bytes to the complete readable file boundary, EIO becomes failed, unclean prior sources become unknown-quality crash gaps, and retention exhaustion creates a visible degraded runtime. |
| O06 | Unfinished spans and delayed disk callbacks keep close blocked; concurrent deadlines share one close task. The original span may end while closing. Startup/close cleanup EIO remains unknown and is retryable. Late logs/spans cannot touch a released stream; 10,000 unresolved bodies do not block close. |
| O07 | Two real factory instances, cross-instance source collision, a newer live source during an older delayed close, old late references, and old release/new resource separation are covered. These are the provider primitives used by the product host's later generation switch. |
| O08 | Exact direct dependencies, provenance coverage, default export declarations, workspace boundaries, all 17 isolated package closures, composition, and a separate packed default-entry file/log/span/close consumer passed. |

The calibrated RED and corresponding GREEN transcripts are kept as separate files in this directory.
They cover the initial source lifecycle, ALS/projection, spans/close, creation failures, output
progress, source truth, exclusive descriptor, retryable close, startup cleanup, backend-code safety,
and packed CJS interop. The final aggregate commands and artifact hashes are in
[green-o08-package-artifacts.log](green-o08-package-artifacts.log).

## Scope limits

O01's real admission outer gate/inner submit and O09/O10's JSONL fsync, publication, quarantine, and
cleanup composition belong to D2 consumers. O07's atomic host configuration switch belongs to the
product host. O11's Cordis bridge and O12/P3 query/export remain outside D1. The README explicitly
warns consumers that Sonic with `minLength: 0` may start `fs.write` in the synchronous `log` call,
so real output must stay outside short business gates.

The output is local operational diagnostics with `fsync: false`; no result here claims a durable
business audit, business completion, remote export, governed query, or hard real-time write bound.
The root workspace lock/config integration remains the HUB owner's responsibility.
