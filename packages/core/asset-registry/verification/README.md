# Registry verification

Run build, typecheck, and tests for the public shapes and pure decisions in [SPEC](../SPEC.md). Include exact composition order, six table contents, lossless record/report reads, dependency distinctions, current permission projection, captured schema initialization, root-source extraction, and invalid-input precedence.

The provider and real consumers must also test seven-operation behavior: atomic fill, reload with a complete H retry, historical run versus current session reads, only shrinking on failure/change, unknown versus none, and fixed refresh observations. Keep original fill, old table E1, and newer E2 present together. After all categories change and the provider reopens, readGiven must still recover the original full fill. A bad newest given must fail without fallback or further body reads.

Use actual manifest storage and source authorization for crash/reopen and concurrent-head tests. Missing historical bodies cannot be replaced by current bodies. Captured roles cannot replace current authorization.
The current non-MCP report reader and unavailable external dependency facts do not verify the complete MCP bridge, modality, storage-reader, mode, or provider self-report paths. AR has no independent formal model; MF owns the common commit guarantee and AE owns evaluation models.
