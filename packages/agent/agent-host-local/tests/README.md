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

`openWorld({ stages: true })` 另以同一组替身提供六项局部依赖，并记录每次 Model admit 的答复，使 `createAgentRuntime` 真件的 Loop 能跑到 Model 请求。世界另记录 Journal 的每次 `load` 与 `recordControl` 及发起主体（`journalCalls`）。`control-entry.spec.ts` 用它们验证控制入口推进取消，以及守卫拒绝时一次都不推进；它不证明真实 Model、生产 Journal 或跨进程推进。`tool-requests-plugin.spec.ts` 也用它，并让 Tool 运行时替身受理 invoke，只证明来源经插件工厂进入 runtime 依赖，不证明真实 Tool 运行时或生产来源。

`line-through/` 是一条真实 Cordis 4.0.4 根上的组合用例：真实 sqlite-provider、session-storage-sql、session-cordis、session-adapters 的生产插件（AD-14、`agentJournal` 插件）、Agent 宿主与 agent-context，加 Model 与 Tool 的替身。`world.ts` 是 CP3 的组合世界，`openLineWorld(options)` 的参数都可选，不传时装配与 CP3 一致。`w2-world.ts` 在其上加下列件：带取消安装的 Journal 插件、Tool 接收方与 Tool 替身、Tool 请求准备替身（R2-D36）、可选的 AD-04 前文来源、产品的 `measure` 观察者；`w2-measure.ts` 放每轮计数与测量事件记录器。Model、Tool、Runtime Context 交接、已采用请求事实与 Agent 的授权等是替身，各在构造处标注。世界装载真实的 AD-02（`createSessionJournalInterpretationPlugin`）、handoff 插件（`createSessionMessageHandoffPlugin`）、AD-05（`createSessionModelLogConsumptionPlugin`）与 AD-06（`createSessionToolLogConsumptionPlugin`）。取消意图路径是否经真实插件走通，以 `w2-control.spec.ts` 的现状为准，世界不替它造替身。`w2-handoff-restart.spec.ts` 启动子进程 `w2-handoff-child.ts`：它在给定的存储目录上打开同一组合世界，让 Agent 跑一轮并收集准入记录，然后等待被杀，由新进程按原身份读回准入记录。这些用例只证明本组合、替身与固定轮形下的行为，不证明真实 Model 与 Tool、跨线装配、`apps/harness-server` 的行接线或 E9 计时。

CP3 判定只有 Session 参加的回滚时用 `line-through/cp3-rollbacks.ts` 的 `sessionOnlyRollbackExplained`（R2-D152）。可以接受的原因只有两种：一种是 `the input is not pending`；另一种是 `changed`，并且之后同一执行、同一 sequence 的 commitLog 已经提交，或者该执行的 `readThrough` 已经到达这个 sequence。第二种原因的依据是 session-contract SPEC「过期的同域根答 changed」，以及 session-adapters `tests/journal-interpretation.spec.ts` 中「AD-02: the execution head moves between the read and the commit」的两条用例。`line-through/cp3-rollbacks.spec.ts` 在快层用合成序列核对这个判定，其中包括负控。

已知限制 KL-146（波 3）：AD-02 读到执行头之后、commitLog 落地之前，Agent 可能又写一次同一执行。这时只有 Session 参加的 commitLog 可能以 `unavailable` 回滚。AD-02 不重试 `unavailable`，这个事件要等下一次唤醒才继续解释。CP3 遇到这种回滚仍然判红。已看到两种签名：

- `history.executions.<execution>: required original material is missing`：执行头已经是占位回执（digest `unknown`，session-storage-sql K-5），所以 `boundaryOf` 不给边界。在 f2ba09e89 上加扰动时出现。
- `history.prefix.<execution>.committedConsequences: required original material is missing`：在 5946efe4d 上出现，不加扰动时 12 次中出现 1 次。

复现脚本：`line-through/cp3-repro-loop.sh <次数> <标签>` 不加扰动地连跑 CP3，并打印每次失败的原因与签名。`line-through/cp3-repro-delay.sh <毫秒> <次数> <标签>` 只在构建产物里加一段调度延迟，把 AD-02 读执行头与 commitLog 之间的窗口拉宽，运行结束后还原该文件。日志写在 `tmp/cp3-repro/<标签>/`。升级条件：在批次 D、E 的准入、C1 联调或 SC4 端到端中，不加扰动时只要出现一次 KL-146 的回滚，就升级为波 2 必修。

### J6 的两种轮数

`line-through/w2-counts.spec.ts` 有两种长度，由环境变量 `OMNE_J6_ROUNDS` 选择（R2-D141）。

- 默认（准入慢层）：跑 20 轮，两种形状的用例合计约 52 秒（机器上有其他任务时测得）。只比较两个窗口，即第 15 至 20 轮对第 5 至 10 轮，口径是 `stable()`：剔除轮号、字节、重试和 `execution-record.parts` 调用数，其余逐项相等。每轮接收数与 parts 调用上界的断言照常。增长判定不运行，因为它要求第 11 至 200 轮。证据写进 `tmp/line-session-run/w2/C-JOINT/short/`，不覆盖测量证据。
- 测量入口 `OMNE_J6_ROUNDS=200`：跑完整 200 轮，窗口是第 181 至 200 轮对第 11 至 30 轮，并对定时计数做增长判定（R2-D17、R2-D118）。证据写进 `tmp/line-session-run/w2/C-JOINT/`。其他取值会被拒绝。入口用环境变量而不用 `test:measure` 脚本，因为它不改 package.json，准入、独占名额和手工命令都用同一条命令行，且短轮与 200 轮跑的是同一份用例，不会各自走样。

完整 200 轮在三个时点各跑一次，不进准入：C1 联调 B；每个波的波末；合入改动 Session 热路径（session-storage-sql 的提交、读取、工作缓存与历史索引，session-adapters 的 Journal 与证据读取）的 PR 之前和之后。命令在工作树根，用 Git Bash，独占运行名额：

```sh
OMNE_J6_ROUNDS=200 ./scripts/with-test-slot.sh pnpm --filter @omne-harness/agent-host-local exec vitest run --mode slow --typecheck.enabled=false tests/line-through/w2-counts.spec.ts
```

短轮版本的命令相同，只是不设 `OMNE_J6_ROUNDS`。增长判定的纯函数与它的负控在 `line-through/growth.spec.ts`，快层运行，不依赖轮数。
