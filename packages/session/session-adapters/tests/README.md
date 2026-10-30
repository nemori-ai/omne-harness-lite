# tests

本目录承载本包适用的持续测试。测试种类的责任与边界见仓库[包级测试责任与边界](../../../../docs/verification.md#包级测试责任与边界)。

## 允许的内容

`*.spec.ts` 运行测试、`*.spec-d.ts` 类型测试、测试辅助代码，以及 `fixtures/` 下的固定输入。

## 边界

本成员没有运行实现，现有测试只导入两个入口，不需要真实存储或服务，也不需要替身。翻译纯函数的测试不需要 Cordis。插件的测试需要真实 Cordis 容器，邻域一侧用其契约的提供者或最小替身。本成员只验证翻译与对应，不验证邻域行为。测试通过不代替规格或验收。

## 维护

公开行为或 `SPEC.md` 条款变化时，同步对应测试与本目录 `index.md`。导出进入入口时，同一次修改要更新导出测试。

## 本包事实

现在有两个测试。[public-entry.spec.ts](public-entry.spec.ts) 断言根入口没有导出，[cordis-entry.spec.ts](cordis-entry.spec.ts) 断言 `./cordis` 没有导出。类型测试只有 [record-fault.spec-d.ts](record-fault.spec-d.ts)。`vitest.config.ts` 已经为类型测试打开了 typecheck。

运行方式：在仓库根执行 `pnpm turbo run test --filter=@omne-harness/session-adapters`，或在本包目录执行 `pnpm test` 与 `pnpm typecheck`。

当前缺口：SPEC 的[组合与验证](../SPEC.md#组合与验证)里的 VA-01 至 VA-19 都还没有测试，现有骨架测试不证明其中任何一条。翻译纯函数进入后，先补模式翻译表逐格、身份编码与结果对应的测试，再补插件的失败与换代行为。具名维护者由负责人指定。
