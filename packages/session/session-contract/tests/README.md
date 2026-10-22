# tests

本目录承载本包适用的持续测试。测试种类的责任与边界见仓库[包级测试责任与边界](../../../../docs/verification.md#包级测试责任与边界)。

## 允许的内容

`*.spec.ts` 运行测试、`*.spec-d.ts` 类型测试、测试辅助代码，以及 `fixtures/` 下的固定输入。

## 边界

本成员没有运行实现，测试不需要真实存储、服务或 Cordis，也不需要替身。测试通过不代替规格或验收。

## 维护

公开行为或 `SPEC.md` 条款变化时，同步对应测试与本目录 `index.md`。候选声明进入根入口时，同一次修改要更新导出测试。

## 本包事实

现在只有 [public-entry.spec.ts](public-entry.spec.ts)。它断言根入口没有任何导出。没有 `*.spec-d.ts` 类型测试。`vitest.config.ts` 已经为类型测试打开了 typecheck。

运行方式：在仓库根执行 `pnpm turbo run test --filter=@omne-harness/session-contract`，或在本包目录执行 `pnpm test` 与 `pnpm typecheck`。

当前缺口：SPEC 的[持续验证义务与未覆盖](../SPEC.md#持续验证义务与未覆盖)与[候选的持续验证义务](../SPEC.md#候选的持续验证义务)都还没有测试，现有测试不证明其中任何一条。候选声明进入后，先补纯函数的定义层拒绝与归约结果，再由存储成员与真实组合补共同提交、并发与恢复。具名维护者由负责人指定。
