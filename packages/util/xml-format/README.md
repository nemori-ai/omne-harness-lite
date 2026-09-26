# xml-format

Declarative formatting functions imported through `@omne-harness-lite/xml-format`. Build before
consuming the public `dist` entry; run this member's `build`, `typecheck` and `test`
scripts from the workspace. Runtime dependencies are empty.

The [implementation map](../../../.meta_harness/design/realization/packages/util/xml-format/README.md)
owns adopted behavior and verification requirements. [provenance.json](provenance.json)
records fixed source files and adaptations. The source golden under `tests/fixtures`
is a finite comparison fixture; these tests do not rerun the original Python producer.

Use `formatXml(value, schema, options)` for explicitly selected fields. `toXml` is
a trusted caller hook that can supply raw markup; getters and date callbacks also
run caller code. Consult the implementation map before accepting active objects.
