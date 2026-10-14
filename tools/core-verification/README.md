# core-verification

This tool used to import the legacy workspace packages and check their public surfaces. Those packages are no longer workspace members. The default `build`, `typecheck`, and `test` scripts do not compile or run the old consumers.

The old consumer files remain in `src/`, `tests/`, and `fixtures/` as reference. They are excluded from `tsconfig.build.json`, `tsconfig.test.json`, and the Vitest include list. They are not evidence that the legacy packages still pass.

New package behavior is verified by the package that owns it.
