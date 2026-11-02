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

探针不是证据的第五种。探针只记录一条性质在一种未采用的读法下是否成立，不参与通过判定。

## 规模上限

所有配置只建一个租户与一个 execution。常量的含义写在模型头部。

| 配置 | 范围（Scope） | 绑定 | H 数 | 输入数 | F1 数 | 崩溃 | 丢回执与挂起写入 | `SupersedeStaleCancelled` |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| valid | call、held | standalone | 1 | 2 | 2 | 1 | 1 | TRUE |
| valid-cancel | tool、card、legacy、held | standalone | 2 | 2 | 1 | 1 | 1 | TRUE |
| valid-coordinated | call | coordinated | 1 | 2 | 2 | 1 | 1 | TRUE |
| valid-keep-cancelled | tool、card、legacy、held | standalone | 2 | 2 | 1 | 1 | 1 | FALSE |
| live | call、newrun | coordinated | 1 | 2 | 1 | 1 | 1 | TRUE |
| live-cancel | tool、card、legacy、held | standalone | 1 | 2 | 1 | 0 | 1 | TRUE |

“输入数”含初始输入。“崩溃”每次都跟一次接管。“丢回执与挂起写入”共用一个上限：一次写入的回执丢失，或一次写入挂起未定，各占一次。取消控制最多一个。Model 调用、Tool 调用与卡片轮各最多一个。负控与轨迹配置使用相同或更小的上限，见各配置文件。

这些上限是为了让每次运行在本机 20 分钟预算内完成。上限之外的行为没有被检查。例如：两个以上的取消控制、两次以上的崩溃、一个 execution 有多个 Model 调用，都不在检查范围内。

回执丢失只对四种写入建模：tryFinish、prepareFinish、judge-cancellation 与 Model 结果的保管写入。下列写入没有回执丢失的状态：带 F1、F2、I0、P、Ja 或 retire 的 commit，establish-cancellation，migrate-cancellation，三个保管变体，recordHandoff，submit，control 与 recordControl。挂起写入（`Hold`）只表达“某个推进写入未定”，不表达它的重试答复。

安全配置使用 `VIEW View`：状态的指纹不含 `act` 与 `reply`。没有动作读取前一状态的 `act` 或 `reply`，监视器与 `PointerByJa` 只读取本步设置的值，所以这样合并状态不改变检查结果。活性配置不用 VIEW，改为 `Observe = FALSE`，令 `act` 与 `reply` 保持常量。

## 状态与事件对应

| 模型变量 | 对应的 SPEC 事实 |
| --- | --- |
| `status` | `ExecutionSnapshot.state` 的 advancing、settling、ended。reconciling 并入 advancing |
| `cand` | 当前候选 `settlement.candidate` 的结论，当前路线 `settlement.route` 的种类，author route 的 `beforeTerminal` 是否已设，候选的输入水位线，以及是否为旧协议留下的取消候选 |
| `list` | 已发行的终结责任清单 `finishObligations` 及其责任投影。`outOk` 表示发行之后没有事件延长输出区间 |
| `judg` | 当前判断记录 `settlement.currentJudgment` 的判定、首个阻塞类别与判断输入 |
| `ctl` | 取消控制的受理与 intent-established 阶段：accepted、unresolved、reached（模型记作 effective）。effective 同时表示必要撤权已成立，见“被假定的环境行为” |
| `acc`、`tk` | 已受理的输入数与 I0 已承接的输入数 |
| `part` | coordinated 绑定的 Session 参加者：已受理未交入的输入，或参加者先成立的终态 |
| `call`、`pcopy` | 一个调用的 effect intent、结果登记与保管，以及生产者手中的耐久副本。`call = "settled"` 抽象“Journal 一侧已耐久保管该结果”，不区分保管经哪条路径成立，见下段 |
| `produced` | 幽灵变量：结果已经产生。`Produce` 置位，此后不清除，任何动作都不读它。它只供 `OneCustodian` 判断结果是否存在 |
| `tool`、`card`、`legacyRet` | 三个保管变体各自合入的原责任：Tool 原 invoke 的关联、卡片轮的对账、旧作者调用的迟到返回 |
| `hist`、`pv`、`rh`、`ptr` | 每个内部 H 的 HandoffHistory、准入提供者的结论、是否经 Rh 保管，以及 `checkpoint.currentHandoff` |
| `fresh` | 协调者手中的快照是否为当前 revision。expected 过期由它表达 |
| `zombie`、`held`、`pend` | 被接管取代的旧挂接、挂起未定的推进写入（未定的 operation 项）、回执丢失待重试的写入 |
| `slot` | Session 的 Run 槽位：取消之后会话可以开新 Run |
| `endc`、`final` | 终态结论与终局清单各项的处置 |
| `act`、`reply` | 最近一步的动作与答复。只供监视器、`PointerByJa` 与轨迹导出使用 |

`call` 与 `pcopy` 的保管路径：SPEC 规定 Model 结果经“[接收共同提交](../SPEC.md#接收共同提交)”一次保存完整材料、条目和原消费责任，不走 recordResult 的 custody 路径（“[持久性与交付责任](../SPEC.md#持久性与交付责任)”，“[提交与保管](../SPEC.md#提交与保管)”）。Tool 结果走 recordResult 的 custody 或 processed 路径。模型的 `Custody` 动作把这两条路径抽象成同一个“Journal 取得保管”的步骤。`OneCustodian` 的结论不依赖选哪一条路径，但模型也不能区分两条路径各自的错误。回放把 `RecordNone` 与 `Custody` 映射到 recordResult，见“回放映射”。

## 责任闭包与处置的出处

`Present` 是模型中的责任闭包，`Disp` 是每项在候选结论 c 下的处置。`NoEndWithPending`（S1）与 `UnknownNotBlockedOrEnded`（S2）都以 `Disp` 为准。所以 `Disp` 的某个分支分错时，S1 与 S2 都检查不出来。下面两张表给出每一项与每一个分支的出处。没有出处的分支标为抽象或待裁决，并写明它对 S1、S2 的影响。

类别次序是 inputs、controls、operations、passages、custody，出处是“[条件终结](../SPEC.md#条件终结)”结果表的 blocked 行。

| `Present` 的项 | 出现条件 | SPEC 清单项的 kind 与类别 | 出处 |
| --- | --- | --- | --- |
| `<<"input", i>>` | 每个已受理的输入 | accepted-input，inputs | “[终结责任清单](../SPEC.md#终结责任清单)”的 kind 表 |
| `<<"control", 0>>` | 取消控制已受理 | control，controls | 同上。control 项的必需内容是开放问题 U-9 的缺口，模型只取它的类别（抽象） |
| `<<"call", 0>>` | Model 调用的 effect intent 已保存 | call，operations | 同上 |
| `<<"result", 0>>` | 结果已登记（recorded 或 settled） | result，custody | 同上 |
| `<<"tool", 0>>` | Tool 原 invoke 的返回未定 | call（Tool 的原 intent 键），operations | 同上，以及“[取消后的 Tool 原 invoke 恢复](../SPEC.md#取消后的-tool-原-invoke-恢复)” |
| `<<"card", 0>>` | 卡片轮的呈现未定 | card-round，passages | 同上 |
| `<<"legacy", 0>>` | 旧取消候选的作者调用仍在途 | passage，passages | 同上，以及“[迟到的作者调用返回](../SPEC.md#迟到的作者调用返回)” |
| `<<"h1", 0>>`、`<<"h2", 0>>` | 内部 H 的历史为 pending | handoff，operations | “终结责任清单”首段之后的 handoff 责任段 |
| `<<"operation", 0>>` | 一个推进写入挂起未定 | operation，operations | “终结责任清单”的 kind 表 |

| `Disp` 的分支 | 处置 | 出处或判定 | 对 S1、S2 的影响 |
| --- | --- | --- | --- |
| input，已被 I0 承接 | settled | “条件终结”的五类责任表 inputs 行：普通候选不越过待承接输入 | 无 |
| input，未承接，候选为 cancelled | held | inputs 行：取消候选保留所有 accepted input 及终局处置。SPEC 没有写这一处置是 held 还是 settled，取 held 是抽象 | held 不触发 S1、S2，所以这两种取法对两条性质相同 |
| input，未承接，普通候选 | pending | inputs 行，PendingReason 的 input-disposition | S1 依赖这一分支 |
| control，ctl 为 accepted 或 effective | settled | 普通候选：“[六个阶段](../SPEC.md#六个阶段)”写明取消仅 accepted 时普通完成可以先 ended。取消候选：五类责任表 controls 行要求取消与必要撤权已成立，模型的 effective 包含撤权（环境假定） | 无 |
| control，ctl 为 unresolved | pending | 待裁决 4。PendingReason 有 cancel-intent。另一方面，“六个阶段”写“未知单独标记”，“条件终结”结果表把未知映射为 unavailable | 若应为 unknown：S1 不变，S2 的含义改变，普通候选在此时应返回 unavailable，而模型返回 blocked-controls |
| call，issued | unknown | 五类责任表 operations 行：可能改变候选的未定操作先恢复，不把 unknown 当未发生。结果表的 unavailable 行 | S2 依赖这一分支 |
| call，recorded 或 settled | settled | call 项的“收场事实”已成立。结果的保管由 result 项单独追踪 | 无 |
| result，recorded | pending | 五类责任表 custody 行，PendingReason 的 result-custody | S1 依赖这一分支 |
| result，settled | settled | custody 行：已有耐久保管 | 无 |
| tool，unknown | unknown | “取消后的 Tool 原 invoke 恢复”：admission 未定若可能影响终结合法性，判断保持 unknown，tryFinish 为 unavailable | S2 依赖这一分支 |
| tool，held | held | 同节：已知 accepted 并有合法耐久接收者的调用可以作为 held 继续存在 | 无 |
| card，unknown | unknown | `ObligationDisposition` 的 unknown 分支：原事实不确定。旧记录迁移表的 asked 行：呈现未知时 lookup 原批 | S2 依赖这一分支 |
| card，held | held | “[commitSettlement 的变体](../SPEC.md#commitsettlement-的变体)”的 record-card-reconciliation 行 | 无 |
| legacy，inflight | unknown | “迟到的作者调用返回”：返回源不能验证时保持未定 | S2 依赖这一分支 |
| legacy，held | held | commitSettlement 变体表的 record-legacy-return 行 | 无 |
| h1、h2，候选为 complete | pending | handoff 责任段：complete 不以 retained 绕过仍适用的来源。PendingReason 的 handoff-history | S1 依赖这一分支 |
| h1、h2，候选为 failed 或 cancelled | held | handoff 责任段：合法的 failed 或 cancelled 最终同提交固定不发布处置与真实承接，才允许记为 held。模型不看 `pv` 与 `rh` 就记 held。同一段写明“H unknown 且可能改变终结合法性时……不能只填 held”。待裁决 5 | 模型允许在 `pv = "none"`、没有 exclude、也没有 Rh 时以 failed 或 cancelled 结束。若 SPEC 的这种情形应为 unknown，S2 检查不到它 |
| operation | unknown | 五类责任表 operations 行，结果表的 unavailable 行 | S2 依赖这一分支 |

`FinishCheck` 对 author route 上的 cancelled 候选返回 blocked-passages。这只发生在旧协议留下的取消候选迁移之前。出处是类比：“条件终结”规定 cancelled 候选的终态前判断是当前的判断记录，迁移之前没有判断记录。结果表“取消路线上判断记录确定缺失 → blocked，类别为 passages”一行字面上只适用于取消路线。这一分支是抽象。它只影响 S2 的 blocked 合取项，该合取项对这一情形接受 blocked-passages。

## tryFinish 的判定次序

tryFinish 的判定次序按 SPEC“[判定次序与失败映射](../SPEC.md#判定次序与失败映射)”与“条件终结”结果表建模。结果表没有固定两处先后，模型在这两处取两份内存 Journal 的次序。实现不是有权的依据，所以这两处都列为待裁决或已知选择：

1. author route 上，确定的待办与缺少的终态前证明先于未定项判定，结果为 blocked。没有确定待办时，未定项使结果为 unavailable。“条件终结”结果表的 blocked 行与 unavailable 行没有规定这两行的先后。这一处列为待裁决 2。
2. 取消路线上，判断记录缺失先于判据比较，判据不符为 changed，之后才看判定。“[取消路线上的 tryFinish](../SPEC.md#取消路线上的-tryfinish)”规定先核对判断记录的判据输入仍适用，这一处与它一致。

待裁决 2 的两种读法对 S2 的影响：

- 读法 blocked（模型现状）：S2 的 blocked 合取项只要求 blocked 的类别是一项确定的待办。它不要求同时没有未定项。在没有故意错误的模型中，TakeInputs → Effect → F1-complete → Prepare → TryFinish 在调用未定时返回 blocked-passages，S2 接受它。
- 读法 unavailable（“结果未知时不返回 blocked”的强读法）：S2 需要再加一个合取项“blocked 时没有未定项”。模型与两份内存 Journal 都要改。上面那条路径在这个读法下是违反，它也是违规轨迹 `unknown-as-pending` 的前缀。

## 抽象成一个动作的实现步骤

| 模型动作 | 实现中的步骤 |
| --- | --- |
| `TakeInputs` | `inputs` 读取批次，再以 I0 的 `commit` 保存 input-taken 事件。它使 execution 离开 settling |
| `F1(c)` | 带 `finish` 的 settling `commit`：建立候选、author route 与 FinishIntent 投影 |
| `F2` | 不带 `finish` 的 settling `commit`。author route 没有终态前证明时，它设置证明。execution 以任何方式离开 settling 之后，它使 execution 带着同一候选回到 settling，见“S4 的含义与依据” |
| `Prepare` | `prepareFinish`：从权威闭包发行清单 |
| `TryFinish` | `tryFinish`：一次条件提交的全部判定 |
| `Establish`、`Migrate`、`Judge` | `commitSettlement` 的三个候选类变体。`Judge` 包括 Journal 构造判断输入、调用已安装的取消政策并保存判断记录 |
| `RecordToolAssociation`、`RecordCardReconciliation`、`RecordLegacyReturn` | `commitSettlement` 的三个保管类变体，包括经受信宿主读取适配核验原记录 |
| `P(h)`、`JaResolve(h)`、`JaRetire(h)` | 带 `handoff.prepare`、`handoff.resolve` 或 `handoff.retire` 的 `commit`。模型令 Ja 使 execution 离开 settling，这一选择列为待裁决 3 |
| `Rh(h)` | `recordHandoff`，包括经可信提供者绑定核验原结果 |
| `ProviderPrepare`、`Exclude` | `MessageHandoff.prepare` 与 `MessageHandoff.exclude` 在提供者一侧固定结论 |
| `Takeover` | 推进者崩溃，新实例以 `attach` 接管，execution 回到 reconciling（“[恢复与接管](../SPEC.md#恢复与接管)”）。旧挂接被取代，所以它挂起的推进写入此后不能再提交。模型因此在接管时清除挂起写入 |
| `Lose*`、`Retry`、`RetryCustody` | 一次写入已提交或未提交而回执丢失，调用方以同一 operation 与同一输入重试。`RetryCustody` 只在写入已生效，或生产者仍持有副本时可用 |

每个模型动作是一个原子步骤。实现中一个动作内部的读取、核验与提交之间的交错没有被建模。

## 被假定的环境行为

- Journal 的每次写入是一次权威原子提交。同一 execution 的写入全序。
- 取消控制的受理与意图阶段各自原子地保存阶段事实与 control 事件。
- 必要撤权（“六个阶段”第 3 项）并入 effective。coordinated 绑定下，这包括 Session reducer 把 SE16 写在取消批次里。模型不单独表达撤权尚未成立的状态。
- 生产者在得到 saved 回执之后才释放自己的副本。负控 `bad-release-before-custody` 与 `bad-release-while-issued` 各去掉这一条的一部分。
- 已安装的取消政策是 SPEC“[判断输入、判据与记录](../SPEC.md#判断输入判据与记录)”的判据第 3、4 条：有未定项时为 unknown，否则有确定待办时为 blocked，否则为 allowed。这两条是政策的义务，模型把它们写进 `Decision`，作为假定，不作为被检查的性质。
- `Exclude` 不要求有效取消已成立，也没有 unknown 结论。SPEC“[内部 H 的排除与退役](../SPEC.md#内部-h-的排除与退役)”要求当前有效取消已成立，并允许 unknown。valid-cancel 对 retire 与第二个 H 的覆盖依赖这一放宽，因为 `JaRetire` 与 `P` 都要求 `ctl # "effective"`。
- Session 参加者只有两种条件：已受理未交入的输入，以及参加者先成立的终态。它们的冲突以 changed 报告。参加者先成立终态时只允许取消路线收束。参加者的 ready、blocked、unknown 条件没有建模。
- 挂起写入（`held`）只表示当前挂接的推进写入。保管与观察写入不受 stale-advance 约束（“判定次序与失败映射”第 4 条与第 9 条），接管不裁定它们。模型没有表达挂起的保管或观察写入。
- 活性配置假定公平性：每个持续可用的恢复与收束步骤最终会执行（弱公平）。生产者最终返回结果，提供者最终给出准入结论，挂起的写入最终被裁定，保管变体最终合入原事实。没有这些假定时，永久未定的事实会让 `CancelSettles` 不成立，这是协议允许的结果，不是缺陷。

## 性质与 SPEC 条款

| 性质 | 种类 | 出处与模型实际检查的内容 |
| --- | --- | --- |
| `NoEndWithPending`（S1） | 不变量 | “条件终结”结果表的 blocked 行，“终结责任清单”。检查：ended 时终局清单没有 pending 处置。处置以 `Disp` 为准，见“责任闭包与处置的出处” |
| `UnknownNotBlockedOrEnded`（S2） | 不变量（含步骤监视器） | “条件终结”结果表的 unavailable 行（原操作未知 → unavailable），以及“取消路线上当前判断记录为 unknown → unavailable”一行。检查：tryFinish 不在有未定项时 ended，终局清单没有 unknown 处置，blocked 答复指向一项确定的待办或缺失的判断记录。监视器的第三个合取项（有未定项时判断为 unknown）求值的是动作本身使用的 `Decision`，正控下恒真。它只在负控中有证据力，见上节判据第 3、4 条的假定 |
| `CancelFirst`（S3） | 不变量 | “条件终结”：有效取消优先于普通完成或失败。“六个阶段”第 2 项 |
| `NoEndOutsideSettling`（S4） | 不变量（步骤监视器） | SPEC 没有对应条款，见“S4 的含义与依据”。检查：在 status 不是 settling 的那一步，tryFinish 不 ended |
| `NoStaleJudgment`（S5） | 不变量（步骤监视器） | “取消路线上的 tryFinish”：判断记录的判据投影须仍适用 |
| `PointerByJa`（S6） | 动作性质 | “[消息准入](../SPEC.md#消息准入)”：`currentHandoff` 由 P 设置，只由 Ja 的 resolve 或 retire 清除或后移 |
| `OneCustodian`（S7） | 不变量 | “持久性与交付责任”，“条件终结”五类责任表 custody 行：没有无人保管的窗口。检查：结果产生之后（幽灵变量 `produced`），每个状态恰有一个耐久保管者 |
| `ReplayOriginal`（S8） | 不变量（步骤监视器） | “判定次序与失败映射”第 2 条，“[原操作认回与恢复](../SPEC.md#原操作认回与恢复)”。检查范围见下文 |
| `CancelSettles`（L1） | 活性 | “[取消、退出与结构变更](../SPEC.md#取消退出与结构变更)”，“取消判断与路线”的取消路径次序。只在 `SupersedeStaleCancelled = TRUE` 前提下检查，见“取消收束” |
| `TypeOK` | 不变量 | 模型自身的取值范围 |

步骤监视器是布尔变量。它在违反发生的那一步变为 FALSE，之后保持 FALSE。这样跨步骤的约束可以作为不变量检查。

S4 与 S5 复述 `TryFinishReply` 中的守卫：status 不是 settling 时答 changed，判断输入与当前闭包不同时答 changed。所以它们的正控只说明模型中没有别的路径绕过这两个守卫。它们的证据力主要来自负控：去掉守卫后性质被违反。

S8 的正控按定义成立。没有故意错误时，`Retry` 把答复直接定义为原答复，所以 `okReplay` 恒真。S8 的证据只有两个来源：负控 `bad-recheck-before-recognize` 区分出一种错误的判定次序，以及轨迹回放中的违规轨迹 `recheck-before-recognize`。S8 只覆盖 tryFinish、prepareFinish 与 judge-cancellation 三种写入的重试。保管写入的重试（`RetryCustody`）不更新 `okReplay`。其余写入没有回执丢失的状态，见“规模上限”。

### S4 的含义与依据

S4 的出处不是 SPEC。SPEC“判定次序与失败映射”没有“not settling”这一项。“条件终结”结果表的 changed 行写的是“候选依据与实质前提已知变化”，模型不检查这一行：模型不比较候选的 checkpoint 或条件依据。S4 的来源是 M2 交接包的形式验证裁定（rulings-formal-20261030）第 2 条“执行不在 settling 时旧候选不能结束执行”，以及两份内存 Journal 的 tryFinish（[agent 的内存 Journal](../../agent/src/testing/journal.ts) 在 settling 之外答 changed）。裁定的动机是 M1.5 的“离开 settling 后旧候选仍能结束”。

S4 只覆盖这一种情形：tryFinish 在 status 不是 settling 的那一步不 ended。它不覆盖下面的模式。execution 离开 settling 之后，`F2` 使它带着同一候选回到 settling，之后同一候选可以 ended。离开的方式有四种：

| 离开 settling 的动作 | F2 复活同一候选的依据 |
| --- | --- |
| `Takeover` | “恢复与接管”：接管使 execution 回到 reconciling。Loop 算法页的“[恢复入口与回归点](../../agent/docs/architecture/loop-algorithm.md#恢复入口与回归点)”表的“执行状态 settling”行：已有候选时回 F2 或 F3，候选保持 |
| `TakeInputs`（I0 批次） | 没有依据。待裁决 3 |
| `JaResolve` | 没有依据。Ja 是否必须离开 settling 也没有依据。待裁决 3 |
| `JaRetire` | 同上 |

例：符合轨迹 `complete-2` 先固定候选（F1-complete），再发布一条消息并离开 settling（Ja-h1），再 F2，最后以同一候选 ended。另一条路径也可达：F1-complete（输入尚未承接）→ TakeInputs → F2 → Prepare → TryFinish ended。这两条路径在 SPEC 下是否合法，由待裁决 3 决定。

## 取消收束：已定读法乙，本波是已知限制

SPEC 写明三件事：业务前提真正变化时建立新候选并保存替代链接（“条件终结”）；新输入先成立时 tryFinish 返回 changed（“条件终结”结果表）；submit 先成功时终结必须重读并保留真实处置（“[输入内容与水位线](../SPEC.md#输入内容与水位线)”）。SPEC 没有写明：取消候选建立之后又受理新输入时，取消怎样收束。两种读法各与一处原文相抵：

- 读法甲：`establish-cancellation` 替代水位线已落后的取消候选。它超出“commitSettlement 的变体”表 establish-cancellation 行的“Journal 唯一允许的新事实”，那一列只允许取代 complete 或 failed 候选。
- 读法乙：取消候选不因后来的输入返回 changed，这些输入记为 held，取消收束之后再处理。五类责任表 inputs 行支持它（取消候选保留所有 accepted input 及终局处置）。它与结果表 changed 行的“含新输入先成立”相抵。

Reduce 已定读法乙（[#502 评论](https://github.com/nemori-ai/omne-harness-lite/issues/502#issuecomment-6562280172)）。理由是取消必须能收束，乙只延后新输入，不丢输入。本波没有实现乙：SPEC 尚未补写，两份内存 Journal 仍是另一种做法，模型也没有表达乙。这是已知限制，进波 2。波 2 的工作是补写 SPEC、对齐两份内存 Journal、在模型中表达乙，并让探针 `probe-keep-cancelled` 的反例转为通过。

两份内存 Journal 的做法是：`establish-cancellation` 不替代当前的取消候选，返回 invalid；候选的输入水位线落后时，tryFinish 返回 changed。两条合在一起，取消候选之后受理的一项输入会让取消一直不能收束。代码注释为前一条引用 rulings-S3B。本页没有找到这份记录可核对的采用依据。Reduce 的裁定已取代这一做法。

模型用常量 `SupersedeStaleCancelled` 表达这个选择。FALSE 是内存 Journal 的做法。TRUE 是读法甲。读法乙在模型中没有对应的取值。

活性的结论：两个活性正控取 TRUE，所以 `CancelSettles` 只在读法甲下、在所列规模上限内成立。TRUE 不是采用的读法。探针 `probe-keep-cancelled` 取 FALSE，TLC 给出反例，即在内存 Journal 的读法下 `CancelSettles` 不成立。采用的读法乙下活性没有被检查。探针的结果见 [formal-runs.md](formal-runs.md)。

安全的结论覆盖 FALSE。理由如下：

1. 两个取值只在 `Establish` 中有差别。当前候选是水位线落后的取消候选时，TRUE 建立新候选，FALSE 返回 invalid。
2. 返回 invalid 的那一步只改变 `act` 与 `reply`。它不改变 `View` 中的任何变量，监视器也不变，所以在 `View` 下它是一次停顿。
3. 其他动作的启用条件与效果都不读这个常量。
4. 所以取 FALSE 的每个行为删去这些停顿后，是取 TRUE 的一个行为，经过的 `View` 状态相同。八个不变量只读 `View` 中的变量。`PointerByJa` 只约束改变 `ptr` 的步，返回 invalid 的那一步不改变 `ptr`。

因此，取 TRUE 的安全正控在同一规模上限内的结论对 FALSE 也成立。配置 `valid-keep-cancelled` 用 valid-cancel 的范围取 FALSE，作为这一推理的机器核对。这一推理不覆盖读法乙，因为乙改变 tryFinish 的答复，不只是 `Establish`。

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
| `RecordNone`、`Custody` | `recordResult`，transfer 为 none 或夹具给出的 custody、processed。这是 Tool 结果的保管路径。Model 结果在 SPEC 中经接收共同提交保存，回放不检查那条路径 |
| `P-h1`、`Ja-h1` | 带 `handoff.prepare` 或 `handoff.resolve` 的 `commit`，挂接取当前挂接 |
| `Takeover`、`StaleWrite` | 夹具的 `takeover`，以及用被取代的挂接提交一次 `commit` |
| `Produce`、`Provider-prepared-h1` | 无 Journal 调用：生产者与准入提供者在 Journal 之外行动 |

协调者手中的快照对应模型的 `fresh`：`Load` 与自己成功的写入更新快照，其他写入方的写入、接管与重试不更新。tryFinish 返回 changed 或 blocked 时没有写入，快照不变。

每一步之后，驱动核对两件事：答复，以及 `load` 的投影（状态种类、当前候选的结论、当前路线的种类、`currentHandoff` 是否非空）。违规轨迹是三个负控（`skip-pending`、`unknown-as-pending`、`recheck-before-recognize`）在 `TraceSpec` 上的最短反例，它的最后一步是协议禁止的答复。选这三个，是因为它们的错误只改变最后一步的答复，前面各步与遵守协议的 Journal 相同。回放到遵守协议的 Journal 时，驱动必须在最后一步报告不一致。

下列步骤不回放，只由模型检查：

| 步骤 | 不回放的原因 |
| --- | --- |
| `Migrate`、`RecordLegacyReturn`、`RecordToolAssociation`、`RecordCardReconciliation` | 本波的回放驱动没有映射它们。夹具接口已有可选控制 `seedLegacyCandidate` 与 `hostRecord`，扩展驱动后可以回放 |
| `Rh`、`JaRetire`、第二个 H | 本波的回放驱动没有映射它们。`JaRetire` 与第二个 H 都要先经 `Exclude` |
| `Exclude`、`ProviderPrepare` 的 rejected | 提供者一侧的动作，没有 Journal 调用。prepared 只作为无调用的步骤出现在轨迹中 |
| `Hold`、`Decide` | 挂起写入在模型中是抽象的未定推进写入，没有对应的单一 Journal 调用 |
| `ParticipantAccept`、`Deliver`、`ParticipantTerminal` | 轨迹配置取 standalone 绑定（`Coordinated = FALSE`），回放驱动没有映射参加者的步骤 |
| `LoseCustody`、`RetryCustody` | 夹具的 `faultNext` 不支持 recordResult，回放不能注入保管写入的回执丢失 |
| `Release` | 生产者一侧的动作，没有 Journal 调用 |
| `NewRun` | Run 槽位属于 Session，没有 Journal 调用 |

## 未覆盖

- 多租户与跨租户拒绝、资格核验与撤权的细节、installation 的切换、迁移链的排除与后继。
- 一个 execution 中多个 Model 或 Tool 调用、多个卡片轮、多个取消控制、suspend 与 interrupt。
- Journal 写入内部的交错、跨进程提交、存储故障与耐久性。模型假定每次写入是原子提交。
- 终态后观察、确认进度、`reconcile` 与回复准入的已核实前缀。
- 协调者一侧的取消路线（F0 与 cancelled 的 F1）。AG-20 落地时扩展模型。
- 取消收束的读法乙，见“取消收束”。进波 2。
- 结果的 processed 路径。模型只有 custody 一条保管路径。
- Model 结果的接收共同提交与 Tool 结果的 recordResult 保管路径之间的差别。
- 参加者的 ready、blocked、unknown 条件，有效取消之前的 exclude 与 exclude 的 unknown 结论，撤权尚未成立的状态。见“被假定的环境行为”。
- author route 的终态前经过只是一个布尔量。清单在 F2 之后仍然有效，模型不强制“先 F2 后 prepareFinish”。轨迹 `ordinary-1` 先 Prepare 后 F2，而“条件终结”写普通路径的次序固定。模型只检查 tryFinish 在没有证明时不 ended，不检查调用方是否按次序调用。
- 回执丢失只对 tryFinish、prepareFinish、judge-cancellation 与保管写入建模，见“规模上限”。
- Journal 真件的回放。它在 W1-RUN-8 的接受阶段调用同一个驱动。

## 待 Agent 契约拥有者裁定

下列四项的 SPEC 文字不能决定模型应取哪种读法。模型取了其中一种，不自定为正确。裁决者是 Agent 契约拥有者。

| 编号 | 问题 | 模型现状 | 影响 |
| --- | --- | --- | --- |
| 2 | author route 上确定待办与未定项并存时，tryFinish 返回 blocked 还是 unavailable | blocked，取自两份内存 Journal | 决定 S2 的含义，见“tryFinish 的判定次序”。选 unavailable：改两份内存 Journal 与模型。选 blocked：收窄裁定里 S2 的措辞 |
| 3 | 普通候选在 execution 离开 settling（I0 批次或 Ja）之后，能否由不带 finish 的 settling commit 复活，还是必须重新 F1。Ja 是否必须离开 settling | 能复活，Ja 离开 settling | 决定 S4 的含义，见“S4 的含义与依据” |
| 4 | intent 阶段为 unresolved 的控制项怎样处置：pending（cancel-intent）还是 unknown | pending | 与开放问题 U-9 相关。决定 S2 在这一情形下的含义 |
| 5 | failed 或 cancelled 终结时，提供者尚无结论、也没有 exclude 的内部 H 能否记 held | held | handoff 责任段写明 H unknown 时不能只填 held。若这一情形应为 unknown，S2 检查不到它 |

编号沿用 AG-23 表达评审“范围外待裁决”的编号。第 1 项（取消收束）已由 Reduce 裁定，见“取消收束”。
