# tests

本目录承载本包适用的持续测试。测试种类的责任与边界见仓库[包级测试责任与边界](../../../../docs/verification.md#包级测试责任与边界)。

## 允许的内容

`*.spec.ts` 运行测试、`*.spec-d.ts` 类型测试、测试辅助代码，以及 `fixtures/` 下的固定输入。

## 边界

测试不需要真实存储、身份源、时钟或 Cordis：有效提供者端口使用 `./testing` 的非耐久替身。替身通过套件不证明真实存储的耐久、跨进程并发或恢复。依赖方向测试读取构建后的 `dist`，运行前须先构建本成员及其依赖。测试通过不代替规格或验收。

## 维护

公开行为或 `SPEC.md` 条款变化时，同步对应测试与本目录 `index.md`。导出集合变化时同一次修改更新 `public-entry.spec.ts`；套件新增用例时在 `transactions-conformance.spec.ts` 补一个让它变红的违例变体。

## 本包事实

- [public-entry.spec.ts](public-entry.spec.ts)：根入口与 `./testing` 的导出集合，`sessionModesBlock` 的形状。
- [decide-reduce.spec.ts](decide-reduce.spec.ts)：首条路径种类的 `decide`/`reduce`（创建与初始化项、受理、开 Run、交入、消息参加、有界收束）、认回与冲突、跨租户拒绝、未知种类隔离、领域服务的边界结局。
- [transactions-conformance.spec.ts](transactions-conformance.spec.ts)：事务端口套件对替身的自证：合法替身全过，无第二租户时跨租户用例记为不适用，每个用例都有一个违例变体让它变红。
- [dependency-direction.spec.ts](dependency-direction.spec.ts)：构建后的根入口不加载 Cordis、任何 `./cordis` 入口、依赖本成员的成员、`./testing` 与 `node:assert`。
- 辅助：[conformance-harness.ts](conformance-harness.ts)、[module-graph.ts](module-graph.ts)。

运行方式：在仓库根执行 `node scripts/with-test-slot.mjs pnpm --filter @omne-harness/session-contract test`，或在本包目录执行 `pnpm test` 与 `pnpm typecheck`。

当前缺口：真实耐久、跨进程原子提交、真实提供者与完整组合未验证。Model ACK confirmed 与新 Context scope 的实际初始化仍按 SPEC 的具名停止点处理。初始化任务来源仍有待补齐，见 SPEC 的 JC-01。

新增行为资源：

- [extended-behavior.spec.ts](extended-behavior.spec.ts)：attempt、冻结、同日志终态、常驻键、结果责任与作用域。
- [management-behavior.spec.ts](management-behavior.spec.ts)：环境设置同批、控制、生产者事实、级联、空闲与连续压缩。
- [providers-conformance.spec.ts](providers-conformance.spec.ts)：八类提供者套件自证与违例控制。

- [result-integrity.spec.ts](result-integrity.spec.ts)：原执行与位置、结果依据不变、迟到保管、后继隔离及归档提醒。
