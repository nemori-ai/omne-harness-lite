# Model runtime verification

[Models and limits](models/README.md) owns the finite execution-source and provider-borrow properties, assumptions, positive configurations and negative controls.

Run each configuration with TLC from the repository root, for example:

```sh
java -cp /path/to/tla2tools.jar tlc2.TLC -workers 1 -metadir tmp/model-runtime-tlc -config packages/model/model-request-runtime-local/verification/models/provider-borrow/ProviderBorrow.cfg packages/model/model-request-runtime-local/verification/models/provider-borrow/ProviderBorrow.tla
```

The positive configurations must satisfy their invariants. Each negative configuration must fail the named invariant; a tool startup failure is not a successful negative control. Model checking does not establish authorization, IO stopping, GC, progress or complete Session coordination. Actual provider, SQLite/TLS and recovery tests remain necessary. The member owns reusable inputs; each verifier records its run output in the worktree's `tmp/`.
