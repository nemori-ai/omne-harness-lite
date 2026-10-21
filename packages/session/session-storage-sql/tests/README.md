# tests

本目录承载本包适用的持续测试。测试种类的责任与边界见仓库[包级测试责任与边界](../../../../docs/verification.md#包级测试责任与边界)。

## 允许的内容

`*.spec.ts` 等测试文件、测试辅助代码，以及 `fixtures/` 下的固定输入。

## 边界

写路径与读路径的测试用真实的 SQLite 提供者，PostgreSQL 的用例用真实的 PostgreSQL 提供者，不用内存替身，因为本包的行为就是对这些介质的行为。存储契约的提供者还没有可依赖的 workspace 成员，这类测试要等它。`decide` 与 `reduce` 用 session-contract 的真实纯函数。Cordis 入口的测试在真实 Cordis 4.0.4 上运行。测试通过不代替规格或验收。

## 维护

公开行为或 `SPEC.md` 条款变化时，同步对应测试与本目录 `index.md`。导出进入根入口或 `./cordis` 时，同一次修改要更新对应的导出测试。

## 本包事实

现在有两个测试。[public-entry.spec.ts](public-entry.spec.ts) 断言根入口没有导出，[cordis-entry.spec.ts](cordis-entry.spec.ts) 断言 `./cordis` 入口没有导出。它们只证明模板状态，不证明任何 SPEC 行为。

运行方式：在仓库根执行 `pnpm turbo run test --filter=@omne-harness/session-storage-sql`，或在本包目录执行 `pnpm test` 与 `pnpm typecheck`。

当前缺口：[验证义务](../verification/obligations.md)里的各组都还没有测试，包括派生等于重算、读路径复杂度与退化、写路径与并发写裁定、失败分类。[Cordis 集成的验证义务](../docs/cordis.md#验证义务)列出的八项也还没有测试。复杂度场景需要测量，不只是断言。具名维护者由负责人指定。
