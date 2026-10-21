# tests

本目录承载本包适用的持续测试。测试种类的责任与边界见仓库[包级测试责任与边界](../../../../docs/verification.md#包级测试责任与边界)。

## 允许的内容

`*.spec.ts` 运行测试、`*.spec-d.ts` 类型测试、测试辅助代码，以及 `fixtures/` 下的固定输入。

## 边界

本成员不碰机器资源，测试只核对登记表的状态转移与拒绝原因。提供者、账本、守卫与恢复授权都是替身，它们在测试文件里定义。替身就绪不证明真实资源停止、数据耐久或许可先于效果。真实宿主上的设施行为归 [execution-environment-host-local](../../execution-environment-host-local/tests/README.md)。测试通过不代替规格或验收。

## 维护

SPEC 的行为或[明确缺项](../SPEC.md#明确缺项)变化时，同步对应测试与本目录 `index.md`。新增公开导出时，同步 [public-entry.spec.ts](public-entry.spec.ts) 里的导出集合。

## 本包事实

现在有两个测试文件，共十四个测试：

- [public-entry.spec.ts](public-entry.spec.ts)：两个测试。根入口只导出 `createEnvironmentRegistry` 与 `RetirementPending`；任何模块都不导入 `@deepseek-ai/cordis`。
- [registry.spec.ts](registry.spec.ts)：十二个测试，对应 SPEC [组合与验证](../SPEC.md#组合与验证)的场景表。

没有 `*.spec-d.ts` 类型测试。运行方式：在仓库根执行 `pnpm --filter @omne-harness/execution-environment test`，或在本包目录执行 `pnpm test` 与 `pnpm typecheck`。2026-10-21 在 Node v24.18.0、linux 上，十四个测试全部通过，退出码 0。

当前缺口：没有直接测试待处置后重试释放、`retire()` 待处置时撤除函数抛出 `RetirementPending`、恢复枚举失败记为不可用。SPEC 明确缺项里的四项没有测试。具名维护者由负责人指定。
