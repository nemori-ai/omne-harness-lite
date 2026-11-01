# tests

本目录承载本包适用的持续测试。测试种类的责任与边界见仓库[包级测试责任与边界](../../../../docs/verification.md#包级测试责任与边界)。

## 允许的内容

`*.spec.ts` 等测试文件、测试辅助代码，以及 `fixtures/` 下的固定输入。

## 边界

目标是用真实的 SQLite 与 PostgreSQL 提供者测试，不用内存替身，因为本包的行为就是对这些介质的行为。现在的夹具在 `node:sqlite` 的内存库上运行本包真实的 participant 与 handler 模块，`decide` 与 `reduce` 用 session-contract 的真实纯函数。夹具不经过 sqlite-provider 的 Worker，所以不覆盖 Worker、持久、关闭、受理队列与限额。本包没有 Cordis 入口，也没有 Cordis 用例。测试通过不代替规格或验收。

## 维护

公开行为或 `SPEC.md` 条款变化时，同步对应测试与本目录 `index.md`。导出进入根入口时，同一次修改要更新 `public-entry.spec.ts` 的导出集合。

## 本包事实

现有文件：

- [public-entry.spec.ts](public-entry.spec.ts)：根入口的导出集合是 `SESSION_PARTICIPANT`、`createSessionStorage`、`sessionStorageMaterials`；没有 `./cordis`（不在 `exports`、不可导入、源文件不存在）；源码只经 `@omne-harness/sql-contract` 与 `@omne-harness/sql-contract/worker` 导入 SQL 形状，不导入 `packages/storage/**`、sqlite-provider 或 `node:sqlite`，`package.json` 不依赖 sqlite-provider；每个读 handler 是 `snapshot`；每条 SELECT 有 LIMIT。
- [tenant-isolation.spec.ts](tenant-isolation.spec.ts)：访问裁定不放行时每个入口 `denied`，且没有任何调用到达存储；访问指名别的租户或会话的 `commit` 被拒绝；另一租户的会话读为 `denied`，向它提交不改变它；`pending` 只列出本租户的会话；两个租户的同名会话是两个会话；每次调用用本租户的事务域；目录答了别的租户时拒绝，目录不认识该租户时 `unavailable` 而不是空。
- [fixtures/](fixtures/README.md)：测试夹具，见该目录。

局限：这些用例是负控与入口检查，没有先红后绿记录。派生等于重算、分页与游标属性、写路径各 JC 行、并发写与失败分类注入尚未写（[验证义务](../docs/verification-obligations.md)）。夹具之外的真实提供者没有用例。

运行方式：在仓库根执行 `pnpm turbo run test --filter=@omne-harness/session-storage-sql`，或在本包目录执行 `pnpm test` 与 `pnpm typecheck`。具名维护者由负责人指定。
