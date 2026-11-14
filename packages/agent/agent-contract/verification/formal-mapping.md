# 形式模型的规模上限与映射

本页说明本包的两个形式模型怎样对应 Agent 的应然设计（[包组规格](../../SPEC.md#应然设计)），模型在什么规模上限内检查，以及哪些实现由轨迹回放支持。下文引号里的条款名是这些规则原来所在的小节名。[Finishing.tla](models/Finishing.tla) 是 Journal 收尾协议的模型，见本页从“结论的边界”到“模型取的读法”的各节。[CardRounds.tla](models/CardRounds.tla) 是 Agent 循环等人状态点的模型，见“[等人状态点模型](#等人状态点模型)”。每份配置的预期见末节“[配置的预期](#配置的预期)”。

## 结论的边界

TLC 对有限状态做穷举。本页的任何结论只在下文的规模上限与抽象之内成立。模型通过不表示协议在任意规模下正确，也不表示实现符合模型。本页不写“已证明”。

证据分四种，分别陈述，互不代替：

| 证据                     | 能支持的结论                                                          |
| ------------------------ | --------------------------------------------------------------------- |
| 正控（TLC 完成且无反例） | 在所列配置的全部可达状态中，所列性质都成立                            |
| 负控（故意改坏的配置）   | 所列性质能检出对应的错误，并给出反例轨迹                              |
| 轨迹回放                 | 两份内存 Journal 在回放过的轨迹上，每一步的答复与状态投影都与模型相同 |
| 未覆盖                   | 下文“未覆盖”一节列出的状态、动作与实现                                |

探针不是证据的第五种。探针只记录一条性质在一种未采用的读法下是否成立，不参与通过判定。

## 规模上限

所有配置只建一个租户与一个 execution。常量的含义写在模型头部。

| 配置                 | 范围（Scope）            | 绑定        | H 数 | 输入数 | F1 数 | 崩溃 | 丢回执与挂起写入 | `SupersedeStaleCancelled` |
| -------------------- | ------------------------ | ----------- | ---- | ------ | ----- | ---- | ---------------- | ------------------------- |
| valid                | call、held               | standalone  | 1    | 2      | 2     | 1    | 1                | TRUE                      |
| valid-cancel         | tool、card、legacy、held | standalone  | 2    | 2      | 1     | 1    | 1                | TRUE                      |
| valid-coordinated    | call                     | coordinated | 1    | 2      | 2     | 1    | 1                | TRUE                      |
| valid-keep-cancelled | tool、card、legacy、held | standalone  | 2    | 2      | 1     | 1    | 1                | FALSE                     |
| live                 | call、newrun             | coordinated | 1    | 2      | 1     | 1    | 1                | TRUE                      |
| live-cancel          | tool、card、legacy、held | standalone  | 1    | 2      | 1     | 0    | 1                | TRUE                      |

“输入数”含初始输入。“崩溃”每次都跟一次接管。“丢回执与挂起写入”共用一个上限：一次写入的回执丢失，或一次写入挂起未定，各占一次。取消控制最多一个。Model 调用、Tool 调用与卡片轮各最多一个。负控与轨迹配置使用相同或更小的上限，见各配置文件。

这些上限是为了让每次运行在本机 20 分钟预算内完成。上限之外的行为没有被检查。例如：两个以上的取消控制、两次以上的崩溃、一个 execution 有多个 Model 调用，都不在检查范围内。

回执丢失只对四种写入建模：tryFinish、prepareFinish、judge-cancellation 与 Model 结果的保管写入。下列写入没有回执丢失的状态：带 F1、F2、I0、P、Ja 或 retire 的 commit，establish-cancellation，migrate-cancellation，三个保管变体，recordHandoff，submit，control 与 recordControl。挂起写入（`Hold`）只表达“某个推进写入未定”，不表达它的重试答复。

安全配置使用 `VIEW View`：状态的指纹不含 `act` 与 `reply`。没有动作读取前一状态的 `act` 或 `reply`，监视器与 `PointerByJa` 只读取本步设置的值，所以这样合并状态不改变检查结果。活性配置不用 VIEW，改为 `Observe = FALSE`，令 `act` 与 `reply` 保持常量。

## 状态与事件对应

| 模型变量                    | 对应的 SPEC 事实                                                                                                                                                        |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `status`                    | `ExecutionSnapshot.state` 的 advancing、settling、ended。reconciling 并入 advancing                                                                                     |
| `cand`                      | 当前候选 `settlement.candidate` 的结论，当前路线 `settlement.route` 的种类，author route 的 `beforeTerminal` 是否已设，候选的输入水位线，以及是否为旧协议留下的取消候选 |
| `list`                      | 已发行的终结责任清单 `finishObligations` 及其责任投影。`outOk` 表示发行之后没有事件延长输出区间                                                                         |
| `judg`                      | 当前判断记录 `settlement.currentJudgment` 的判定、首个阻塞类别与判断输入                                                                                                |
| `ctl`                       | 取消控制的受理与 intent-established 阶段：accepted、unresolved、reached（模型记作 effective）。effective 同时表示必要撤权已成立，见“被假定的环境行为”                   |
| `acc`、`tk`                 | 已受理的输入数与 I0 已承接的输入数                                                                                                                                      |
| `part`                      | coordinated 绑定的 Session 参加者：已受理未交入的输入，或参加者先成立的终态                                                                                             |
| `call`、`pcopy`             | 一个调用的 effect intent、结果登记与保管，以及生产者手中的耐久副本。`call = "settled"` 抽象“Journal 一侧已耐久保管该结果”，不区分保管经哪条路径成立，见下段             |
| `produced`                  | 幽灵变量：结果已经产生。`Produce` 置位，此后不清除，任何动作都不读它。它只供 `OneCustodian` 判断结果是否存在                                                            |
| `tool`、`card`、`legacyRet` | 三个保管变体各自合入的原责任：Tool 原 invoke 的关联、卡片轮的对账、旧作者调用的迟到返回                                                                                 |
| `hist`、`pv`、`rh`、`ptr`   | 每个内部 H 的 HandoffHistory、准入提供者的结论、是否经 Rh 保管，以及 `checkpoint.currentHandoff`                                                                        |
| `fresh`                     | 协调者手中的快照是否为当前 revision。expected 过期由它表达                                                                                                              |
| `zombie`、`held`、`pend`    | 被接管取代的旧挂接、挂起未定的推进写入（未定的 operation 项）、回执丢失待重试的写入                                                                                     |
| `slot`                      | Session 的 Run 槽位：取消之后会话可以开新 Run                                                                                                                           |
| `endc`、`final`             | 终态结论与终局清单各项的处置                                                                                                                                            |
| `act`、`reply`              | 最近一步的动作与答复。只供监视器、`PointerByJa` 与轨迹导出使用                                                                                                          |

`call` 与 `pcopy` 的保管路径：SPEC 规定 Model 结果经“接收共同提交”一次保存完整材料、条目和原消费责任，不走 recordResult 的 custody 路径（“持久性与交付责任”，“提交与保管”）。Tool 结果走 recordResult 的 custody 或 processed 路径。模型的 `Custody` 动作把这两条路径抽象成同一个“Journal 取得保管”的步骤。`OneCustodian` 的结论不依赖选哪一条路径，但模型也不能区分两条路径各自的错误。回放把 `RecordNone` 与 `Custody` 映射到 recordResult，见“回放映射”。

## 责任闭包与处置的出处

`Present` 是模型中的责任闭包，`Disp` 是每项在候选结论 c 下的处置。`NoEndWithPending`（S1）与 `UnknownNotBlockedOrEnded`（S2）都以 `Disp` 为准。所以 `Disp` 的某个分支分错时，S1 与 S2 都检查不出来。下面两张表给出每一项与每一个分支的出处。没有出处的分支标为抽象或待裁决，并写明它对 S1、S2 的影响。

类别次序是 inputs、controls、operations、passages、custody，出处是“条件终结”结果表的 blocked 行。

| `Present` 的项               | 出现条件                          | SPEC 清单项的 kind 与类别               | 出处                                                                      |
| ---------------------------- | --------------------------------- | --------------------------------------- | ------------------------------------------------------------------------- |
| `<<"input", i>>`             | 每个已受理的输入                  | accepted-input，inputs                  | “终结责任清单”的 kind 表                                                  |
| `<<"control", 0>>`           | 取消控制已受理                    | control，controls                       | 同上。control 项的必需内容是开放问题 U-9 的缺口，模型只取它的类别（抽象） |
| `<<"call", 0>>`              | Model 调用的 effect intent 已保存 | call，operations                        | 同上                                                                      |
| `<<"result", 0>>`            | 结果已登记（recorded 或 settled） | result，custody                         | 同上                                                                      |
| `<<"tool", 0>>`              | Tool 原 invoke 的返回未定         | call（Tool 的原 intent 键），operations | 同上，以及“取消后的 Tool 原 invoke 恢复”                                  |
| `<<"card", 0>>`              | 卡片轮的呈现未定                  | card-round，passages                    | 同上                                                                      |
| `<<"legacy", 0>>`            | 旧取消候选的作者调用仍在途        | passage，passages                       | 同上，以及“迟到的作者调用返回”                                            |
| `<<"h1", 0>>`、`<<"h2", 0>>` | 内部 H 的历史为 pending           | handoff，operations                     | “终结责任清单”首段之后的 handoff 责任段                                   |
| `<<"operation", 0>>`         | 一个推进写入挂起未定              | operation，operations                   | “终结责任清单”的 kind 表                                                  |

| `Disp` 的分支                         | 处置    | 出处或判定                                                                                                                                                                                             | 对 S1、S2 的影响                                                                                                               |
| ------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| input，已被 I0 承接                   | settled | “条件终结”的五类责任表 inputs 行：普通候选不越过待承接输入                                                                                                                                             | 无                                                                                                                             |
| input，未承接，候选为 cancelled       | held    | inputs 行：取消候选保留所有 accepted input 及终局处置。SPEC 没有写这一处置是 held 还是 settled，取 held 是抽象                                                                                         | held 不触发 S1、S2，所以这两种取法对两条性质相同                                                                               |
| input，未承接，普通候选               | pending | inputs 行，PendingReason 的 input-disposition                                                                                                                                                          | S1 依赖这一分支                                                                                                                |
| control，ctl 为 accepted 或 effective | settled | 普通候选：“六个阶段”写明取消仅 accepted 时普通完成可以先 ended。取消候选：五类责任表 controls 行要求取消与必要撤权已成立，模型的 effective 包含撤权（环境假定）                                        | 无                                                                                                                             |
| control，ctl 为 unresolved            | pending | 待裁决 4。PendingReason 有 cancel-intent。另一方面，“六个阶段”写“未知单独标记”，“条件终结”结果表把未知映射为 unavailable                                                                               | 若应为 unknown：S1 不变，S2 的含义改变，普通候选在此时应返回 unavailable，而模型返回 blocked-controls                          |
| call，issued                          | unknown | 五类责任表 operations 行：可能改变候选的未定操作先恢复，不把 unknown 当未发生。结果表的 unavailable 行                                                                                                 | S2 依赖这一分支                                                                                                                |
| call，recorded 或 settled             | settled | call 项的“收场事实”已成立。结果的保管由 result 项单独追踪                                                                                                                                              | 无                                                                                                                             |
| result，recorded                      | pending | 五类责任表 custody 行，PendingReason 的 result-custody                                                                                                                                                 | S1 依赖这一分支                                                                                                                |
| result，settled                       | settled | custody 行：已有耐久保管                                                                                                                                                                               | 无                                                                                                                             |
| tool，unknown                         | unknown | “取消后的 Tool 原 invoke 恢复”：admission 未定若可能影响终结合法性，判断保持 unknown，tryFinish 为 unavailable                                                                                         | S2 依赖这一分支                                                                                                                |
| tool，held                            | held    | 同节：已知 accepted 并有合法耐久接收者的调用可以作为 held 继续存在                                                                                                                                     | 无                                                                                                                             |
| card，unknown                         | unknown | `ObligationDisposition` 的 unknown 分支：原事实不确定。旧记录迁移表的 asked 行：呈现未知时 lookup 原批                                                                                                 | S2 依赖这一分支                                                                                                                |
| card，held                            | held    | “commitSettlement 的变体”的 record-card-reconciliation 行                                                                                                                                              | 无                                                                                                                             |
| legacy，inflight                      | unknown | “迟到的作者调用返回”：返回源不能验证时保持未定                                                                                                                                                         | S2 依赖这一分支                                                                                                                |
| legacy，held                          | held    | commitSettlement 变体表的 record-legacy-return 行                                                                                                                                                      | 无                                                                                                                             |
| h1、h2，候选为 complete               | pending | handoff 责任段：complete 不以 retained 绕过仍适用的来源。PendingReason 的 handoff-history                                                                                                              | S1 依赖这一分支                                                                                                                |
| h1、h2，候选为 failed 或 cancelled    | held    | handoff 责任段：合法的 failed 或 cancelled 最终同提交固定不发布处置与真实承接，才允许记为 held。模型不看 `pv` 与 `rh` 就记 held。同一段写明“H unknown 且可能改变终结合法性时……不能只填 held”。待裁决 5 | 模型允许在 `pv = "none"`、没有 exclude、也没有 Rh 时以 failed 或 cancelled 结束。若 SPEC 的这种情形应为 unknown，S2 检查不到它 |
| operation                             | unknown | 五类责任表 operations 行，结果表的 unavailable 行                                                                                                                                                      | S2 依赖这一分支                                                                                                                |

`FinishCheck` 对 author route 上的 cancelled 候选返回 blocked-passages。这只发生在旧协议留下的取消候选迁移之前。出处是类比：“条件终结”规定 cancelled 候选的终态前判断是当前的判断记录，迁移之前没有判断记录。结果表“取消路线上判断记录确定缺失 → blocked，类别为 passages”一行字面上只适用于取消路线。这一分支是抽象。它只影响 S2 的 blocked 合取项，该合取项对这一情形接受 blocked-passages。

## tryFinish 的判定次序

tryFinish 的判定次序按 SPEC“判定次序与失败映射”与“条件终结”结果表建模。结果表没有固定两处先后，模型在这两处取两份内存 Journal 的次序。实现不是有权的依据，所以这两处都列为待裁决或已知选择：

1. author route 上，确定的待办与缺少的终态前证明先于未定项判定，结果为 blocked。没有确定待办时，未定项使结果为 unavailable。“条件终结”结果表的 blocked 行与 unavailable 行没有规定这两行的先后。这一处列为待裁决 2。
2. 取消路线上，判断记录缺失先于判据比较，判据不符为 changed，之后才看判定。“取消路线上的 tryFinish”规定先核对判断记录的判据输入仍适用，这一处与它一致。

待裁决 2 的两种读法对 S2 的影响：

- 读法 blocked（模型现状）：S2 的 blocked 合取项只要求 blocked 的类别是一项确定的待办。它不要求同时没有未定项。在没有故意错误的模型中，TakeInputs → Effect → F1-complete → Prepare → TryFinish 在调用未定时返回 blocked-passages，S2 接受它。
- 读法 unavailable（“结果未知时不返回 blocked”的强读法）：S2 需要再加一个合取项“blocked 时没有未定项”。模型与两份内存 Journal 都要改。上面那条路径在这个读法下是违反，它也是违规轨迹 `unknown-as-pending` 的前缀。

## 抽象成一个动作的实现步骤

| 模型动作                                                                  | 实现中的步骤                                                                                                                                                                         |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `TakeInputs`                                                              | `inputs` 读取批次，再以 I0 的 `commit` 保存 input-taken 事件。它使 execution 离开 settling                                                                                           |
| `F1(c)`                                                                   | 带 `finish` 的 settling `commit`：建立候选、author route 与 FinishIntent 投影                                                                                                        |
| `F2`                                                                      | 不带 `finish` 的 settling `commit`。author route 没有终态前证明时，它设置证明。execution 以任何方式离开 settling 之后，它使 execution 带着同一候选回到 settling，见“S4 的含义与依据” |
| `Prepare`                                                                 | `prepareFinish`：从权威闭包发行清单                                                                                                                                                  |
| `TryFinish`                                                               | `tryFinish`：一次条件提交的全部判定                                                                                                                                                  |
| `Establish`、`Migrate`、`Judge`                                           | `commitSettlement` 的三个候选类变体。`Judge` 包括 Journal 构造判断输入、调用已安装的取消政策并保存判断记录                                                                           |
| `RecordToolAssociation`、`RecordCardReconciliation`、`RecordLegacyReturn` | `commitSettlement` 的三个保管类变体，包括经受信宿主读取适配核验原记录                                                                                                                |
| `P(h)`、`JaResolve(h)`、`JaRetire(h)`                                     | 带 `handoff.prepare`、`handoff.resolve` 或 `handoff.retire` 的 `commit`。模型令 Ja 使 execution 离开 settling，这一选择列为待裁决 3                                                  |
| `Rh(h)`                                                                   | `recordHandoff`，包括经可信提供者绑定核验原结果                                                                                                                                      |
| `ProviderPrepare`、`Exclude`                                              | `MessageHandoff.prepare` 与 `MessageHandoff.exclude` 在提供者一侧固定结论                                                                                                            |
| `Takeover`                                                                | 推进者崩溃，新实例以 `attach` 接管，execution 回到 reconciling（“恢复与接管”）。旧挂接被取代，所以它挂起的推进写入此后不能再提交。模型因此在接管时清除挂起写入                       |
| `Lose*`、`Retry`、`RetryCustody`                                          | 一次写入已提交或未提交而回执丢失，调用方以同一 operation 与同一输入重试。`RetryCustody` 只在写入已生效，或生产者仍持有副本时可用                                                     |

每个模型动作是一个原子步骤。实现中一个动作内部的读取、核验与提交之间的交错没有被建模。

## 被假定的环境行为

- Journal 的每次写入是一次权威原子提交。同一 execution 的写入全序。
- 取消控制的受理与意图阶段各自原子地保存阶段事实与 control 事件。
- 必要撤权（“六个阶段”第 3 项）并入 effective。coordinated 绑定下，这包括 Session reducer 把 SE16 写在取消批次里。模型不单独表达撤权尚未成立的状态。
- 生产者在得到 saved 回执之后才释放自己的副本。负控 `bad-release-before-custody` 与 `bad-release-while-issued` 各去掉这一条的一部分。
- 已安装的取消政策是 SPEC“判断输入、判据与记录”的判据第 3、4 条：有未定项时为 unknown，否则有确定待办时为 blocked，否则为 allowed。这两条是政策的义务，模型把它们写进 `Decision`，作为假定，不作为被检查的性质。
- `Exclude` 不要求有效取消已成立，也没有 unknown 结论。SPEC“内部 H 的排除与退役”要求当前有效取消已成立，并允许 unknown。valid-cancel 对 retire 与第二个 H 的覆盖依赖这一放宽，因为 `JaRetire` 与 `P` 都要求 `ctl # "effective"`。
- Session 参加者只有两种条件：已受理未交入的输入，以及参加者先成立的终态。它们的冲突以 changed 报告。参加者先成立终态时只允许取消路线收束。参加者的 ready、blocked、unknown 条件没有建模。
- 挂起写入（`held`）只表示当前挂接的推进写入。保管与观察写入不受 stale-advance 约束（“判定次序与失败映射”第 4 条与第 9 条），接管不裁定它们。模型没有表达挂起的保管或观察写入。
- 活性配置假定公平性：每个持续可用的恢复与收束步骤最终会执行（弱公平）。生产者最终返回结果，提供者最终给出准入结论，挂起的写入最终被裁定，保管变体最终合入原事实。没有这些假定时，永久未定的事实会让 `CancelSettles` 不成立，这是协议允许的结果，不是缺陷。

## 性质与 SPEC 条款

| 性质                             | 种类                   | 出处与模型实际检查的内容                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NoEndWithPending`（S1）         | 不变量                 | “条件终结”结果表的 blocked 行，“终结责任清单”。检查：ended 时终局清单没有 pending 处置。处置以 `Disp` 为准，见“责任闭包与处置的出处”                                                                                                                                                                                                                                                      |
| `UnknownNotBlockedOrEnded`（S2） | 不变量（含步骤监视器） | “条件终结”结果表的 unavailable 行（原操作未知 → unavailable），以及“取消路线上当前判断记录为 unknown → unavailable”一行。检查：tryFinish 不在有未定项时 ended，终局清单没有 unknown 处置，blocked 答复指向一项确定的待办或缺失的判断记录。监视器的第三个合取项（有未定项时判断为 unknown）求值的是动作本身使用的 `Decision`，正控下恒真。它只在负控中有证据力，见上节判据第 3、4 条的假定 |
| `CancelFirst`（S3）              | 不变量                 | “条件终结”：有效取消优先于普通完成或失败。“六个阶段”第 2 项                                                                                                                                                                                                                                                                                                                               |
| `NoEndOutsideSettling`（S4）     | 不变量（步骤监视器）   | SPEC 没有对应条款，见“S4 的含义与依据”。检查：在 status 不是 settling 的那一步，tryFinish 不 ended                                                                                                                                                                                                                                                                                        |
| `NoStaleJudgment`（S5）          | 不变量（步骤监视器）   | “取消路线上的 tryFinish”：判断记录的判据投影须仍适用                                                                                                                                                                                                                                                                                                                                      |
| `PointerByJa`（S6）              | 动作性质               | “消息准入”：`currentHandoff` 由 P 设置，只由 Ja 的 resolve 或 retire 清除或后移                                                                                                                                                                                                                                                                                                           |
| `OneCustodian`（S7）             | 不变量                 | “持久性与交付责任”，“条件终结”五类责任表 custody 行：没有无人保管的窗口。检查：结果产生之后（幽灵变量 `produced`），每个状态恰有一个耐久保管者                                                                                                                                                                                                                                            |
| `ReplayOriginal`（S8）           | 不变量（步骤监视器）   | “判定次序与失败映射”第 2 条，“原操作认回与恢复”。检查范围见下文                                                                                                                                                                                                                                                                                                                           |
| `CancelSettles`（L1）            | 活性                   | “取消、退出与结构变更”，“取消判断与路线”的取消路径次序。只在 `SupersedeStaleCancelled = TRUE` 前提下检查，见“取消收束”                                                                                                                                                                                                                                                                    |
| `TypeOK`                         | 不变量                 | 模型自身的取值范围                                                                                                                                                                                                                                                                                                                                                                        |

步骤监视器是布尔变量。它在违反发生的那一步变为 FALSE，之后保持 FALSE。这样跨步骤的约束可以作为不变量检查。

S4 与 S5 复述 `TryFinishReply` 中的守卫：status 不是 settling 时答 changed，判断输入与当前闭包不同时答 changed。所以它们的正控只说明模型中没有别的路径绕过这两个守卫。它们的证据力主要来自负控：去掉守卫后性质被违反。

S8 的正控按定义成立。没有故意错误时，`Retry` 把答复直接定义为原答复，所以 `okReplay` 恒真。S8 的证据只有两个来源：负控 `bad-recheck-before-recognize` 区分出一种错误的判定次序，以及轨迹回放中的违规轨迹 `recheck-before-recognize`。S8 只覆盖 tryFinish、prepareFinish 与 judge-cancellation 三种写入的重试。保管写入的重试（`RetryCustody`）不更新 `okReplay`。其余写入没有回执丢失的状态，见“规模上限”。

### S4 的含义与依据

S4 的出处不是 SPEC。SPEC“判定次序与失败映射”没有“not settling”这一项。“条件终结”结果表的 changed 行写的是“候选依据与实质前提已知变化”，模型不检查这一行：模型不比较候选的 checkpoint 或条件依据。S4 的来源是一条形式验证的裁定“执行不在 settling 时旧候选不能结束执行”，以及两份内存 Journal 的 tryFinish（[agent 的内存 Journal](../../agent/src/testing/journal.ts) 在 settling 之外答 changed）。

S4 只覆盖这一种情形：tryFinish 在 status 不是 settling 的那一步不 ended。它不覆盖下面的模式。execution 离开 settling 之后，`F2` 使它带着同一候选回到 settling，之后同一候选可以 ended。离开的方式有四种：

| 离开 settling 的动作    | F2 复活同一候选的依据                                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `Takeover`              | “恢复与接管”：接管使 execution 回到 reconciling。Loop 算法页的“恢复入口与回归点”表的“执行状态 settling”行：已有候选时回 F2 或 F3，候选保持 |
| `TakeInputs`（I0 批次） | 没有依据。待裁决 3                                                                                                                         |
| `JaResolve`             | 没有依据。Ja 是否必须离开 settling 也没有依据。待裁决 3                                                                                    |
| `JaRetire`              | 同上                                                                                                                                       |

例：符合轨迹 `complete-2` 先固定候选（F1-complete），再发布一条消息并离开 settling（Ja-h1），再 F2，最后以同一候选 ended。另一条路径也可达：F1-complete（输入尚未承接）→ TakeInputs → F2 → Prepare → TryFinish ended。这两条路径在 SPEC 下是否合法，由待裁决 3 决定。

## 取消收束的两种读法

SPEC 写明三件事：业务前提真正变化时建立新候选并保存替代链接（“条件终结”）；新输入先成立时 tryFinish 返回 changed（“条件终结”结果表）；submit 先成功时终结必须重读并保留真实处置（“输入内容与水位线”）。SPEC 没有写明：取消候选建立之后又受理新输入时，取消怎样收束。两种读法各与一处原文相抵：

- 读法甲：`establish-cancellation` 替代水位线已落后的取消候选。它超出“commitSettlement 的变体”表 establish-cancellation 行的“Journal 唯一允许的新事实”，那一列只允许取代 complete 或 failed 候选。
- 读法乙：取消候选不因后来的输入返回 changed，这些输入记为 held，取消收束之后再处理。五类责任表 inputs 行支持它（取消候选保留所有 accepted input 及终局处置）。它与结果表 changed 行的“含新输入先成立”相抵。

模型用常量 `SupersedeStaleCancelled` 表达这个选择。FALSE 是内存 Journal 的做法。TRUE 是读法甲。读法乙在模型中没有对应的取值。

活性的结论：两个活性正控取 TRUE，所以 `CancelSettles` 只在读法甲下、在所列规模上限内成立。探针 `probe-keep-cancelled` 取 FALSE，TLC 给出反例，即在内存 Journal 的读法下 `CancelSettles` 不成立。读法乙下的活性没有被检查。

安全的结论覆盖 FALSE。理由如下：

1. 两个取值只在 `Establish` 中有差别。当前候选是水位线落后的取消候选时，TRUE 建立新候选，FALSE 返回 invalid。
2. 返回 invalid 的那一步只改变 `act` 与 `reply`。它不改变 `View` 中的任何变量，监视器也不变，所以在 `View` 下它是一次停顿。
3. 其他动作的启用条件与效果都不读这个常量。
4. 所以取 FALSE 的每个行为删去这些停顿后，是取 TRUE 的一个行为，经过的 `View` 状态相同。八个不变量只读 `View` 中的变量。`PointerByJa` 只约束改变 `ptr` 的步，返回 invalid 的那一步不改变 `ptr`。

因此，取 TRUE 的安全正控在同一规模上限内的结论对 FALSE 也成立。配置 `valid-keep-cancelled` 用 valid-cancel 的范围取 FALSE，作为这一推理的机器核对。这一推理不覆盖读法乙，因为乙改变 tryFinish 的答复，不只是 `Establish`。

## 回放映射

回放驱动在 [src/testing-journal-replay.ts](../src/testing-journal-replay.ts)，经 `./testing` 导出为 `agentJournalReplayConformance`。轨迹由 `TraceSpec` 生成：它只含下表中有 Journal 调用对应的步骤。轨迹配置取 `SupersedeStaleCancelled = FALSE`，与内存 Journal 的读法相同。

| 模型步骤                          | 回放的 Journal 调用                                                                                                                                    |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Load`                            | `load`，更新协调者手中的快照                                                                                                                           |
| `TakeInputs`                      | `inputs` 加 I0 的 `commit`，expected 取手中快照                                                                                                        |
| `F1-complete`、`F1-failed`、`F2`  | settling `commit`，expected 取手中快照                                                                                                                 |
| `Prepare`、`TryFinish`            | `prepareFinish`、`tryFinish`。授权按候选结论选择推进授权或取消授权。tryFinish 的 intent 取最近一次 settling 快照的投影                                 |
| `Establish`、`Judge`              | `commitSettlement` 的 establish-cancellation 与 judge-cancellation                                                                                     |
| `Lose-*` 与 `Retry-*`             | 夹具的 `faultNext(method, 'applied')` 后调用一次，再以同一请求重试                                                                                     |
| `Cancel`、`Intent-*`              | `control` 与 `recordControl` 的 intent-established 阶段                                                                                                |
| `Submit`                          | 夹具受理一项输入后 `submit`                                                                                                                            |
| `Effect`                          | 夹具的 `produceResult`：在当前挂接下提交 effect intent                                                                                                 |
| `RecordNone`、`Custody`           | `recordResult`，transfer 为 none 或夹具给出的 custody、processed。这是 Tool 结果的保管路径。Model 结果在 SPEC 中经接收共同提交保存，回放不检查那条路径 |
| `P-h1`、`Ja-h1`                   | 带 `handoff.prepare` 或 `handoff.resolve` 的 `commit`，挂接取当前挂接                                                                                  |
| `Takeover`、`StaleWrite`          | 夹具的 `takeover`，以及用被取代的挂接提交一次 `commit`                                                                                                 |
| `Produce`、`Provider-prepared-h1` | 无 Journal 调用：生产者与准入提供者在 Journal 之外行动                                                                                                 |

协调者手中的快照对应模型的 `fresh`：`Load` 与自己成功的写入更新快照，其他写入方的写入、接管与重试不更新。tryFinish 返回 changed 或 blocked 时没有写入，快照不变。

每一步之后，驱动核对两件事：答复，以及 `load` 的投影（状态种类、当前候选的结论、当前路线的种类、`currentHandoff` 是否非空）。违规轨迹是三个负控（`skip-pending`、`unknown-as-pending`、`recheck-before-recognize`）在 `TraceSpec` 上的最短反例，它的最后一步是协议禁止的答复。选这三个，是因为它们的错误只改变最后一步的答复，前面各步与遵守协议的 Journal 相同。回放到遵守协议的 Journal 时，驱动必须在最后一步报告不一致。

下列步骤不回放，只由模型检查：

| 步骤                                                                                 | 不回放的原因                                                                                               |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `Migrate`、`RecordLegacyReturn`、`RecordToolAssociation`、`RecordCardReconciliation` | 当前的回放驱动没有映射它们。夹具接口已有可选控制 `seedLegacyCandidate` 与 `hostRecord`，扩展驱动后可以回放 |
| `Rh`、`JaRetire`、第二个 H                                                           | 当前的回放驱动没有映射它们。`JaRetire` 与第二个 H 都要先经 `Exclude`                                       |
| `Exclude`、`ProviderPrepare` 的 rejected                                             | 提供者一侧的动作，没有 Journal 调用。prepared 只作为无调用的步骤出现在轨迹中                               |
| `Hold`、`Decide`                                                                     | 挂起写入在模型中是抽象的未定推进写入，没有对应的单一 Journal 调用                                          |
| `ParticipantAccept`、`Deliver`、`ParticipantTerminal`                                | 轨迹配置取 standalone 绑定（`Coordinated = FALSE`），回放驱动没有映射参加者的步骤                          |
| `LoseCustody`、`RetryCustody`                                                        | 夹具的 `faultNext` 不支持 recordResult，回放不能注入保管写入的回执丢失                                     |
| `Release`                                                                            | 生产者一侧的动作，没有 Journal 调用                                                                        |
| `NewRun`                                                                             | Run 槽位属于 Session，没有 Journal 调用                                                                    |

## 未覆盖

- 多租户与跨租户拒绝、资格核验与撤权的细节、installation 的切换、迁移链的排除与后继。
- 一个 execution 中多个 Model 或 Tool 调用、多个卡片轮、多个取消控制、suspend 与 interrupt。
- Journal 写入内部的交错、跨进程提交、存储故障与耐久性。模型假定每次写入是原子提交。
- 终态后观察、确认进度、`reconcile` 与回复准入的已核实前缀。
- 协调者一侧的取消路线（F0 与 cancelled 的 F1）。
- 取消收束的读法乙，见“取消收束”。
- 结果的 processed 路径。模型只有 custody 一条保管路径。
- Model 结果的接收共同提交与 Tool 结果的 recordResult 保管路径之间的差别。
- 参加者的 ready、blocked、unknown 条件，有效取消之前的 exclude 与 exclude 的 unknown 结论，撤权尚未成立的状态。见“被假定的环境行为”。
- author route 的终态前经过只是一个布尔量。清单在 F2 之后仍然有效，模型不强制“先 F2 后 prepareFinish”。轨迹 `ordinary-1` 先 Prepare 后 F2，而“条件终结”写普通路径的次序固定。模型只检查 tryFinish 在没有证明时不 ended，不检查调用方是否按次序调用。
- 回执丢失只对 tryFinish、prepareFinish、judge-cancellation 与保管写入建模，见“规模上限”。
- M6 的确定拒绝。它经 F1 以 `model-refused` 结束，call 项以 Model 的原拒绝为收场依据退出 `calls`。模型的 call 只有 issued、recorded、settled 三态，没有已拒绝态。

## 模型取的读法

下列四项，规格的文字不能决定模型应取哪种读法；模型取了表中的一种。

| 编号 | 问题                                                                                                                                         | 模型现状                      | 影响                                                                                                                  |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 2    | author route 上确定待办与未定项并存时，tryFinish 返回 blocked 还是 unavailable                                                               | blocked，取自两份内存 Journal | 决定 S2 的含义，见“tryFinish 的判定次序”。选 unavailable：改两份内存 Journal 与模型。选 blocked：收窄裁定里 S2 的措辞 |
| 3    | 普通候选在 execution 离开 settling（I0 批次或 Ja）之后，能否由不带 finish 的 settling commit 复活，还是必须重新 F1。Ja 是否必须离开 settling | 能复活，Ja 离开 settling      | 决定 S4 的含义，见“S4 的含义与依据”                                                                                   |
| 4    | intent 阶段为 unresolved 的控制项怎样处置：pending（cancel-intent）还是 unknown                                                              | pending                       | 与开放问题 U-9 相关。决定 S2 在这一情形下的含义                                                                       |
| 5    | failed 或 cancelled 终结时，提供者尚无结论、也没有 exclude 的内部 H 能否记 held                                                              | held                          | handoff 责任段写明 H unknown 时不能只填 held。若这一情形应为 unknown，S2 检查不到它                                   |

## 等人状态点模型

[CardRounds.tla](models/CardRounds.tla) 检查 Agent 循环收到一个需要等人的结论之后的原生等待：Loop 算法页的 X1 至 X4 与一个动作批的屏障 A1。判断来自谁不在模型内。官方准入的 `need-decision` 与扩展的 `ask` 都抽象为一个返回 ask 的扩展调用（Passage）。交回（HandBack）抽象为带答复的 `replay`：官方准入是带 `decision` 再次 `admit`，作者扩展是带 `replay{binding}` 再次调用。扩展运行时、注入能力的操作认回与输出校验也不在模型内。

本节的结论只在下文的规模上限与抽象内成立。它不是证明，也不表示实现符合模型。本模型没有轨迹回放。

### 现有模型已覆盖的部分

本模型只补现有模型没有的部分。下表记录比较的结果。

| 性质                                                                       | 现有模型                                                                                                                                                                                                                      | 本模型                                                                                                                       |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 判断与答复都齐备之后才推进一次，崩溃不重跑已记录的判断，推进的活性         | HITL [ContinuationComposition.tla](../../../human-intervention/human-intervention/verification/models/ContinuationComposition.tla) 的 `SafeAdvance`、`OnceAdvance`、`RecordedJudgmentNotRepeated`、`ReadyProgress`            | 引用，不重复。本模型在 Agent 的台账状态上检查同一屏障的 `BarrierBeforeApply` 与 `Progress`，因为 HITL 模型没有卡片轮次的状态 |
| 一张卡片只有一个有效答复，作废后不复活，答复保管，租户隔离                 | HITL [HumanDecision.tla](../../../human-intervention/human-intervention/verification/models/HumanDecision.tla) 的 `UniqueDecision`、`NoRevival`、`Custody`、`TenantIsolation`                                                 | 作为提供者前提：`Answer` 只作用于 pending 的卡片。不重复检查                                                                 |
| 等人的调用不占执行名额，同会话与其他会话照常推进                           | HITL [ExecutionSlots.tla](../../../human-intervention/human-intervention/verification/models/ExecutionSlots.tla) 与 [WaitIsolation.tla](../../../human-intervention/human-intervention/verification/models/WaitIsolation.tla) | 只检查到“没有本 run 的执行占用”这一层：`WaitHoldsNoSlot`                                                                     |
| 卡片轮在终结责任清单中的处置与对账合入                                     | [Finishing.tla](models/Finishing.tla) 的 `CardAsk` 与 `RecordCardReconciliation`（一轮，只有 unknown 与 held 两态）                                                                                                           | 引用。本模型把终结抽象为一步 `End`，检查终结之后 reconcile 对每一轮的处置                                                    |
| 先保存后呈现，present 结果未知只用 lookup，同一请求不在第二个 round 下重发 | 无                                                                                                                                                                                                                            | `OncePresent`                                                                                                                |
| 同批全部链到达最终结论或合法等待之后才呈现                                 | 无                                                                                                                                                                                                                            | `BarrierBeforePresent`                                                                                                       |
| 一轮的全部卡片都有人的答复之后才交回                                       | 无                                                                                                                                                                                                                            | `AllAnsweredBeforeHandBack`                                                                                                  |
| 同一份答复至多交回一次，崩溃恢复不重复交回                                 | 无（ContinuationComposition 只在 HITL 的推进上检查）                                                                                                                                                                          | `OnceHandBack`                                                                                                               |
| 取消、全拒与终结之后不呈现、不交回、不采纳                                 | 无                                                                                                                                                                                                                            | `NoAdoptAfterStop`                                                                                                           |
| 作废的卡片不记为答复，不伪造人的答案                                       | 无                                                                                                                                                                                                                            | `NoAnswerAfterInvalidate`、`NoFabricatedAnswer`                                                                              |
| 终结或全拒之后，关闭的卡片责任不留活的卡片                                 | 无                                                                                                                                                                                                                            | `ClosedLeavesNoLiveCard`、`StopSettles`                                                                                      |
| 恢复不回退持久进度                                                         | 无                                                                                                                                                                                                                            | `RecoveryMonotone`                                                                                                           |

### 规模上限

| 配置                                                              | 链（Passage）数 | 每轮卡片数 | 每链轮数 | 崩溃 | 丢回执 | 取消   | 全拒   |
| ----------------------------------------------------------------- | --------------- | ---------- | -------- | ---- | ------ | ------ | ------ |
| `cardrounds-safety`、`cardrounds-settle`、全部 `reach` 与安全负控 | 2               | 2          | 2        | 1    | 1      | 允许   | 允许   |
| `cardrounds-safety-wide`                                          | 2               | 2          | 2        | 2    | 2      | 允许   | 允许   |
| `cardrounds-progress`、`cardrounds-bad-noresume`                  | 2               | 2          | 2        | 1    | 1      | 不允许 | 不允许 |

一个执行只有一个动作批。每条链只有一个出卡的扩展调用：后继扩展的出卡与原扩展回放后的再出卡都表达为同一 Passage 的下一轮。“丢回执”是 present 或 invalidate 的回执丢失，两者共用一个上限。回执丢失时，提供者可能已创建卡片，可能还有一个在途的请求，也可能什么都没有。上限之外的行为没有被检查，例如三条链、三轮、一轮三张卡片。

### 状态对应

| 模型变量                              | 对应的事实                                                                                                                                                                                                                |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ps`                                  | `PassageProgress`：requested、asked、resolved、applied。idle 表示该链的扩展调用尚未开始                                                                                                                                   |
| `rs`                                  | 每轮的 `CardRoundProgress`：requested、presented、answered、processed、present-failed（模型记作 failed）                                                                                                                  |
| `askOf`                               | 一轮呈现的是哪一个 ask 结论。正确的 Agent 每个 ask 开一轮                                                                                                                                                                 |
| `jr`                                  | `PassageCard.response`：Agent 已保存的答复，或 invalidated                                                                                                                                                                |
| `closed`                              | 终结或全拒之后，这一轮的卡片责任已关闭（作废已记录、not-presented 已排除，或全部卡片已有答复）                                                                                                                            |
| `created`、`wire`、`pr`               | DecisionCards 一侧：本轮卡片已创建；一个在途的 present 请求仍可能迟到创建卡片；每张卡片的 pending、answered、invalidated                                                                                                  |
| `online`、`inflight`、`known`、`slot` | 协调进程的内存状态：进程在运行；进行中的扩展调用（fresh，或交回第 r 轮的 replay）；本进程是否知道本轮没有发出过 present（fresh）、结果未知（unknown）或已被 lookup 排除（excluded）；本执行是否占用执行名额。崩溃清除它们 |
| `cancelled`、`denied`、`ended`        | 取消已生效；本批为全拒；执行已终结                                                                                                                                                                                        |
| `handbacks`、`found`                  | 幽灵变量：消费过第 r 轮答复的已提交结果数；崩溃后 lookup 找到了未记录的卡片。动作只为限定状态空间读 `handbacks`                                                                                                           |
| `barrierOk`、`handOk`、`adoptOk`      | 步骤监视器。违反发生的那一步变为 FALSE，之后保持                                                                                                                                                                          |

### 动作、条款与代码落点

官方准入的卡片轮次已实现：链的状态推进在 `packages/agent/agent/src/loop/passages.ts`（一个模型动作一个函数，定义域以外不改任何东西），准入一侧的映射在 `packages/agent/agent/src/loop/admission-chain.ts`，节点在 `packages/agent/agent/src/loop/coordinator.ts` 的 A0 与 A1。扩展位置的 X 子图没有实现，那里的链将来用同一组函数。关闭卡片轮次（取消、终结、全拒时作废）没有实现，表中标明。提供者在 `apps/harness-server/src/rows/agent-cards/`。

| 模型动作                                    | 条款                                                                                              | 代码落点                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `StartInvoke`、`FinishInvoke`、`Abort`      | “扩展、卡片与材料”前三条；作者协议“调用协议”的处置表与采纳优先级第一条；Loop 算法页 X1 至 X3      | 官方准入：A0 调 `admit`（`packages/agent/agent/src/loop/tools.ts` 的 `admitToolAction`），回答经 `admission-chain.ts` 的 `afterAdmission` 落账：要人决定时 `openRound`，最终结论时 `resolve`。准入是可重入的查询，链只在第一次要人决定时入台账，不先存 requested 的 Passage。扩展位置的 X 子图未实现                                  |
| `PresentOk`、`PresentLost`、`PresentFailed` | “扩展、卡片与材料”的 round 一段；“整批判断屏障与动作准入”第 3、11 条；Loop 算法页 X4 与 A1        | A1 的 `presentRounds` 与 `roundCards`（`coordinator.ts`）：本进程存下的轮直接 `present`，结果不明转 `lookup`；确定失败经 `afterPresentRefused` 记 present-failed 并拒绝该动作。提供者在 `apps/harness-server/src/rows/agent-cards/provider.ts`                                                                                        |
| `LookupPresented`、`LookupNotPresented`     | “扩展、卡片与材料”的 lookup 一段；作者协议“结构换代与未完成判断”第 4 行；终态后卡片规则第 1、2 条 | `roundCards`（`coordinator.ts`）：不是本进程存下的 requested 轮一律先 `lookup`；not-presented 之后才按同一请求再呈现；不明或不可用时按依赖等待。终态后的 `card-lookup` 续接未实现                                                                                                                                                     |
| `NewRoundForUnknown`                        | 只在负控 `newround` 中启用                                                                        | 无，这是被禁止的做法                                                                                                                                                                                                                                                                                                                  |
| `Deliver`、`Answer`                         | 提供者与人的行动，提供者按原卡请求去重                                                            | 不在 Agent 内。人的答复归 HITL                                                                                                                                                                                                                                                                                                        |
| `ReadCard`                                  | “扩展、卡片与材料”的 read 五类结果；第 6、11 条                                                   | A1 的 `readCards`（`coordinator.ts`）与 `passages.ts` 的 `recordReply`：答复只存一次，pending 不落账，invalidated 记为 invalidated 不算答复                                                                                                                                                                                           |
| `StartHandBack`、`FinishHandBack`           | “扩展、卡片与材料”的 replay 与多轮一段；第 2、5、6 条；作者协议“结构换代与未完成判断”第 3 行      | A0：`handBackOf` 取答齐一轮的答复，`withChosenRewrite` 处理卡片绑定的改写，再调 `admit`；再要一轮时 `openRound`，重复已答的卡时以拒绝结论 `resolve`（`admission-chain.ts`）。准入一侧对 `decision` 的解释在 `apps/harness-server/src/rows/authorization/action-admission.ts`，现在对 `decision !== null` 答 unavailable，不归 Agent   |
| `BarrierOpen`                               | 第 4 条                                                                                           | A1（`coordinator.ts`）：先让需要判断的链回 A0，再呈现、读卡；每个动作都有最终判断后才写 open 或 all-denied，并把这批的链记为 applied。判别在 `passages.ts` 的 `needOf` 与 `mayPresent`                                                                                                                                                |
| `Cancel`、`End`                             | 第 10 条；“取消判断与路线”；系统页“循环守卫与终态扩展”                                            | `End` 抽象 tryFinish，由 [Finishing.tla](models/Finishing.tla) 检查。终结责任 `card-round` 在 `src/finishing.ts`                                                                                                                                                                                                                      |
| `InvalidateRound`、`CloseRound`             | 第 2 条（全拒时作废已呈现、尚无答复的卡片）；终态后卡片规则第 3 至 5 条                           | 未实现。全拒时还有已出未答的轮次、读到被作废的卡，A0 与 A1 答 unsupported-path；终结时还有未关闭的轮次，R0 同样答 unsupported-path。关闭一轮要契约里有轮次的关闭状态，还要有终结后的对账，本发行的官方准入不要人决定，生产上走不到。Tool 的 Ask 卡在打断时的收场是另一条路径，已实现，模型见 human-intervention 的 `InterruptCascade` |
| `Crash`、`Recover`                          | “恢复与接管”；作者协议“结构换代与未完成判断”                                                      | `recoveryRoute`（`coordinator.ts`）：屏障为 closed 的批回 A1，由台账里已保存的进度决定下一步；准入链不走 X 节点。新协调器接手已存位置的公开入口尚未交付，整段重启没有端到端用例                                                                                                                                                       |

每个模型动作是一个原子步骤。实现中一个步骤内部的读取、核验与提交之间的交错没有被建模。

### 被假定的环境行为

- AgentJournal 的每次写入是一次原子提交。`FinishInvoke` 的 ask 把非最终 Conclusion 与新一轮 requested 一次提交。`FinishHandBack` 的最终结论把全部已答复的轮次一次记为 processed。
- 提供者按原卡请求去重。同一 round 的重复 present 返回原卡片。present 的确定失败（denied、conflict）也关闭该请求的在途副本，所以失败之后不会迟到创建卡片。这一条由 SPEC“卡片端口按原卡请求去重”推出，模型不检查它。
- lookup 的 not-presented 带排除证据，排除原创建与迟到创建。unknown 与 unavailable 不改变任何事实，模型不把它们表达为步骤。
- 人的答复与作废在提供者一侧同一排序。已成立的答复保留，作废之后不接受答复（HITL 的 `NoRevival`）。
- 扩展的回放是确定的：同一回放绑定得到同一输出。所以一次未知的回放重新调用之后，提交的仍是同一结果。注入能力的认回与 `replayInconsistent` 的锁存不在模型内。
- `End` 要求本进程没有进行中的扩展调用（signal 已中止它们）。`End` 只在取消之后发生。
- 活性配置假定弱公平：持续可用的 Agent 步骤与提供者步骤最终会执行。`Progress` 另外假定每张已呈现的卡片最终得到人的答复（`HumanFair`）。崩溃与丢回执有上限，所以最终不再发生。

### 性质与负控

| 性质                        | 种类             | 检查的内容                                                                              | 负控（故意的错误）                                                                                                     |
| --------------------------- | ---------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `OncePresent`               | 不变量           | 同一 Passage 的两个 round 不呈现同一个 ask 结论                                         | `bad-newround`：present 结果未知时开新 round 重发                                                                      |
| `BarrierBeforePresent`      | 不变量（监视器） | 每次 present 调用时，同批每条链都有最终 Conclusion，或最后一轮为 requested 或 presented | `bad-nobarrier`：present 不等屏障                                                                                      |
| `AllAnsweredBeforeHandBack` | 不变量（监视器） | 每次交回时，该轮每张卡片都已保存人的答复                                                | `bad-partial`：一张卡片有答复就记为 answered                                                                           |
| `OnceHandBack`              | 不变量           | 一轮的答复至多被一个已提交结果消费                                                      | `bad-rehandback`：崩溃后恢复把已有结果的一轮再交回一次                                                                 |
| `NoAdoptAfterStop`          | 不变量（监视器） | 取消、全拒或终结之后，没有 present、交回或采纳                                          | `bad-late`：交回不看取消与全拒                                                                                         |
| `NoAnswerAfterInvalidate`   | 不变量           | 提供者已作废的卡片不记为人的答复                                                        | `bad-invalidasanswer`：read 把 invalidated 读作答复                                                                    |
| `NoFabricatedAnswer`        | 不变量           | 保存的每个答复都是人给出的                                                              | `bad-timeout`：尚无答复的卡片读作答复（默认批准）                                                                      |
| `ClosedLeavesNoLiveCard`    | 不变量           | 关闭的卡片责任不留 pending 的卡片，也不留在途的 present 请求                            | `bad-noinvalidate`：终结之后已呈现的一轮不作废就关闭。`bad-asnone`：终结之后 requested 的一轮不 lookup，按“无卡片”关闭 |
| `BarrierBeforeApply`        | 不变量           | Loop 采纳本批时，每条链都有最终结论，每轮都是 processed 或 present-failed               | 无单独负控，等同 HITL 的 `SafeAdvance`                                                                                 |
| `WaitHoldsNoSlot`           | 不变量           | 执行名额只由进行中的调用占用                                                            | `bad-holdslot`：ask 之后不释放名额                                                                                     |
| `RecoveryMonotone`          | 动作性质         | 持久进度（Passage、每轮、已保存的答复与关闭）不回退                                     | `bad-rewind`：恢复把 presented 的一轮重建为 requested                                                                  |
| `Progress`                  | 活性             | 没有取消与全拒、人都答复时，每个 Passage 最终 applied                                   | `bad-noresume`：崩溃后恢复把已答复的一轮当作仍在等人                                                                   |
| `StopSettles`               | 活性             | 取消之后执行终结且全部卡片责任关闭；全拒之后全部卡片责任关闭                            | 无单独负控。`ClosedLeavesNoLiveCard` 的两个负控说明“关闭”不能由错误的处置取得                                          |
| `TypeOK`                    | 不变量           | 模型自身的取值范围                                                                      | 无                                                                                                                     |

七个 `reach` 配置是可达性见证，不是性质。每个见证写一条“从不发生”的路径，TLC 必须给出反例：第二轮之后本批被采纳；lookup 排除后同一请求再次呈现；崩溃后 lookup 找到未记录的卡片且本批被采纳；终结后一轮保留答复并作废其余卡片；先答复一轮，后一轮呈现失败；全拒在没有取消时作废卡片；在途请求迟到创建卡片，终结后被作废。它们说明安全正控不是因为这些路径不存在才通过。

### 未覆盖

- 判断的来源：准入的规则、扩展的输出校验、位置输出表、`replayInconsistent` 与 `controlUnavailable` 的锁存、新草稿与上一轮相同时不开新一轮的规则。
- 注入能力的操作认回与计费，扩展运行时与宿主的 `invocationUnresolved`。
- 参数改写与旧批准失效（第 7 条），附言的解释（第 11 条第一项），屏障打开之后的工具发起（第 8、9 条）。
- 一条链上多个扩展调用、多个动作批、多个执行与多租户。
- 部分创建：一轮内只创建了部分卡片时保持 unknown 的规则。模型中一轮的卡片一起创建。
- invalidate 的操作身份。模型只表达“丢回执后以同一操作重试，提供者认回”，不检查身份的派生。
- 执行挂接被取代与实例停用。模型只有崩溃与重启。
- 实现与模型的符合性。没有轨迹回放。

### 模型取的读法

下列各项的 SPEC 文字没有直接写明。模型取了表中的一种读法。

| 编号 | 问题                                                                                                            | 模型现状                                                                        | 影响                                                                                             |
| ---- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| CR-1 | 第 3 条的“合法等待”是否包括“最后一轮已答复、回放尚未返回”的链                                                   | 不包括。这样的链要等回放返回，其他链的新一轮才呈现                              | 决定 `BarrierBeforePresent` 的含义。若包括，回放进行中也能呈现别的链的卡片                       |
| CR-2 | 全拒（第 2 条）时，requested 且 present 结果未知的一轮怎样处置。第 2 条只写“尚未呈现的不再呈现”与“已呈现的作废” | 借用终态后卡片规则第 1、2 条：先 lookup，presented 则作废，not-presented 则关闭 | 不 lookup 就当作“尚未呈现”时，迟到创建或回执丢失的卡片一直是活的，见负控 `bad-asnone` 的同类反例 |
| CR-3 | 取消生效之后、执行终结之前，人对仍然有效的卡片给出的答复                                                        | 保存为事实，不交回，不采纳                                                      | 第 10 条与系统页“已有的答复保留”一致。人在终结之前仍能看到并回答这张卡片，这是产品可见的行为     |

## 配置的预期

正控搜索完成且没有反例。负控与见证只检查它应命中的那一条性质，安全负控与见证的范围是对应正控范围的子集，只多一个故意的错误或一条见证，所以命中的反例归因于它。探针只记录一条性质在一种不采用的读法下是否成立，不参与判定。

### Finishing.tla

| 配置                           | 种类 | 预期                                                           |
| ------------------------------ | ---- | -------------------------------------------------------------- |
| `valid`                        | 正控 | 无反例：八条安全性质与 `TypeOK`                                |
| `valid-cancel`                 | 正控 | 无反例                                                         |
| `valid-coordinated`            | 正控 | 无反例                                                         |
| `valid-keep-cancelled`         | 正控 | 无反例，取 `SupersedeStaleCancelled = FALSE`                   |
| `live`                         | 正控 | 无反例：`CancelSettles`，前提 `SupersedeStaleCancelled = TRUE` |
| `live-cancel`                  | 正控 | 同上                                                           |
| `bad-skip-pending`             | 负控 | `NoEndWithPending` 违反                                        |
| `bad-unknown-as-pending`       | 负控 | `UnknownNotBlockedOrEnded` 违反                                |
| `bad-ignore-cancel`            | 负控 | `CancelFirst` 违反                                             |
| `bad-stale-intent`             | 负控 | `NoEndOutsideSettling` 违反                                    |
| `bad-stale-judgment`           | 负控 | `NoStaleJudgment` 违反                                         |
| `bad-rh-moves-pointer`         | 负控 | `PointerByJa` 违反                                             |
| `bad-release-before-custody`   | 负控 | `OneCustodian` 违反                                            |
| `bad-release-while-issued`     | 负控 | `OneCustodian` 违反                                            |
| `bad-recheck-before-recognize` | 负控 | `ReplayOriginal` 违反                                          |
| `bad-new-run-blocks-cancel`    | 负控 | 时序性质 `CancelSettles` 违反                                  |
| `probe-keep-cancelled`         | 探针 | 记录：`CancelSettles` 在 FALSE 下不成立                        |

轨迹配置 `trace-ordinary`、`trace-complete`、`trace-cancelled` 用模拟导出符合轨迹，`trace-bad-skip-pending`、`trace-bad-unknown-as-pending`、`trace-bad-recheck-before-recognize` 求最短违规轨迹；导出的轨迹在 `models/finishing-traces.json`，回放驱动内嵌同一份内容。

### CardRounds.tla

| 配置                                 | 种类 | 预期                              |
| ------------------------------------ | ---- | --------------------------------- |
| `cardrounds-safety`                  | 正控 | 无反例                            |
| `cardrounds-safety-wide`             | 正控 | 无反例                            |
| `cardrounds-progress`                | 正控 | 无反例                            |
| `cardrounds-settle`                  | 正控 | 无反例                            |
| `cardrounds-reach-two-rounds`        | 见证 | `NeverTwoRoundsApplied` 违反      |
| `cardrounds-reach-exclusion`         | 见证 | `NeverPresentAfterExclusion` 违反 |
| `cardrounds-reach-lookup`            | 见证 | `NeverLookupAfterCrash` 违反      |
| `cardrounds-reach-mixed`             | 见证 | `NeverMixedSettlement` 违反       |
| `cardrounds-reach-fail-after-answer` | 见证 | `NeverFailAfterAnswer` 违反       |
| `cardrounds-reach-denied`            | 见证 | `NeverDeniedInvalidation` 违反    |
| `cardrounds-reach-late-creation`     | 见证 | `NeverLateCreationSettled` 违反   |
| `cardrounds-bad-nobarrier`           | 负控 | `BarrierBeforePresent` 违反       |
| `cardrounds-bad-newround`            | 负控 | `OncePresent` 违反                |
| `cardrounds-bad-noinvalidate`        | 负控 | `ClosedLeavesNoLiveCard` 违反     |
| `cardrounds-bad-asnone`              | 负控 | `ClosedLeavesNoLiveCard` 违反     |
| `cardrounds-bad-rehandback`          | 负控 | `OnceHandBack` 违反               |
| `cardrounds-bad-partial`             | 负控 | `AllAnsweredBeforeHandBack` 违反  |
| `cardrounds-bad-late`                | 负控 | `NoAdoptAfterStop` 违反           |
| `cardrounds-bad-invalidasanswer`     | 负控 | `NoAnswerAfterInvalidate` 违反    |
| `cardrounds-bad-timeout`             | 负控 | `NoFabricatedAnswer` 违反         |
| `cardrounds-bad-holdslot`            | 负控 | `WaitHoldsNoSlot` 违反            |
| `cardrounds-bad-rewind`              | 负控 | `RecoveryMonotone` 违反           |
| `cardrounds-bad-noresume`            | 负控 | 时序性质 `Progress` 违反          |
