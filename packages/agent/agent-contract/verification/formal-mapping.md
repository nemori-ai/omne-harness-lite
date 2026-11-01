# 收尾协议形式模型的规模上限与映射

本页说明 [Finishing.tla](models/Finishing.tla) 怎样对应本包 [SPEC](../SPEC.md) 的 Journal 收尾协议，模型在什么规模上限内检查，以及哪些实现由轨迹回放支持。运行记录见 [formal-runs.md](formal-runs.md)，配置与判读规则见 [models/README.md](models/README.md)。

## 结论的边界

TLC 对有限状态做穷举。本页的任何结论只在下文的规模上限与抽象之内成立。模型通过不表示协议在任意规模下正确，也不表示实现符合模型。本页不写“已证明”。

证据分四种，分别陈述，互不代替：

| 证据 | 能支持的结论 |
| --- | --- |
| 正控（TLC 完成且无反例） | 在所列配置的全部可达状态中，所列性质都成立 |
| 负控（故意改坏的配置） | 所列性质能检出对应的错误，并给出反例轨迹 |
| 轨迹回放 | 两份内存 Journal 在回放过的轨迹上，每一步的答复与状态投影都与模型相同 |
| 未覆盖 | 下文“未覆盖”一节列出的状态、动作与实现 |

## 规模上限

所有配置只建一个租户与一个 execution。常量的含义写在模型头部。

| 配置 | 范围（Scope） | 绑定 | H 数 | 输入数 | F1 数 | 崩溃 | 丢回执与挂起写入 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| valid | call、held | standalone | 1 | 2 | 2 | 1 | 1 |
| valid-cancel | tool、card、legacy、held | standalone | 2 | 2 | 1 | 1 | 1 |
| valid-coordinated | call | coordinated | 1 | 2 | 2 | 1 | 1 |
| live | call、newrun | coordinated | 1 | 2 | 1 | 1 | 1 |
| live-cancel | tool、card、legacy、held | standalone | 1 | 2 | 1 | 0 | 1 |

“输入数”含初始输入。“崩溃”每次都跟一次接管。“丢回执与挂起写入”共用一个上限：一次写入的回执丢失，或一次写入挂起未定，各占一次。取消控制最多一个。Model 调用、Tool 调用与卡片轮各最多一个。负控与轨迹配置使用相同或更小的上限，见各配置文件。

这些上限是为了让每次运行在本机 20 分钟预算内完成。上限之外的行为没有被检查。例如：两个以上的取消控制、两次以上的崩溃、一个 execution 有多个 Model 调用，都不在检查范围内。

安全配置使用 `VIEW View`：状态的指纹不含 `act` 与 `reply`。没有动作读取前一状态的 `act` 或 `reply`，监视器与 `PointerByJa` 只读取本步设置的值，所以这样合并状态不改变检查结果。活性配置不用 VIEW，改为 `Observe = FALSE`，令 `act` 与 `reply` 保持常量。

## 状态与事件对应

| 模型变量 | 对应的 SPEC 事实 |
| --- | --- |
| `status` | `ExecutionSnapshot.state` 的 advancing、settling、ended。reconciling 并入 advancing |
| `cand` | 当前候选 `settlement.candidate` 的结论，当前路线 `settlement.route` 的种类，author route 的 `beforeTerminal` 是否已设，候选的输入水位线，以及是否为旧协议留下的取消候选 |
| `list` | 已发行的终结责任清单 `finishObligations` 及其责任投影。`outOk` 表示发行之后没有事件延长输出区间 |
| `judg` | 当前判断记录 `settlement.currentJudgment` 的判定、首个阻塞类别与判断输入 |
| `ctl` | 取消控制的受理与 intent-established 阶段：accepted、unresolved、reached（模型记作 effective） |
| `acc`、`tk` | 已受理的输入数与 I0 已承接的输入数 |
| `part` | coordinated 绑定的 Session 参加者：已受理未交入的输入，或参加者先成立的终态 |
| `call`、`pcopy` | 一个 Model 调用的 effect intent、结果登记与保管，以及生产者手中的耐久副本 |
| `tool`、`card`、`legacyRet` | 三个保管变体各自合入的原责任：Tool 原 invoke 的关联、卡片轮的对账、旧作者调用的迟到返回 |
| `hist`、`pv`、`rh`、`ptr` | 每个内部 H 的 HandoffHistory、准入提供者的结论、是否经 Rh 保管，以及 `checkpoint.currentHandoff` |
| `fresh` | 协调者手中的快照是否为当前 revision。expected 过期由它表达 |
| `zombie`、`held`、`pend` | 被接管取代的旧挂接、挂起未定的写入（未定的 operation 项）、回执丢失待重试的写入 |
| `slot` | Session 的 Run 槽位：取消之后会话可以开新 Run |
| `endc`、`final` | 终态结论与终局清单各项的处置 |
| `act`、`reply` | 最近一步的动作与答复。只供监视器、`PointerByJa` 与轨迹导出使用 |

责任闭包 `Present` 与处置 `Disp` 对应 SPEC“终结责任清单”的清单项与 `ObligationDisposition`。类别次序是 inputs、controls、operations、passages、custody。

tryFinish 的判定次序按 SPEC“判定次序与失败映射”与“条件终结”结果表建模。表中没有固定的两处取两份内存 Journal 的次序：author route 上，确定的待办与缺少的终态前证明先于未定项判定，结果为 blocked；没有确定待办时，未定项使结果为 unavailable。未定项本身从不变成 blocked，这正是 `UnknownNotBlockedOrEnded` 检查的内容。取消路线上，判断记录缺失先于判据比较，判据不符为 changed，之后才看判定。

## 抽象成一个动作的实现步骤

| 模型动作 | 实现中的步骤 |
| --- | --- |
| `TakeInputs` | `inputs` 读取批次，再以 I0 的 `commit` 保存 input-taken 事件 |
| `F1(c)` | 带 `finish` 的 settling `commit`：建立候选、author route 与 FinishIntent 投影 |
| `F2` | 不带 `finish` 的 settling `commit`。author route 没有终态前证明时，它设置证明。execution 离开 settling 之后，它使 execution 回到 settling |
| `Prepare` | `prepareFinish`：从权威闭包发行清单 |
| `TryFinish` | `tryFinish`：一次条件提交的全部判定 |
| `Establish`、`Migrate`、`Judge` | `commitSettlement` 的三个候选类变体。`Judge` 包括 Journal 构造判断输入、调用已安装的取消政策并保存判断记录 |
| `RecordToolAssociation`、`RecordCardReconciliation`、`RecordLegacyReturn` | `commitSettlement` 的三个保管类变体，包括经受信宿主读取适配核验原记录 |
| `P(h)`、`JaResolve(h)`、`JaRetire(h)` | 带 `handoff.prepare`、`handoff.resolve` 或 `handoff.retire` 的 `commit` |
| `Rh(h)` | `recordHandoff`，包括经可信提供者绑定核验原结果 |
| `ProviderPrepare`、`Exclude` | `MessageHandoff.prepare` 与 `MessageHandoff.exclude` 在提供者一侧固定结论 |
| `Takeover` | 推进者崩溃，新实例以 `attach` 接管。接管排除该 execution 全部挂起的写入，并使 execution 回到 reconciling |
| `Lose*`、`Retry` | 一次写入已提交而回执丢失，调用方以同一 operation 与同一输入重试 |

每个模型动作是一个原子步骤。实现中一个动作内部的读取、核验与提交之间的交错没有被建模。

## 被假定的环境行为

- Journal 的每次写入是一次权威原子提交。同一 execution 的写入全序。
- 取消控制的受理与意图阶段各自原子地保存阶段事实与 control 事件。
- 生产者在得到 saved 回执之后才释放自己的副本。负控 `bad-release-before-custody` 去掉这一条。
- 已安装的取消政策是 SPEC“判断输入、判据与记录”的判据：有未定项时为 unknown，否则有确定待办时为 blocked，否则为 allowed。
- Session 参加者的冲突以 changed 报告。参加者先成立终态时只允许取消路线收束。
- 活性配置假定公平性：每个持续可用的恢复与收束步骤最终会执行（弱公平）。生产者最终返回结果，提供者最终给出准入结论，挂起的写入最终被裁定，保管变体最终合入原事实。没有这些假定时，永久未定的事实会让 `CancelSettles` 不成立，这是协议允许的结果，不是缺陷。

## 性质与 SPEC 条款

| 性质 | 种类 | SPEC 条款 |
| --- | --- | --- |
| `NoEndWithPending` | 不变量 | “条件终结”结果表的 blocked 行；“终结责任清单” |
| `UnknownNotBlockedOrEnded` | 不变量（含步骤监视器） | “条件终结”结果表的 unavailable 行；“判断输入、判据与记录”第 3、4 条 |
| `CancelFirst` | 不变量 | “条件终结”：有效取消优先于普通完成或失败；“六个阶段”第 2 条 |
| `NoEndOutsideSettling` | 不变量（步骤监视器） | “条件终结”结果表的 changed 行；判定次序的 not settling |
| `NoStaleJudgment` | 不变量（步骤监视器） | “取消路线上的 tryFinish”：判断记录的判据投影须仍适用 |
| `PointerByJa` | 动作性质 | “消息准入”：`currentHandoff` 由 P 设置，只由 Ja 的 resolve 或 retire 清除或后移 |
| `OneCustodian` | 不变量 | “持久性与交付责任”；机制页“交付责任解除的两条路径与保管者更替” |
| `ReplayOriginal` | 不变量（步骤监视器） | “判定次序与失败映射”第 2 条；“原操作认回与恢复” |
| `CancelSettles` | 活性 | “取消、退出与结构变更”；“取消判断与路线”的取消路径次序 |
| `TypeOK` | 不变量 | 模型自身的取值范围 |

步骤监视器是布尔变量。它在违反发生的那一步变为 FALSE，之后保持 FALSE。这样跨步骤的约束可以作为不变量检查。

## 两种读法与探针

SPEC 写明三件事：业务前提真正变化时建立新候选并保存替代链接（“条件终结”）；新输入先成立时 tryFinish 返回 changed（“条件终结”结果表）；submit 先成功时终结必须重读并保留真实处置（“输入内容与水位线”）。SPEC 没有写明：取消候选建立之后又受理新输入时，取消怎样收束。

两份内存 Journal 的做法是：`establish-cancellation` 不替代当前的取消候选（代码注释引用 rulings-S3B），返回 invalid；候选的输入水位线落后时，tryFinish 返回 changed。两条合在一起，取消候选之后受理的一项输入会让取消一直不能收束。

模型用常量 `SupersedeStaleCancelled` 表达这个选择。FALSE 是内存 Journal 的做法。TRUE 允许 `establish-cancellation` 替代水位线已落后的取消候选，这只是让活性可以检查的一种读法。另一种读法也能使活性成立：取消候选不因后来的输入返回 changed，而把这些输入记为 held。本模型没有检查后一种读法。

正控取 TRUE。探针配置 `probe-keep-cancelled` 取 FALSE，检查 `CancelSettles` 在这种读法下是否成立。探针的结果与判读见 [formal-runs.md](formal-runs.md)。探针不是负控。哪种读法正确，由 Agent 契约拥有者裁定。

## 回放映射

回放驱动在 [src/testing-journal-replay.ts](../src/testing-journal-replay.ts)，经 `./testing` 导出为 `agentJournalReplayConformance`。轨迹由 `TraceSpec` 生成：它只含下表中有 Journal 调用对应的步骤。轨迹配置取 `SupersedeStaleCancelled = FALSE`，与内存 Journal 的读法相同。

| 模型步骤 | 回放的 Journal 调用 |
| --- | --- |
| `Load` | `load`，更新协调者手中的快照 |
| `TakeInputs` | `inputs` 加 I0 的 `commit`，expected 取手中快照 |
| `F1-complete`、`F1-failed`、`F2` | settling `commit`，expected 取手中快照 |
| `Prepare`、`TryFinish` | `prepareFinish`、`tryFinish`。授权按候选结论选择推进授权或取消授权。tryFinish 的 intent 取最近一次 settling 快照的投影 |
| `Establish`、`Judge` | `commitSettlement` 的 establish-cancellation 与 judge-cancellation |
| `Lose-*` 与 `Retry-*` | 夹具的 `faultNext(method, 'applied')` 后调用一次，再以同一请求重试 |
| `Cancel`、`Intent-*` | `control` 与 `recordControl` 的 intent-established 阶段 |
| `Submit` | 夹具受理一项输入后 `submit` |
| `Effect` | 夹具的 `produceResult`：在当前挂接下提交 effect intent |
| `RecordNone`、`Custody` | `recordResult`，transfer 为 none 或夹具给出的 custody、processed |
| `P-h1`、`Ja-h1` | 带 `handoff.prepare` 或 `handoff.resolve` 的 `commit`，挂接取当前挂接 |
| `Takeover`、`StaleWrite` | 夹具的 `takeover`，以及用被取代的挂接提交一次 `commit` |
| `Produce`、`Provider-prepared-h1` | 无 Journal 调用：生产者与准入提供者在 Journal 之外行动 |

协调者手中的快照对应模型的 `fresh`：`Load` 与自己成功的写入更新快照，其他写入方的写入、接管与重试不更新。tryFinish 返回 changed 或 blocked 时没有写入，快照不变。

每一步之后，驱动核对两件事：答复，以及 `load` 的投影（状态种类、当前候选的结论、当前路线的种类、`currentHandoff` 是否非空）。违规轨迹是三个负控（`skip-pending`、`unknown-as-pending`、`recheck-before-recognize`）在 `TraceSpec` 上的最短反例，它的最后一步是协议禁止的答复。选这三个，是因为它们的错误只改变最后一步的答复，前面各步与遵守协议的 Journal 相同。回放到遵守协议的 Journal 时，驱动必须在最后一步报告不一致。

回放不覆盖：`Migrate`、三个保管变体、`Rh`、`Exclude`、`JaRetire`、第二个 H、挂起写入及其裁定、Session 参加者的动作、`Release` 与 `NewRun`。这些步骤只由模型检查。

## 未覆盖

- 多租户与跨租户拒绝、资格核验与撤权的细节、installation 的切换、迁移链的排除与后继。
- 一个 execution 中多个 Model 或 Tool 调用、多个卡片轮、多个取消控制、suspend 与 interrupt。
- Journal 写入内部的交错、跨进程提交、存储故障与耐久性。模型假定每次写入是原子提交。
- 终态后观察、确认进度、`reconcile` 与回复准入的已核实前缀。
- 协调者一侧的取消路线（F0 与 cancelled 的 F1）。AG-20 落地时扩展模型。
- Journal 真件的回放。它在 W1-RUN-8 的接受阶段调用同一个驱动。
