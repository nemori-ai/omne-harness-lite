# skill-package

Pure skill-package values and readers. Pass text or entries already read by the caller;
the package performs no filesystem access and never expands or executes skill body text.

The adopted contract and provider boundary live in the
[realization node](../../../.meta_harness/design/realization/packages/core/skill-package/README.md).

Run `pnpm --filter @omne-harness-lite/skill-package run build`, `typecheck`, and `test`
from the workspace root. Import the built public package or its `./schema` export.
