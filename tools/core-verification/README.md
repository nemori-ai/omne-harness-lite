# core-verification

This tool no longer runs the legacy public-surface consumers. The consumer sources, fixtures, and tests have been removed from the package. `apps.0.0.1.legacy` and `packages.0.0.1.legacy` stay in the repository as readable reference. This package does not import them.

`build` only removes `dist`. `typecheck` and `test` cover `tests/legacy-suite-exit.spec.ts`. That test checks that the manifest does not depend on the old packages and that the old consumer files are absent.

New package behavior is verified by the package that owns it.
