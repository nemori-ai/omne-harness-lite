# tests

本目录承载本包适用的持续测试。测试种类的责任与边界见仓库[包级测试责任与边界](../../../../docs/verification.md#包级测试责任与边界)。

## 允许的内容

`*.spec.ts` 运行测试、`*.spec-d.ts` 类型测试、测试辅助代码，以及 `fixtures/` 下的固定输入。

## 边界

测试不需要真实存储、身份源、时钟或 Cordis：事务端口与四个构造端口用 `./testing` 的非耐久替身。替身通过套件不证明真实存储的耐久、跨进程并发或恢复。依赖方向测试读取构建后的 `dist`，运行前须先构建本成员及其依赖。测试通过不代替规格或验收。

## 维护

公开行为或 `SPEC.md` 条款变化时，同步对应测试与本目录 `index.md`。导出集合变化时同一次修改更新 `public-entry.spec.ts`；套件新增用例时在 `transactions-conformance.spec.ts` 补一个让它变红的违例变体。

## 本包事实

- [public-entry.spec.ts](public-entry.spec.ts)：根入口与 `./testing` 的导出集合，`sessionModesBlock` 的形状。
- [decide-reduce.spec.ts](decide-reduce.spec.ts)：首条路径种类的 `decide`/`reduce`（创建与初始化项、受理、开 Run、交入、消息参加、有界收束）、认回与冲突、跨租户拒绝、未知种类隔离、领域服务的边界结局、路径外种类指向 #756。
- [transactions-conformance.spec.ts](transactions-conformance.spec.ts)：事务端口套件对替身的自证：合法替身全过，无第二租户时跨租户用例记为不适用，每个用例都有一个违例变体让它变红。
- [dependency-direction.spec.ts](dependency-direction.spec.ts)：构建后的根入口不加载 Cordis、任何 `./cordis` 入口、依赖本成员的成员、`./testing` 与 `node:assert`。
- 辅助：[conformance-harness.ts](conformance-harness.ts)、[module-graph.ts](module-graph.ts)。

运行方式：在仓库根执行 `pnpm turbo run test --filter=@omne-harness/session-contract`，或在本包目录执行 `pnpm test` 与 `pnpm typecheck`。

当前缺口：SPEC 的[持续验证义务与未覆盖](../SPEC.md#持续验证义务与未覆盖)与[候选的持续验证义务](../SPEC.md#候选的持续验证义务)只有首条路径涉及的部分有测试；路径外种类、其余端口的套件与真实组合归 #756 与实现成员。没有 `*.spec-d.ts` 类型测试。具名维护者由负责人指定。
