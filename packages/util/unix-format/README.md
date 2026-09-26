# unix-format

Pure formatting functions imported through `@omne-harness-lite/unix-format`. Build before
consuming the public `dist` entry; run this member's `build`, `typecheck` and `test`
scripts from the workspace. Runtime dependencies are empty.

The [implementation map](../../../.meta_harness/design/realization/packages/util/unix-format/README.md)
owns adopted behavior and verification requirements. [provenance.json](provenance.json)
records fixed source files and adaptations. The source golden under `tests/fixtures`
is a finite comparison fixture; these tests do not rerun the original Python producer.

Use `formatSection`, `formatTable` or `formatNumberedLines` with explicit render
options. Widths count Unicode code points; they do not measure terminal cells.
