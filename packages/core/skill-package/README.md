# skill-package

Pure skill-package values and readers. Pass text or entries already read by the caller;
the package performs no filesystem access and never expands or executes skill body text.

The adopted contract and provider boundary live in the
[realization node](../../../.meta_harness/design/realization/packages/core/skill-package/README.md).

Run `pnpm --filter @omne-harness-lite/skill-package run build`, `typecheck`, and `test`
from the workspace root. Import the built public package or its `./schema` export.

Both readers return `undetermined: { reason: 'yaml_key_tag', tags }` when key uniqueness
depends on the missing canonical form of an unresolved scalar tag. This technical
read gap provides neither a successful manifest nor a domain rejection. Known Core
violations still reject; unknown properties that require no such comparison remain
ignored with a trace. Recursive node comparisons use coinduction: a pair revisited
on the current comparison path is equal, subject to its other structural members.
