# 交接信息包：一轮失败时必定收场并让出位置（会话推进线第 1 程）

## 目标

一轮 Run 无论因为什么失败，都以明确的结局收场，并把 Agent 实例的执行槽让出来：下一句话照常能开出新的一轮，不再需要重启服务端。改前，一轮以失败停下后实例的槽位永久占用，同一会话的新一轮一直交不进去；到步数上限时若有排着的输入，这一轮永远不结束。

## 依据

钉在 integration/mainline@02a9e3103d46239ee032117cf942c8085a8065f5：

- 需求与不变式：`packages/agent/SPEC.md` 的 AG-15 与「驱动在确定不能继续的节点停下」一条；`packages/agent/agent/verification/run-lifecycle/RunLifecycle.tla` 文件头的 D-31（应然：节点失败结束 Run 并释放槽位）与 R2-D285（已知偏离）；`packages/session/SPEC.md`「条件终结只读核对待交输入」一句
- 领域影响与总边界：本卡「边界」一节；修复主题 #1611（会话推进与恢复）、#1612（取消、归档与审批等待）的纳入范围
- 细化设计：本卡评论里第一行是 `## spec（修订 1）` 的那一条
- 技术选型与复用：fast-check 4.10.2（MIT，只作测试依赖，进 catalog）；TLC 沿用仓库钉住的版本；不引入别的依赖
- 形式化件：`packages/agent/agent/verification/run-lifecycle/`（`run-is`、`run-ought`、`live-ought` 通过；`bad-driver-swallows-p3` 违反 `P3_StopVisible`；`bad-is-no-terminate-l3` 违反活性）
- spec：本卡评论里第一行是 `## spec（修订 1）` 的那一条

## 不变式

| 编号 | 一句话 | 出处锚点 | 由什么守 |
| --- | --- | --- | --- |
| I-1 | 驱动停下时恰好报告一次，并让出执行槽；之后的受理不答忙 | `packages/agent/SPEC.md` AG-15 | 模型 `P3_StopVisible`、`P3_ReportedOnce`；`agent/tests/provider-slot.property.spec.ts`；`provider-run-failure.spec.ts`；守卫 `run-lifecycle.spec.ts` |
| I-2 | 宿主自己运行的实例不持有某个 execution 时，对它的挂接答已失联并带宿主自己的证据 | `packages/agent/SPEC.md`「恢复只认回原 execution」一条 | `agent-host-local/tests/recovery.spec.ts` 的 contact 一组 |
| I-3 | 以失败为结论的条件终结不因待交输入被挡回；以完成或取消为结论时仍被挡回 | `packages/session/SPEC.md`「条件终结只读核对待交输入」 | `session-contract/tests/decide-reduce.spec.ts` 的示例与 property |
| I-4 | 以循环守卫收尾时，已受理而没取入的输入不挡住终结，记为保留 | `packages/agent/SPEC.md`「以失败终结时」一条 | `agent/tests/loop-run-steps.spec.ts`「ends at the limit although an input accepted meanwhile was not taken」 |
| I-5 | 失败的一轮结束后，没取走的输入保留待处理资格，不丢 | `packages/session/SPEC.md` 同上一句 | 归约的既有规则与用例（`settleLeases`）；本程不改 |

## 验收标准

- [ ] C1 成员用例：一轮在收尾节点被日志确定拒绝后，运行时显示空闲，下一个 execution 的受理成功，停用答已排空；去掉让出槽位的那一行，这些用例变红
- [ ] C2 生成式用例：任意「完成、停下」的 execution 序列之后，每一次受理都成功，每次停下恰好报告一次，最后停用答已排空；去掉修复时反例缩到单个「停下」
- [ ] C3 宿主的 contact：实例空闲或占着别的 execution 时答已失联并带宿主证据；占着被问的 execution、已预留时答在跑
- [ ] C4 到步数上限且有一条已受理未取走的输入：这一轮以守卫失败终结；改前同一用例空转不结束
- [ ] C5 发行组合上的复现（独立装配、替身模型）：第二句恰在第 50 步到达、模型继续要工具。改前这一轮 4 分钟后仍未结束、停服退出码 5；改后以 `failed` 终结、停服退出码 0
- [ ] C6 形式模型：`run-is`、`run-ought`、`live-ought` 通过，两个负对照各违反登记的性质
- [ ] C7 `pnpm run preflight`、改动成员的快层与慢层、`pnpm run admission` 在最终头上通过；没验的写明

## 切片大纲

| 切片 | 交付的行为 | 对应验收 | 人怎么验 | 验几分钟 | 预计做多久 |
| --- | --- | --- | --- | --- | --- |
| 01 | 以失败收尾不被排着的输入挡住（Session 的收尾核对与 Agent 的守卫规则） | C4、C5 | 桌面端让一轮跑到步数上限，途中再发一句：这一轮显示失败并停下，不再一直转 | 5 | 1 小时 |
| 02 | 驱动停下后让出执行槽；宿主如实报失联 | C1、C2、C3、C6 | 桌面端停掉一轮后马上再发一句：新的一轮照常开始 | 3 | 2 小时 |
| 03 | 合入检查、准入、开 PR | C7 | 读交付声明 | 2 | 1 小时 |

## 边界

| 级别 | 成员与路径（反引号括起，可多个） | 本程对它做什么 |
| --- | --- | --- |
| 重点 | `packages/agent/agent` `packages/agent/agent-host-local` | 驱动停下后让出执行槽；contact 按运行时自己的报告答失联 |
| 重点 | `packages/session/session-contract` `packages/session/session-storage-sql` | 收尾核对带上结论，失败的结论不因待交输入被挡回 |
| 次要 | `packages/agent/agent-contract` `packages/session/session-adapters` | 守卫收尾可带未取走的输入；内存替身与存储参加者同一口径 |
| 连带 | `packages/agent/SPEC.md` `packages/session/SPEC.md` `tools/product-checks` `pnpm-workspace.yaml` | 规格写回现状；整洁基线只收紧；catalog 加 fast-check |

- 不许碰：任何 `acceptance/` 目录；`packages/access`；会话日志的存储格式
- 范围外：让停下的 execution 自己终结（收尾提交被拒时的兜底终态）；被取消轮次在 Agent 一侧的取消收束；交入回执的证据来源；开轮风暴；每步读写量；界面的在跑与停止显示

## 起点与风险

- 起点：integration/mainline@02a9e3103d46239ee032117cf942c8085a8065f5
- 风险：L2。改 Agent 运行时的槽位状态与会话的收尾核对，都在推进的关键路径上；不碰租户隔离、凭据与同提交状态，契约只做可加改动
- 人的验收窗口：回来 2026-11-25T14:00:00Z · 验收 20 分钟（负责人：「一程一次集成，便行机宜，尽量高质量且高效地进入集成让真实生产可用」）
- 停点：做完本程
- 点名授权的动作：开 PR 进 `integration/mainline` 并过 gate（负责人 2026-11-25：「一程一个 pr 直接上去集成」）
- 预计收尾：2026-11-25T14:00:00Z · 依据：切片大纲的预计用时之和

## 已定事项

- 按一程做；人的原话：「一程一次集成，便行机宜」
- 驱动停下后让出槽位是已接受的应然（D-31），本程兑现它，不另立承诺
- 失败的一轮结束后，排着的输入照现行规则保留待处理并等人（`awaitingPerson`），本程不改这条产品规则
- 会话契约的源文件有改动，发行摘要随之重算；按当前研发阶段的政策，摘要变化前建的会话在新版上不保证能继续（#1461）

## 只有人能定的待决

- 无

## 四问

1. 从哪个提交开工，边界到哪里？从 integration/mainline@02a9e3103d46239ee032117cf942c8085a8065f5；重点是 Agent 运行时与本地宿主、会话契约与存储参加者，次要是 Agent 契约与会话适配的替身，连带是两份包组规格、整洁基线与 catalog。
2. 系统要守住哪些不变式，每条由谁守？I-1、I-2、I-4 由 Agent 守；I-3、I-5 由 Session 守；见「不变式」表的最后一栏。
3. 做到什么算完成？C1 到 C7 逐条有证据，贴在卡评论。
4. 每条关键事实的出处与有效修订在哪里？起点提交上的 `packages/agent/SPEC.md`、`packages/session/SPEC.md` 与 `run-lifecycle` 模型；现场与复现的证据在主仓库 `tmp/advance-liveness/evidence/`，摘要贴卡评论。
