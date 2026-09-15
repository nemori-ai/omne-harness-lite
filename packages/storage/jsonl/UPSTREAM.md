# Source provenance

Selected from [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness/tree/c291e7961a515f6d7af9304e7fd1d257929aef26)
at `c291e7961a515f6d7af9304e7fd1d257929aef26`.

[provenance.json](provenance.json) owns each original file hash, retained snapshot,
active target and adaptation. Original files in `upstream/` are neither compiled nor
packed. The original MIT [license](LICENSE) ships with the built package.

The [source scope](../../../docs/proposals/core-capabilities/fork/jsonl-source.md) records exclusions,
source/target differences and verification limits. The [layout revision](../../../docs/proposals/core-capabilities/fork/package-layout.md)
moves the existing source baseline into independently consumable responsibility packages.

The project-owned provider in `src/provider.ts` adds the accepted records/diagnostics boundary,
stable `fs-ext@2.1.1` flock, writer epochs, strict prefix recovery, durable acknowledgements, and
acquisition cleanup. The selected upstream ordinary file operations remain isolated in
`src/file-ops.ts`; upstream did not provide the product journal protocol or its lifecycle guarantees.
