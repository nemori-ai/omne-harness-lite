# `@omne-harness-lite/diagnostics`

This private, project-owned package implements the D-010 shared diagnostics boundary. Its default
entry exports the passive `Diagnostics` recording surface, opaque context and span handles, the
trusted `DiagnosticsRuntime` management surface, and the D-011
`createLocalDiagnosticsDirectory` factory. A trusted host creates one directory owner and uses
`owner.create` for every source generation. The former independent source factory is not exported.

The local factory uses a private OpenTelemetry `TracerProvider` and
`AsyncLocalStorageContextManager`; it does not register a global provider or context manager.
Completed spans and structured log points pass through the same Pino 10.3.1 and SonicBoom 4.2.1
JSONL source. Projection accepts only the fixed identity, causality, position, watermark, phase,
code, and measure fields. Accessors, `toJSON`, unknown properties, overlong values, raw arguments,
request or response bodies, URLs, headers, secrets, and `Error` contents never enter Pino or OTel.

The directory owner holds a native nonblocking `flock` on a stable zero-byte
`.diagnostics.lock`, scans retained source files, reserves source slots before open, and shares one
byte ledger across old, new, and pending generations. Each source uses an exclusive descriptor,
directory mode 0700, file mode 0600, fixed record, buffer, span, and file budgets, and bounded
aggregate gap state. Runtime
inspection distinguishes attempted, accepted, pending, actually written, stalled, failed, and
released states. A valid configuration whose output cannot be prepared still returns a visible
degraded runtime and retains any acquired cleanup responsibility. `close` is repeatable: a deadline
only bounds that caller's wait, while the runtime keeps the original spans, output, and descriptor
responsibility until it can report a real close. The owner seals new creates, joins source
preparation and close, reconciles final file sizes, and releases its lock last. A raw close result
that cannot prove which resource remains is reported as `unknown` and is never retried by numeric
file descriptor.

`within` calls the body once and returns its exact value, throw, or Promise identity. It does not
inspect Promise settlement or keep a list of business scopes. The synchronous recording methods
are passive with respect to business results, but SonicBoom with `minLength: 0` can start
`fs.write` in the same call stack. Consumers must call `log`, `startSpan`, and `end` outside their
short admission or commit gates, as required by the accepted composition.

This source is local operational diagnostics. It is not durable business audit, a remote exporter,
a general telemetry or retry queue, a governed query API, a Cordis logger bridge, or the product
host's generation-switch coordinator. The JSONL and admission packages consume this entry at their
own real boundaries; their fsync, admission, publication, and host-switch behavior is outside this
package.
