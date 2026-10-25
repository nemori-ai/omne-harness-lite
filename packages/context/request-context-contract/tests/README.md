# tests

本目录承载本包适用的持续测试。测试种类的责任与边界见仓库[包级测试责任与边界](../../../../docs/verification.md#包级测试责任与边界)。

## 允许的内容

`*.spec.ts` 运行测试、`*.spec-d.ts` 类型测试、测试辅助代码，以及 `fixtures/` 下的固定输入。

## 边界

本成员提供纯操作，不提供生产运行时。纯操作的测试不需要真实存储、服务或 Cordis。`HistorySource`、计量端口与策略端口用测试内的确定实现代替。测试通过不代替规格或验收。

## 维护

公开行为或 `SPEC.md` 条款变化时，同步对应测试与本目录 `index.md`。操作进入根入口时，同一次修改要更新导出测试。

## 本包事实

[public-entry.spec.ts](public-entry.spec.ts) 核对运行导出。[contract.spec.ts](contract.spec.ts)、[advanced.spec.ts](advanced.spec.ts) 验证纯行为，[conformance.spec.ts](conformance.spec.ts) 验证好实现通过、针对性坏实现失败。[exports.spec.ts](exports.spec.ts) 核对构建导出清单。 [sources.spec.ts](sources.spec.ts) 验证七组稳定读取、普通访问与读取资格、准备租约计量、来源调用与延续、十进制历史序号与增量压缩窗口。[fixtures.ts](fixtures.ts) 与 [profile.ts](profile.ts) 是测试辅助：前者把旧式快照适配成来源集合并构造行、调用身份与采用事实，后者构造模型档案。

运行方式：在仓库根执行 `pnpm turbo run test --filter=@omne-harness/request-context-contract`，或在本包目录执行 `pnpm test` 与 `pnpm typecheck`。

当前缺口：缓存一致性、超长历史、真实持久化与真实组合的义务归实现成员与组合验证，见 [RQ-11 对照表](../verification/rq11.md)。依赖 #558 写回的条款不适用，待写回后重验。具名维护者由负责人指定。
