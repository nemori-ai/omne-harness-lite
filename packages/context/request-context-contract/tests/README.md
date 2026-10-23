# tests

本目录承载本包适用的持续测试。测试种类的责任与边界见仓库[包级测试责任与边界](../../../../docs/verification.md#包级测试责任与边界)。

## 允许的内容

`*.spec.ts` 运行测试、`*.spec-d.ts` 类型测试、测试辅助代码，以及 `fixtures/` 下的固定输入。

## 边界

本成员提供纯操作，不提供生产运行时。纯操作的测试不需要真实存储、服务或 Cordis。`HistorySource`、计量端口与策略端口用测试内的确定实现代替。测试通过不代替规格或验收。

## 维护

公开行为或 `SPEC.md` 条款变化时，同步对应测试与本目录 `index.md`。操作进入根入口时，同一次修改要更新导出测试。

## 本包事实

[public-entry.spec.ts](public-entry.spec.ts) 核对运行导出。[contract.spec.ts](contract.spec.ts)、[advanced.spec.ts](advanced.spec.ts) 验证纯行为，[conformance.spec.ts](conformance.spec.ts) 验证好实现通过、针对性坏实现失败。[exports.spec.ts](exports.spec.ts) 核对构建导出清单。

运行方式：在仓库根执行 `pnpm turbo run test --filter=@omne-harness/request-context-contract`，或在本包目录执行 `pnpm test` 与 `pnpm typecheck`。

当前缺口：SPEC 的[持续验证义务](../SPEC.md#rq-11-持续验证与未覆盖)都还没有测试。纯操作进入后，先补七组逐项相同返回已有候选、四种结局、三类失败、计划进度每步恰加一与 epoch 变化重取，再由实现成员与真实组合补缓存一致性、超长历史与恢复。具名维护者由负责人指定。
