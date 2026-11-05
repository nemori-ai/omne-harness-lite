# Verification

The owner-level tests use the public owner and fact interfaces with real SQLite storage Workers. [world.ts](world.ts) constructs the SQL catalog and a category contract whose declaration depends on the fixed asset body. It also combines the real Assets guard with the real Settings persistence participant. The Settings access fixture supplies caller qualification only.

| File                                       | Defect detected                                                                                                                                      |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| [settings-governance.spec.ts](settings-governance.spec.ts) | Real Identity, independent target and Assets holding combine through the same Settings application; removal, revocation, version re-adoption and undeclared assets preserve boundaries. |
| [persistence.spec.ts](persistence.spec.ts) | A committed body, holding or operation disappears after reopening storage.                                                                           |
| [holdings.spec.ts](holdings.spec.ts)       | Immutable versions change, stale revisions succeed, follow and pinned selections diverge incorrectly, or removed identities revive.                  |
| [guards.spec.ts](guards.spec.ts)           | A removed holding, stale definition, revoked grant or changed source layout permits a Settings commit. A fresh holding inherits prior values.        |
| [projection.spec.ts](projection.spec.ts)   | Capture invents targets, crosses scopes, truncates overflow or declares a second guard producer.                                                     |
| [failures.spec.ts](failures.spec.ts)       | A lost reply duplicates publication, caller metadata replaces category declarations, corrupt data looks available, or close destroys shared storage. |

Run `pnpm run build`, `pnpm run typecheck` and `pnpm run test:fast` from this package. The 129-holding test has a 30-second timeout. Database fixtures are written below the task's `tmp/closures/assets-local/databases/` directory.

Targeted mutation obligations remove the held-state check and remove the exact definition-reference check during guard execution. The package tests must reject both changes. Root-level structural measurements, broad differential mutation and independent acceptance are separate evidence.

The [manual example](../examples/README.md) uses the same real providers with isolated demonstration data. These resources establish tested composition behavior, not final UI, execution adoption or independent acceptance.
