# tests

本目录承载本包适用的持续测试。测试种类的责任与边界见仓库[包级测试责任与边界](../../../../docs/verification.md#包级测试责任与边界)。

## 允许的内容

`*.spec.ts` 运行测试、`*.spec-d.ts` 类型测试、测试辅助代码，以及 `fixtures/` 下的固定输入。

## 边界

测试用真实的 `@deepseek-ai/cordis` `Context` 装载一个 `SessionService` 子类探针，不需要存储、提供者或替身。调用方类核对、端口缺席与事件载荷的行为归提供者成员验证。测试通过不代替规格或验收。

## 维护

公开行为或 `SPEC.md` 条款变化时，同步对应测试与本目录 `index.md`。键表变化时同一次修改更新 `cordis-entry.spec.ts` 的键表。

## 本包事实

- [public-entry.spec.ts](public-entry.spec.ts)：根入口没有运行值；根入口源码不导入 Cordis 与提供者；`cordis.ts` 不导入提供者。
- [cordis-entry.spec.ts](cordis-entry.spec.ts)：`./cordis` 的导出集合；每个键常量等于对应抽象类自己声明的 `provide` 并与 Cordis 说明的键表一致；被替代的键不导出；真实 `Context` 装载子类并在卸载后移除。

运行方式：在仓库根执行 `pnpm turbo run test --filter=@omne-harness/session-cordis-contract`，或在本包目录执行 `pnpm test` 与 `pnpm typecheck`。

当前缺口：两个调用方类各取到自己的 intercept 配置、调用方类不在允许范围时被拒绝、事务端口缺席时服务停在 `PENDING`、事件载荷不含正文，归提供者成员。没有 `*.spec-d.ts` 类型测试。具名维护者由负责人指定。
