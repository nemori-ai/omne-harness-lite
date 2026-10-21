# tests

本目录承载本包适用的持续测试。测试种类的责任与边界见仓库[包级测试责任与边界](../../../../docs/verification.md#包级测试责任与边界)。

## 允许的内容

`*.spec.ts` 运行测试、`*.spec-d.ts` 类型测试、测试辅助代码，以及 `fixtures/` 下的固定输入。

## 边界

本成员只有服务定义，没有 Service 实现。本目录的测试只核对入口的导出与键，并用一个探针子类核对键上的装载与撤除。测试在真实 Cordis 上运行，不需要替身。登记随调用方撤除、撤除即退役与关闭顺序归 Service 实现的测试，见 [execution-environment-host-local](../../execution-environment-host-local/tests/README.md)。测试通过不代替规格或验收。

## 维护

公开导出或 SPEC 性质变化时，同步对应测试与本目录 `index.md`。新增导出时，同一次修改要更新 [cordis-entry.spec.ts](cordis-entry.spec.ts) 里的导出集合。

## 本包事实

现在有两个测试文件，共四个测试：

- [public-entry.spec.ts](public-entry.spec.ts)：根入口没有运行导出。
- [cordis-entry.spec.ts](cordis-entry.spec.ts)：键常量等于 `executionEnvironment` 与 `ExecutionEnvironmentService.provide`；`./cordis` 只导出抽象类与键常量；探针子类作为插件装载时在键上提供服务，插件卸载后键上没有服务。

没有 `*.spec-d.ts` 类型测试。运行方式：在仓库根执行 `pnpm --filter @omne-harness/execution-environment-cordis-contract test`，或在本包目录执行 `pnpm test` 与 `pnpm typecheck`。2026-10-21 在 Node v24.18.0、linux 上，四个测试全部通过。

当前缺口：没有核对 [SPEC 性质 8](../SPEC.md#结果与不变量) 的逐文件导入检查，也没有调用方类核对的测试。具名维护者由负责人指定。
