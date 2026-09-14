# @omne-harness-lite/jsonl

Local `core-journal/1` durable-record provider. The default entry exports
`createJsonlProvider(options, diagnostics)` with the `RecordProvider` contract from
`@omne-harness-lite/records`. The factory consumes a trusted absolute domain directory and
injected bounded diagnostics; the application continues to own both resources.

The provider uses `journal.jsonl` and the stable zero-byte `.writer.lock` inode in that directory.
It keeps the flock from recovery through writer close, records writer epochs in the same journal,
returns pending positions before asynchronous I/O, and advances durable receipts only after file
sync. Recovery validates the complete prefix and preserves an incomplete final fragment before
truncating it. Complete corrupt lines and unknown formats make acquisition unavailable.

The ordinary source primitives remain available at `@omne-harness-lite/jsonl/baseline` and through
the default entry. They do not independently provide locking, journal validation, or recovery.

Build in the repository with `pnpm --filter @omne-harness-lite/jsonl... build`; tests use compiled
artifacts. `fs-ext@2.1.1` is a native dependency and must be built only through the repository's
allowlisted native build path. Supported P1 evidence is Linux 5.15 on a local ext-family filesystem,
Node 24.18, and GCC 10; network filesystems and Windows are outside this provider's current scope.

The accepted writer, lock, recovery, failure, and cleanup mapping is maintained in
[design.md](design.md). Package verification is recorded in
[evidence/provider/README.md](evidence/provider/README.md). The accepted P1 composition with admission
and D1, including the final five-package consumer, is recorded in
[application evidence](../../../apps/local-harness/evidence/storage-admission/README.md) at the fixed
HUB revision `31197742905a3c66fc3e650c153d65d014372c21`. It covers the storage/admission slice;
governance decisions and the complete Agent/Session/tool runtime remain undelivered.

See [source scope](../../../docs/proposals/core-capabilities/fork/jsonl-source.md),
[package layout](../../../docs/proposals/core-capabilities/fork/package-layout.md),
and [provenance](provenance.json). Original MIT notice is retained in [LICENSE](LICENSE).
