# Verification

The owner-level tests use the public owner and fact interfaces with real SQLite storage Workers. [world.ts](world.ts) constructs the SQL catalog and a category contract whose declaration depends on the fixed asset body. It also combines the real Assets guard with the real Settings persistence participant. The Settings access fixture supplies caller qualification only.

| File                                       | Defect detected                                                                                                                                      |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| [settings-governance.spec.ts](settings-governance.spec.ts) | Real Identity, independent target and Assets holding combine through the same Settings application; removal, revocation, version re-adoption and undeclared assets preserve boundaries. |
| [asset-read.spec.ts](asset-read.spec.ts) | Current publication revision is confused with holding or owner sequence; a stale snapshot overwrites a newer version; missing and unavailable results are conflated. |
| [persistence.spec.ts](persistence.spec.ts) | A committed body, holding or operation disappears after reopening storage.                                                                           |
| [holdings.spec.ts](holdings.spec.ts)       | Immutable versions change, stale revisions succeed, follow and pinned selections diverge incorrectly, or removed identities revive.                  |
| [guards.spec.ts](guards.spec.ts)           | A removed holding, stale definition, revoked grant or changed source layout permits a Settings commit. A fresh holding inherits prior values.        |
| [projection.spec.ts](projection.spec.ts)   | Capture invents targets, crosses scopes, truncates overflow or declares a second guard producer.                                                     |
| [failures.spec.ts](failures.spec.ts)       | A lost reply duplicates publication, caller metadata replaces category declarations, corrupt data looks available, or close destroys shared storage. |

Run `pnpm run build`, `pnpm run typecheck` and `pnpm run test:fast` from this package. The 129-holding test has a 30-second timeout. Database fixtures are written below the task's `tmp/closures/assets-local/databases/` directory.

Targeted mutation obligations remove the held-state check and remove the exact definition-reference check during guard execution. The package tests must reject both changes. Root-level structural measurements, broad differential mutation and independent acceptance are separate evidence.

The [manual example](../examples/README.md) uses the same real providers with isolated demonstration data. These resources establish tested composition behavior, not final UI, execution adoption or independent acceptance.


[source-layout-migration.spec.ts](source-layout-migration.spec.ts)验证持有的来源迁移。它用磁盘SQLite检查分页、重复执行、重开和removed状态保留。缺失身份的旧来源保留为unmapped，已有完整身份不被重写。三域组合中的同ID换拥有者、拒绝retain和显式discard由[settings-governance.spec.ts](settings-governance.spec.ts)验证。

[historical-receipts.spec.ts](historical-receipts.spec.ts) injects historical Storage replies at the public owner query boundary. It checks old hold/source-update success and rejection recovery, exact command conflicts, malformed IDs and foreign domains. The reply fixture does not establish an old-binary database upgrade. Current mutation admission continues to reject the historical command form.
