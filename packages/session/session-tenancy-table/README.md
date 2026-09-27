# @omne-harness-lite/session-tenancy-table

Persistent session holding identity backed by the public Storage protocol. `createSessionTenancyReader(storage)` provides `holdingTenant(session)` and a borrowed `participate(unit).holdingTenant(session)` for a real shared transaction. `close()` rejects new reads and waits for admitted reads; it does not close storage or delete mappings.

Compose `sessionTenancyMigrations` before admission. The Cordis plugin provides only `sessionTenancy.holdingTenant`; standalone components use the same reader. `/seed` is restricted by repository structure checks to the approved acceptance bootstrap and tests. It is not a product session creation API. An unknown session, invalid input and unavailable storage remain distinct.

Build, typecheck and test using the corresponding pnpm package scripts. Tests use temporary file SQLite databases. Storage durability and upgrade confirmation still constrain when a previously observed identity can be retained.
