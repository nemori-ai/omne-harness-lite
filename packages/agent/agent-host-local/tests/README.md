# tests

<!-- documentation:placeholder -->

本目录承载本包适用的持续测试。测试种类的责任与边界见仓库[包级测试责任与边界](../../../../docs/verification.md#包级测试责任与边界)。

## 允许的内容

<!-- documentation:placeholder -->

`*.spec.ts` 等测试文件、测试辅助代码，以及 `fixtures/` 下的固定输入。

## 边界

<!-- documentation:placeholder -->

说明每类测试用到的真实依赖与替身。测试通过不代替规格或验收。

## 维护

<!-- documentation:placeholder -->

公开行为或 `SPEC.md` 条款变化时，同步对应测试与本目录 `index.md`。

## 本包事实

<!-- documentation:placeholder -->

待补：本目录对本包的实际内容、负责人与当前缺口。不适用时写明理由，并在 `documentation.json` 把本文件记为 `not-applicable`。

`public-entry.spec.ts` 经根入口实际创建接收方，以 Agent 公开 `createModelReceiverFixture` 装配同源内存 Journal。它验证 unsupported 拒绝、真实 push 的条目与材料、pending 报告及重装配后的同 handoff retry。Model、Access 与 outlet 是显式替身；该用例不证明完整 Cordis 插件、生产 Model host 或磁盘耐久。

宿主插件的测试在真实 Cordis 4.0.4 上装载 `agent-host` 与目录插件 `agentInstancesPlugin`。Journal、Model、授权、采用、条件、请求准备、模型选择、消息准入与时钟用 `@omne-harness/agent/testing` 的非耐久替身，服务类取自 agent-cordis-contract 的定义入口。`host-support.ts` 的 `withRuntimeDuties` 包装 Agent 工厂，补上工厂尚未兑现的两条 runtime 停用义务（quiesce 先进入 draining 并经登记句柄撤登记；invoke 取槽时同步报告 occupied）。用这个包装的用例只证明宿主一侧；名为 plain factory 的用例显示生产工厂现在的答复。这些测试不证明生产 Journal、真实授权、跨进程行为或接收方登记。

`openWorld({ stages: true })` 另以同一组替身提供六项局部依赖，并记录每次 Model admit 的答复，使 `createAgentRuntime` 真件的 Loop 能跑到 Model 请求。`control-entry.spec.ts` 用它验证控制入口推进取消；它不证明真实 Model、生产 Journal 或跨进程推进。`tool-requests-plugin.spec.ts` 也用它，并让 Tool 运行时替身受理 invoke，只证明来源经插件工厂进入 runtime 依赖，不证明真实 Tool 运行时或生产来源。

`line-through/` 是一条真实 Cordis 4.0.4 根上的组合用例：真实 sqlite-provider、session-storage-sql、session-cordis、session-adapters 的生产插件（AD-14、`agentJournal` 插件）、Agent 宿主与 agent-context，加 Model 与 Tool 的替身。`world.ts` 是 CP3 的组合世界，`openLineWorld(options)` 的参数都可选，不传时装配与 CP3 一致。`w2-world.ts` 在其上加波 2 的件：带取消安装的 Journal 插件、Tool 接收方与 Tool 替身、Tool 请求准备替身（R2-D36）、可选的 AD-04 前文来源、产品的 `measure` 观察者；`w2-measure.ts` 放每轮计数与测量事件记录器。Model、Tool、Runtime Context 交接、已采用请求事实与 Agent 的授权等是替身，各在构造处标注。AD-02、handoff 插件、AD-05 与取消意图路径属于别的闭包，对应场景在它们合入父分支前是具名占位，世界不替它们造替身。这些用例只证明本组合、替身与固定轮形下的行为，不证明真实 Model 与 Tool、跨线装配、`apps/harness-server` 的行接线或 E9 计时。
