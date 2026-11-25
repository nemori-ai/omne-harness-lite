> 只作历史。路线图以 GitHub 上的父卡（交接卡）为准，副本在 `handoff-card.md`。

# 会话受理、消费、推进与性能 · 分程路线图

负责人 2026-11-25：一程一个 PR，直接进 `integration/mainline`；本会话自主连续推进。
需求与不变式：`requirement.md`（I-1 到 I-10）；实然：`as-is.md`（R1 到 R10）；模型：`models/`。

| 程 | 关上什么 | 不变式 | 根因 | 主要成员 |
| --- | --- | --- | --- | --- |
| 1 一轮失败时必定收场并让出位置（卡 #1655） | 驱动停下时交回执行槽；宿主 `contact` 按运行时自己的报告答；失败的收尾不因待交输入被挡回；步数上限时带着未取走的输入终结 | I-1 I-3 I-5 | R4（后果机制）、步数上限活锁 | agent（provider）、agent-host-local（contact）、agent-contract（finishing）、session-contract（judgments）、session-storage-sql |
| 2 批界、撤销归档与在跑可见 | 新一轮带当时全部待处理输入；撤销归档后新一代作用域有会话自有块；确定拒绝不当作一时不可用；界面「在跑、能停」与日志一致 | I-4 I-6 I-7 | R6 R8 R9 | session、session-contract、agent-contract、harness-server 的 agent-context 行、session-observation、session-ui |
| 3 性能设施与基准套件 | `tools/perf-harness`（计数门、代价模型、配对比值、负控）与顶层 `benchmarks/`；先覆盖会话：一轮里多步、多轮、冷打开、客户端跟上；规模沿 dsh 方案，负载形状取本机 Claude Code、Codex 会话日志的分布 | I-10 的度量 | — | tools、benchmarks、apps/harness-server/tests |
| 4 一步推进的读量与日志长度无关 | 按第 3 程的计数门定位并根治每步随日志变长的读 | I-10 | R10 | 由第 3 程的归因定 |
| 5 租户之间互不饿死 | 存储排队按租户公平、有配额 | I-9 | #1640 | storage（sqlite-provider） |

第 1 程的实际内容（2026-11-25 重定）：原计划里「交入事实进发件箱」「挂接如实答失联」两项建立在对第 2 次卡死的错误归因上（`as-is.md` 的更正节），撤下。复现之后定下的是上表这一行，材料在 `run1/`（card、spec、pr）。没进第 1 程、留在本线后面做的：R5（日志解释分永久与瞬时、重试有下限）；停下的 execution 自己终结；取消在 Agent 一侧的收束；开轮风暴（`C2 invoke other`）；`command_limit` 落在 F2。交入回执的证据来源留给 #1195、#1197。

交付入口：第 1 程在 #1611（会话推进与恢复）名下，第 2 程里 F11 与「取消后仍占执行」在 #1612（取消、归档与审批等待）名下；两张主题卡的待修清单逐项给处置与证据，不另开重复的卡。

程与程之间的轮动（负责人 2026-11-25）：一程集成之后、下一程开工之前，先把轨道头同步进工作分支，再跑性能读数（`probe/probe-steps.ts`，之后换成第 3 程的套件）对比基线；有回归先修好再开新一程。第一份基线：`evidence/probe-steps/steps.json`（每步约 1250 次存储读、约 95 次提交）。

次序依据：1、2 是正确性，先做；3 先量后改，是 4 的前提；5 按负责人「最后一程」。

设计输入（第 3 程）：`tmp/files-shell-audit-20261118/bundle/orchestration/performance-engineering.md`（11-16 到 11-18 的性能工程线设计）与 `materials/performance-engineering/prior-design-2026-11-03.md`（参照 dsh 的会话日志评测设计）；现有 `apps/harness-server/tests/long-session/`、`history-cost/` 与 `tools/e9`。规格里已有的成本承诺：`packages/session/SPEC.md` 第 404 行「热路径上不出现随历史长度增长的读取」。
