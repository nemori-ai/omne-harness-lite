# tools 的验证范围

当前正式契约是 [tools v2](v2/contract.md)。它的条款由四处证据分担：本页登记的调用生命周期
模型 [ToolCall.tla](v2/ToolCall.tla)（调用进展、attempt 账本、等待关系、控制、结算交付五个
维度与 `human` 调用）、[run-driver 模型](../run-driver/verification.md)（驱动器侧的提议、门、
等待与结算视图）、[生命周期组合模型](../../compositions/session-run-agent-lifecycles/verification.md)
（Run / Session 级联对占位与执行者的影响）、以及
[session 验证范围](../session/verification.md)登记的 Inbound 模型（结算 arrival 的去重、裁决与
单次消费）。模型检查是有限状态证据，不是无界系统或真实实现的证明。

## v2 的形式工件与登记

| 文件 | 内容 | 登记 |
|---|---|---|
| [ToolCall.tla](v2/ToolCall.tla) | 模型正文：五个维度，抽象 Run、Session 与执行 owner，`tool` 与 `human` 两种调用 | 形式任务 `tool-execution-call-safety`、`tool-execution-call-progress` 的模块（两个任务的 artifacts 随 D-015 发布从提案证据目录改指本目录；提案证据目录里的同名文件是接受前的原件） |
| [ToolCallMC.tla](v2/ToolCallMC.tla) | 对称约减与否定变体 `SpecRedispatch`（恢复时重发已耐久 dispatch_intent 的 attempt） | 同上的入口模块 |
| [ToolCall.cfg](v2/ToolCall.cfg) | 安全配置：2 个调用、至多 1 次 owner 崩溃、对称约减 | `tool-execution-call-safety` |
| [ToolCallProgress.cfg](v2/ToolCallProgress.cfg) | 进展配置：1 个调用、至多 1 次崩溃，公平性假设写在模块的 `SpecFair` | `tool-execution-call-progress` |

补充进展配置 `ToolCallProgressTwo.cfg`（2 调用、无崩溃）与否定配置
`ToolCallRedispatch.cfg`、重放脚本 `replay.py` 与
[results.json](../../../docs/proposals/tool-execution/evidence/model/results.json) 留在
[工具执行提案的证据目录](../../../docs/proposals/tool-execution/evidence/README.md)，不登记为形式
任务。v2 目录里的四个文件是该目录的逐字节副本（SHA-256 相同），所以下表的运行数字直接
适用，本次发版没有重跑 TLC。形式任务命令带 `-deadlock`：终态状态本无后继，死锁检查关闭，
卡住由进展性质检查。

## ToolCall 模型

调用分 `tool`（执行 owner 为本地/shell owner）与 `human`（执行 owner 为人类决定提供者，答复
即结算）两种；每调用一个 attempt，崩溃后 owner 以同 attemptId 重发 start，不建第二个 attempt。
Run 抽象为 none / running / waiting / interrupted / terminal / cancelled，只有一个等待位置，
`terminal` 同时代表 completed 与不可恢复失败；Session 为 open / archived；执行 owner 可崩溃至多
`MaxCrash` 次。`rel` 变量就是 Run 等待登记簿在调用上的投影（[TL-16](v2/contract.md)）：有开放
登记时取 none / foreground / detach_in_flight / human_wait，无登记为 background；裁决按
“holder 有开放登记且发起 Run 活动 → continuation；无登记而 Run 活动 → context；Run 非活动 →
queue；Session 归档 → closed”。模型把结算与裁决相邻建模，不区分受理未裁决的窗口。完整的抽象
与边界见[提案证据说明](../../../docs/proposals/tool-execution/evidence/README.md#抽象与边界)。

| 配置 | 规范映射 | 有限范围与结果（2026-09-15 重放，8 核 4 worker） |
|---|---|---|
| ToolCall.cfg（安全） | TypeOK（[TL-14](v2/contract.md) 五个维度的取值域）；SettledDelivered（[TL-15](v2/contract.md) 终态与结算 arrival 同提交）；UnknownAfterDispatch（[TL-07](v2/contract.md)：unknown 只在 dispatch_intent 耐久后）；AttemptAfterAdmission（[TL-08](v2/contract.md)：准入前无 attempt，`human` 调用无 owner attempt）；HumanByAnswer（[TL-17](v2/contract.md)：`human` 调用恰由答复结算成功）；TerminalRunOnlyBackground（终态 Run 下只剩后台工作或停止进行中的调用）；ArchivedNoPending（归档后无未消费项）；NoStaleContinuation（终态 Run 不留未消费 continuation）；FenceConsistent（[TL-09](v2/contract.md)：墓碑不留无停止的开放调用）；动作性质 SettledStable、AttemptMonotone、FenceMonotone、NoStartAfterFence（[TL-08](v2/contract.md) 墓碑）、ConsumedOnce、AnswerOnce、InterruptKeepsHuman、FailKeepsHuman、ArchiveKeepsWork（[TL-11](v2/contract.md)）、SupersedeReleasesPositions / SupersedeKeepsWork（[TL-16](v2/contract.md) 整簿注销） | 2 调用（种类自由）、至多 1 次 owner 崩溃、Run 的 interrupt / interrupt_then_run / cancel / 不可恢复失败、等待中被排队用户文本唤醒（RunSteer）、停止未知（StopProgressUnknown）、对称约减；219.8 万生成状态、49.5 万不同状态、19 秒，通过 |
| ToolCallProgress.cfg（进展） | CallsSettle（TP-1：proposed 最终终态）；SettlementsResolve（TP-3：结算最终被消费或关闭）；StopsProgress（TP-2：停止请求最终得到物理事实）；HumanRequestsResolve（TP-4：请求最终被答复或关闭，以“用户最终答复”为假设） | 1 调用、至多 1 次崩溃；系统动作弱公平，Consume / RunStart 强公平，审批、答复、resume 为环境假设；1.5 万生成状态、4190 不同状态、2 秒，通过 |
| ToolCallProgressTwo.cfg（补充进展，不登记） | 同上四条进展性质 | 2 调用、无崩溃；126.5 万生成状态、31.5 万不同状态、4 分 15 秒，通过；只在提案目录的重放脚本里运行 |
| ToolCallRedispatch.cfg（否定，不登记） | 恢复时重发已耐久 dispatch_intent 的 attempt：期望违反 AttemptMonotone | 找到反例（6825 生成状态、2916 不同状态，1 秒内，退出码 13），证明 T-5 的保护点是恢复只 inspect 不重发 |

模型发现（提案阶段记录，处置已进入 v2 正文或留作提供者义务）：

1. 首版 `RunWake` 要求无未消费输入：审批被批准成后台启动、该后台调用在 Run 仍 waiting 时
   结算为 context，Run 既无阻塞者又不能消费 context，TLC 否定 `SettlementsResolve`；修正为
   “等待位置释放即重评”，落在 [RD-11](../run-driver/v3/contract.md) 的出边，tools 条款不变。
2. 停止先于 start 时墓碑与 `cancelled_before_execution` 结算在同一提交
   （[TL-15](v2/contract.md)），所以“墓碑之后 owner 迟到 start”被守卫排除，`NoStartAfterFence`
   由提交结构保护；owner 账本里 start 与墓碑的排序（[TL-08](v2/contract.md)）是提供者验收项，
   一个只去掉 owner 墓碑检查的否定变体因此找不到反例，已换成重发变体。
3. 复合打断的“整簿注销”一度写成“把所有调用置为后台”，TLC 立刻给出
   `TerminalRunOnlyBackground` 反例：尚未提议的调用也被标成后台。修正为只作用于已提议的
   调用——[TL-16](v2/contract.md) 的“整簿注销只作用于簿上已有的登记”即此。
4. 两调用加崩溃的活性检查在本机超过 10 分钟，登记的进展配置缩到 1 调用；两调用的交错由
   安全配置与不登记的补充进展配置覆盖。

## v2 条款覆盖

| 条款 | 证据 | 未覆盖部分 |
|---|---|---|
| [TL-01](v2/contract.md) 定义、投影与发布检查 | 无模型 | 校验 profile、两种投影与发布检查清单的实现测试 |
| [TL-02](v2/contract.md) 别名 | 无模型 | manifest 解析测试 |
| [TL-03](v2/contract.md) discover 与披露 | 无模型 | 披露策略测试 |
| [TL-04](v2/contract.md) 权限声明与准入 | ToolCall.cfg（GateAllow / GateAsk / GateDeny 三分支）；RunDriver.cfg（门与 ask / deny） | 声明解析器细节归 [action-authorization](../action-authorization/README.md) |
| [TL-05](v2/contract.md) 必需 skill | 无模型 | 装配测试（[MC-07](../model-execution/v2/contract.md)） |
| [TL-06](v2/contract.md) 绑定撤回与 stale_binding | 无模型 | 发布单位注销测试 |
| [TL-07](v2/contract.md) 调用进展与终态词表 | ToolCall.cfg（状态图转移、SettledStable、UnknownAfterDispatch） | 模型的终态集合没有 `unavailable`（绑定失效与 start 回执丢失两条路径不建模）；预算被拒停留 proposed 由 [RD-09](../run-driver/v3/contract.md) 与提供者验收；`resolution` 追加与费用暴露不建模 |
| [TL-08](v2/contract.md) attempt 账本、墓碑、停止能力声明 | ToolCall.cfg（AttemptAfterAdmission、AttemptMonotone、NoStartAfterFence）；否定变体 redispatch | owner 侧 start 与墓碑的账本排序；`stop.capability` 的装载核实与三值一致性检查；多 attempt 政策 |
| [TL-09](v2/contract.md) 停止的物理事实 | ToolCall.cfg（FenceConsistent、FenceMonotone、StopProgressUnknown）；Progress（StopsProgress） | 三轴词表本身不建模（模型的控制维度只有 requested / progressed）；`cleanup: retained`、`effect: confirmed` 与有界等待的时限行为由提供者验收 |
| [TL-10](v2/contract.md) 前后台关系与声明 | ToolCall.cfg（Detach / DetachConfirm / DetachFail、TerminalRunOnlyBackground、RunWake） | 时间与阈值不建模：有效阈值三值、单调计时、`startModes` 与调用级 `detach` 的参数校验由单测与场景 TS-16 承担 |
| [TL-11](v2/contract.md) 崩溃、归档后后台与单调用强停 | ToolCall.cfg（OwnerCrash / OwnerRecover、ArchiveKeepsWork、ArchivedNoPending、RunFail 后后台不变） | `stopCall{mode: force}` 与 Run 级 `stopping` 路径不建模，按 [RN-05](../run/v2/contract.md) 与场景 TS-21 验收；独立进程 owner 留作边界 |
| [TL-12](v2/contract.md) 帧 | 无模型 | 序号单调与去重封锁、三记录等级的失败处置、`frames(S)` 回放与缺口词表、读权裁剪：场景与回放/注入测试 |
| [TL-13](v2/contract.md) 扩展点与守卫 | 无模型 | 守卫只收紧的单测（run-driver 场景 S20）；外部 hooks 的降级归 [external-hooks v1](../external-hooks/v1/contract.md) |
| [TL-14](v2/contract.md) 五个维度 | ToolCall.cfg（TypeOK 覆盖 prog / att / rel / ctl / deliv 五个变量的取值域与组合） | 维度 E 的 `settling` 窗口与驱动器结算视图的完整词表由 [RD-09](../run-driver/v3/contract.md) 覆盖 |
| [TL-15](v2/contract.md) 转移表 | ToolCall.cfg（每个转移一个动作；同批伙伴以结算与级联的原子动作表达） | 提交面本身（共同提交的参与者与 operationId）不建模，归 [CC-02/03](../../compositions/core-work-coordination/v2/contract.md) 与 run-driver 模型；三段式事实名与 dedupKey 由提供者验收 |
| [TL-16](v2/contract.md) 等待关系是登记簿投影 | ToolCall.cfg（`rel` 即按调用投影；Route 的裁决分列、RunWait、SupersedeReleasesPositions、SupersedeKeepsWork） | 门的登记、`since` / `ret`、受理未裁决的窗口、跨协调域的提交后反应都不建模；登记簿正文归 [RN-01/RN-04](../run/v2/contract.md)，其单测覆盖“登记与 holder 事实同批”“非本 Run 对象登记被拒” |
| [TL-17](v2/contract.md) 内建 `human` 工具 | ToolCall.cfg（HumanByAnswer、AnswerOnce、InterruptKeepsHuman、FailKeepsHuman）；Progress（HumanRequestsResolve） | 两条命令的参数与答复形状、零费用来源、`request_approval` 的决定不被门消费：单测与场景 TS-14 |
| [TL-18](v2/contract.md) 前台上限的执行 | 无模型（时间不建模；Detach 与 StopRequest 是无标签触发） | 计时归属、同批混合与合批规则：场景 TS-16 与 [RD-10](../run-driver/v3/contract.md) 的驱动器单测 |
| [TL-19](v2/contract.md) 结果三层与投影 | 无模型 | 结果恰一次进入模型的两种形态、媒体耐久与去重、投影选择器只选不改：投影单测与场景 TS-06 / TS-12 / TS-22 |
| [TL-20](v2/contract.md) 恢复窗口 | ToolCall.cfg（OwnerCrash / OwnerRecover 覆盖 accepted 无 dispatch、dispatch 后终态不明两个窗口） | 其余六个窗口按窗口逐个注入崩溃验收；跨协调域的重交不建模 |

## 性质与落点

性质编号沿[工具执行提案的不变式](../../../docs/proposals/tool-execution/invariants.md)：T = 调用，
H = 内建人类请求工具，F = 帧，TP = 进展。本表只登记每条性质在 v2 里的条款落点与证据；规范
承诺以条款正文为准，本表不是第二份契约。

| 编号 | 陈述（摘要） | 条款落点 | 证据 |
|---|---|---|---|
| T-1 | 一次调用同一时刻至多一个活跃 attempt；新 attempt 须经新的准入 | TL-07、TL-08 | ToolCall.cfg（AttemptAfterAdmission、AttemptMonotone） |
| T-2 | 每次终态恰一次进入 Inbound（dedupKey = `(call, attempt)`）并恰被消费一次 | TL-15 | ToolCall.cfg（SettledDelivered）；Inbound 模型（去重与单次消费） |
| T-3 | 停止单调：墓碑生效后无新步骤与新 start；终态与停止按真实先后 | TL-08、TL-09 | ToolCall.cfg（NoStartAfterFence、FenceMonotone、FenceConsistent、SettledStable） |
| T-4 | 调用自实际启动起由独立 owner 拥有；Run 与调用生命周期错位，退役、崩溃、归档与 Run 失败不隐式取消或重启已准入的调用 | TL-07、TL-10、TL-11、TL-16 | ToolCall.cfg（ArchiveKeepsWork、FailKeepsHuman、TerminalRunOnlyBackground）；Yield 与强停不建模，由场景 TS-11 与 run-driver 场景承担 |
| T-5 | 无接纳证据不产生外部效果；恢复不重发已耐久 dispatch 的 attempt | TL-08、TL-20 | 否定变体 ToolCallRedispatch.cfg；run-driver 模型 |
| T-6 | 参数在准入点冻结，任何站点（含外部 hooks）不可改写；守卫只能收紧 | TL-01、TL-13 | 校验 profile 单测；run-driver 场景 S20 |
| T-7 | 别名只经原 manifest 解析；已准入调用保留原实现闭包直到排空 | TL-02、TL-06 | 场景 |
| T-8 | 多命令工具在 manifest 恰占一个槽位，调用、费用与审计定位到具体命令 | TL-01 | 单测 |
| T-9 | 系统发起的一次性批准恰一次消费；`request_approval` 的答复不被任何门消费 | TL-08、TL-17 | run-driver 模型（system_approval）；场景 TS-14 |
| T-10 | 归档/删除后到达的结算被关闭，不开新 Run | TL-11 | ToolCall.cfg（ArchivedNoPending）；Inbound 模型 |
| T-11 | 有效阈值 = min(声明, 系统上限)，与 Run 无关；转换失败保持前台；`keep_waiting` 只由自然结束或用户停止结束 | TL-10、TL-18 | 场景 TS-16（时间不建模） |
| T-12 | 工具媒体经内容能力耐久后才进入历史与结果；模型投影只含目标模型能消费的模态 | TL-19 | 场景 TS-22；投影单测 |
| T-13 | 调用级 `detach` 不越出 `startModes`，也不能否决声明的自动离场；不可兑现的能力不能声明 | TL-01、TL-10 | 单测 |
| T-14 | 一个调用的最终结果恰一次进入模型：未占位为 tool_result，已占位为一条 `system_reminder` | TL-19 | 投影单测；场景 TS-06 / TS-12 |
| T-15 | 复合打断在旧 Run 进终态的同一提交整簿注销登记，其后的结算与答复按登记簿路由 | TL-16 | ToolCall.cfg（SupersedeReleasesPositions、SupersedeKeepsWork）；场景 TS-20 |
| T-16 | 同一媒体引用以结果块为准、帧只是过程预览；客户端按 mediaId 去重 | TL-12、TL-19 | 场景 TS-22 |
| T-17 | 等待登记簿是“Run 在等谁”的唯一权威，调用上的等待关系是它的投影 | TL-16 | ToolCall.cfg（`rel` / Route / RunWait）；Run 提供者单测（同批登记、非本 Run 对象被拒） |
| H-1 | `human` 调用恰被一次答复结算；请求创建与准入同提交，答复与结算同提交 | TL-17 | ToolCall.cfg（HumanByAnswer、AnswerOnce）；崩溃注入 |
| H-2 | 等人期间的登记不阻止 Step 收束与让出；答复恰一次呈现 | TL-17、TL-19 | ToolCall.cfg（RunWait 允许 human_wait）；场景 TS-12 |
| H-3 | 中断、复合打断与不可恢复失败保留请求；只有取消、强停与单次停止关闭请求 | TL-17 | ToolCall.cfg（InterruptKeepsHuman、FailKeepsHuman）；场景 TS-19 |
| H-4 | 提问不消耗执行预算，请求不设自动超时或默认答案 | TL-17 | 场景 |
| F-1 | 帧序号在 attempt 内单调、生产者身份稳定；同键异内容封锁通道；缺口明确表达 | TL-12 | 场景 |
| F-2 | 终态与帧分开：关闭生产通道后才报终态，进度 100% 不代表成功 | TL-12 | 场景 |
| F-3 | 帧与调用读面按当前读权裁剪，每订阅独立游标，撤权结束订阅效用而不停止工作 | TL-12 | 场景 |
| F-4 | 耐久帧与同一 Session 的日志同域 append-only，可按 `(frames(S), seq)` 回放 | TL-12 | 回放测试；崩溃后未回执帧标 `unconfirmed` 的注入 |
| TP-1 | 执行 owner 存活且公平调度下，前台调用最终结算或被收口处置为终态之一 | TL-07、TL-09 | ToolCallProgress.cfg（CallsSettle） |
| TP-2 | 已受理的停止最终得到真实停止、隔离或未知三者之一的回执 | TL-09 | ToolCallProgress.cfg（StopsProgress） |
| TP-3 | 后台调用的终态最终被裁决并按目标 Run 状态处置 | TL-15 | ToolCallProgress.cfg（SettlementsResolve） |
| TP-4 | `human` 请求最终由首个合法答复结算或被显式关闭；系统不替用户定夺 | TL-17 | ToolCallProgress.cfg（HumanRequestsResolve，条件进展） |
| TP-5 | 已请求的转后台在 owner 存活下最终得到确认或失败回答 | TL-10 | 由 CallsSettle 在 `WF(DetachConfirm)` 下间接覆盖；失败分支由场景 TS-07 承担 |

## 未覆盖与已接受局限

模型不建模：帧、租户、费用、时间与预算、驱动器让出、Run 级强停的 epoch 撤销、外部 hooks、
`request_approval` 的决定被后续调用消费、占位与迟到结果的投影、门与队列、接续与队首文本的
优先级，以及 SE-18 的受理未裁决窗口。模型只有一个 Run 槽位，所以“R0 中断、R1 已在跑时 R0 的
答复仍是 R0 的接续”不在模型内。终态词表里的 `unavailable`（[TL-07](v2/contract.md)）在模型的
结算集合中没有对应值。

跨协调域的执行 owner 是已接受的边界：那时“墓碑与 `cancelled_before_execution` 结算同提交”
不再成立，[TL-08](v2/contract.md) 的 owner 账本排序成为 T-3 的唯一保护，须补跨域义务后才能
声明同等保证。同进程前台工具随进程死亡的外部效果只能 unknown，这是
[run-driver](../run-driver/verification.md) 已登记的局限，本契约沿用。

## v1 的验证范围

[v1](v1/contract.md) 已被 v2 取代并冻结。它没有自己目录下的形式模型；条款覆盖由当时的
[run-driver v2 模型](../run-driver/verification.md)、[生命周期组合模型](../../compositions/session-run-agent-lifecycles/verification.md)
与放在工具执行提案证据目录的 ToolCall 模型分担。v2 目录里的模型文件与 v1 时期用于评估候选
设计的文件逐字节相同；差别在于 D-015 之后它们证明的是已接受契约的性质，而不再是候选设计的
性质。v1 的条款与 v2 同号者语义按 v2 改写，引用 v1 的消费者仍按 v1 正文与上述历史证据。
