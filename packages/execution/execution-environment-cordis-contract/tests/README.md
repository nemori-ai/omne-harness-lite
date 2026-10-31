# tests

本目录承载本包适用的持续测试。测试种类的责任与边界见仓库[包级测试责任与边界](../../../../docs/verification.md#包级测试责任与边界)。

## 允许的内容

`*.spec.ts` 运行测试、`*.spec-d.ts` 类型测试、测试辅助代码，以及 `fixtures/` 下的固定输入。

## 边界

本成员只有服务定义，没有 Service 实现。本目录的测试核对入口的导出与键、九个模板方法的调用方类、装载撤除、调用方效应及三条机制读数。测试在真实 Cordis 上运行，不需要替身。登记随调用方撤除、撤除即退役与关闭顺序归 Service 实现的测试，见 [execution-environment-host-local](../../execution-environment-host-local/tests/README.md)。测试通过不代替规格或验收。

## 维护

公开导出或 SPEC 性质变化时，同步对应测试与本目录 `index.md`。新增导出时，同一次修改要更新 [cordis-entry.spec.ts](cordis-entry.spec.ts) 里的导出集合。

## 本包事实

当前测试包括：

- [public-entry.spec.ts](public-entry.spec.ts)：根入口没有运行导出。
- [cordis-entry.spec.ts](cordis-entry.spec.ts)：键常量等于 `executionEnvironment` 与 `ExecutionEnvironmentService.provide`；`./cordis` 的导出集合、三类调用方、未声明/非法/祖先声明、三条机制读数及调用方效应；探针子类作为插件装载时在键上提供服务，插件卸载后键上没有服务；恢复授权键常量等于 `ExecutionRecoveryAuthorityService.provide`，子类装载后在这个键上答复，卸载后键上没有服务。

没有 `*.spec-d.ts` 类型测试。运行方式：在仓库根执行 `pnpm --filter @omne-harness/execution-environment-cordis-contract test`，或在本包目录执行 `pnpm test` 与 `pnpm typecheck`。当前运行环境与本次输出留任务临时目录，长期正文只维护测试的持续范围。

[SPEC 性质 8](../SPEC.md#结果与不变量) 的两个源码入口与构建根入口导入边界已有检查。提供者退役的真实资源效果仍由实现与提供者组合验证。具名维护者由负责人指定。

- [exports-inventory.spec.ts](exports-inventory.spec.ts)：共享工具比较构建产物、机读导出清单与公开导航。
