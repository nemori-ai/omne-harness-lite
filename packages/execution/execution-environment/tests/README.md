# tests

本目录承载本包适用的持续测试。测试种类的责任与边界见仓库[包级测试责任与边界](../../../../docs/verification.md#包级测试责任与边界)。

## 允许的内容

`*.spec.ts` 运行测试、`*.spec-d.ts` 类型测试、测试辅助代码，以及 `fixtures/` 下的固定输入。

## 边界

本成员不碰机器资源，测试只核对登记表的状态转移与拒绝原因。提供者、账本、守卫与恢复授权都是替身，它们在测试文件里定义。替身就绪不证明真实资源停止、数据耐久或许可先于效果。真实宿主上的设施行为归 [execution-environment-host-local](../../execution-environment-host-local/tests/README.md)。测试通过不代替规格或验收。

## 维护

SPEC 的行为或[明确缺项](../SPEC.md#明确缺项)变化时，同步对应测试与本目录 `index.md`。新增公开导出时，同步 [public-entry.spec.ts](public-entry.spec.ts) 里的导出集合。

## 本包事实

现在有六个测试文件，共七十个测试，替身集中在 [doubles.ts](doubles.ts)：

- [public-entry.spec.ts](public-entry.spec.ts)：两个测试。根入口只导出 `createEnvironmentRegistry` 与 `RetirementPending`；任何模块都不导入 `@deepseek-ai/cordis`。
- [registry.spec.ts](registry.spec.ts)：十二个测试，对应 SPEC [组合与验证](../SPEC.md#组合与验证)的第一张场景表。
- [acquisition.spec.ts](acquisition.spec.ts)：二十一个测试。获取的失败、核验与补偿释放、重核落点、同键的集合比较、租户级沙箱与未铸造的访问租户。
- [lease-gate.spec.ts](lease-gate.spec.ts)：十六个测试。逐操作门（含账本关闭）、失效与释放。
- [lifecycle.spec.ts](lifecycle.spec.ts)：十二个测试。登记、退役、关闭、描述与恢复。
- [scope.spec.ts](scope.spec.ts)：七个测试。请求方作用域：宿主机与租户级沙箱上的获取随作用域释放失效、在描述与恢复里按作用域列出；带作用域的绑定层与请求方作用域不同时拒绝。

没有 `*.spec-d.ts` 类型测试。运行方式：在仓库根执行 `pnpm --filter @omne-harness/execution-environment test`，或在本包目录执行 `pnpm test` 与 `pnpm typecheck`。2026-10-21 在 Node v24.18.0、linux 上，七十个测试全部通过，退出码 0。

当前缺口：SPEC 明确缺项里的各项没有测试。具名维护者由负责人指定。
