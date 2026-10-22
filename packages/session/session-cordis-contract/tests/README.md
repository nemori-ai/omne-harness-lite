# tests

本目录承载本包适用的持续测试。测试种类的责任与边界见仓库[包级测试责任与边界](../../../../docs/verification.md#包级测试责任与边界)。

## 允许的内容

`*.spec.ts` 运行测试、`*.spec-d.ts` 类型测试、测试辅助代码，以及 `fixtures/` 下的固定输入。

## 边界

本成员没有运行实现，现有测试只导入两个入口，不需要真实存储或服务，也不需要替身。服务定义进入后，调用方类与端口缺席的行为需要真实 Cordis 容器，不用替身代替。测试通过不代替规格或验收。

## 维护

公开行为或 `SPEC.md` 条款变化时，同步对应测试与本目录 `index.md`。服务定义进入 `./cordis` 时，同一次修改要更新导出测试。

## 本包事实

现在有两个测试。[public-entry.spec.ts](public-entry.spec.ts) 断言根入口没有导出，[cordis-entry.spec.ts](cordis-entry.spec.ts) 断言 `./cordis` 没有导出。没有 `*.spec-d.ts` 类型测试。`vitest.config.ts` 已经为类型测试打开了 typecheck。

运行方式：在仓库根执行 `pnpm turbo run test --filter=@omne-harness/session-cordis-contract`，或在本包目录执行 `pnpm test` 与 `pnpm typecheck`。

当前缺口：SPEC 的[实现与验证](../SPEC.md#实现与验证)列出的义务都还没有测试，现有骨架测试不证明其中任何一条。服务定义进入后，先补键唯一、根入口不加载绑定与定义入口不导入提供者的检查，调用方类、端口缺席与事件载荷由提供者成员验证。具名维护者由负责人指定。
