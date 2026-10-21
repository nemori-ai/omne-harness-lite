# tests

本目录承载本包适用的持续测试。测试种类的责任与边界见仓库[包级测试责任与边界](../../../../docs/verification.md#包级测试责任与边界)。

## 允许的内容

`*.spec.ts` 运行测试、`*.spec-d.ts` 类型测试、测试辅助代码，以及 `fixtures/` 下的固定输入。

## 边界

本成员只有服务定义，没有提供者实现。本目录的测试只核对入口的导出与导入边界，不装载提供者，也不需要替身。登记、重名、遮蔽、逐请求变量与事件的行为要在真实 Cordis 上验证：basis probe 归 basis 的承载位置，提供者行为的测试归 [request-context-cordis](../../request-context-cordis/tests/README.md)。测试通过不代替规格或验收。

## 维护

公开导出或 SPEC 性质变化时，同步对应测试与本目录 `index.md`。抽象类进入 `./cordis` 时，同一次修改要更新入口测试，并核对键常量等于 `RequestContextService.provide`。

## 本包事实

现在有两个测试：

- [public-entry.spec.ts](public-entry.spec.ts)：断言根入口没有导出。
- [cordis-entry.spec.ts](cordis-entry.spec.ts)：断言 `./cordis` 入口没有导出。

没有 `*.spec-d.ts` 类型测试。运行方式：在仓库根执行 `pnpm turbo run test --filter=@omne-harness/request-context-cordis-contract`，或在本包目录执行 `pnpm test` 与 `pnpm typecheck`。

当前缺口：没有核对 [SPEC 性质 10](../SPEC.md#结果与不变量) 的导入边界测试，也没有核对键常量的测试。它们随 `./cordis` 的实现进入。具名维护者由负责人指定。
