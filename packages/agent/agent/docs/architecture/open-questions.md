# Agent 技术设计闭合与验证责任

本页区分已明确的 Agent 自有设计、外部集成前提和待实施验证。问题 ID 供引用。各项的设计结论写在公开契约与内部机制，不以本页替代规范。这些设计结论已由[技术接受与产品采用决定](https://github.com/nemori-ai/omne-harness-lite/issues/384#issuecomment-6258475204)接受。设计接受不表示运行实现、提供者或完整产品阶段已获接受。

<a id="agent-m01"></a>
## AGENT-M01 step 切分与连续回复否决计数

Agent 自有设计已明确。step 从一次主请求准备开始；主回复拒收后的新调用建立新 step/action/call。压缩、扩展内部调用及 Model 内部 retry 不另开主 step。原始主回复准入事实按 call/resultVersion 去重，随接续共同提交。连续与累计否决由有覆盖范围的事实投影产生，恢复、压缩和新输入不清零。

精确形状归[主回复准入契约](../../../agent-contract/docs/public-api/README.md#身份原位置与纯求值)，规则与恢复归[Step 与历史](mechanisms.md#step-与历史)和[事实投影](mechanisms.md#事实投影与长期读取)。本域仍负责循环守卫的原事实依据，不规定统一次数上限或把否决计数等同于守卫阶梯。

待完成的是实现及验证，须覆盖同回复重复提交、提交回执丢失、拒收后恢复、投影缺页及新输入不清零。外部协调者对推进者的映射归[外域依赖](#外部协调者怎样与-agent-共同受理输入和终结)，不是 Agent 的计数规则。

<a id="agent-m02"></a>
## AGENT-M02 扩展稳定调用、非确定输入与撤除后接续

Agent 自有设计采用精确版本接续。Passage 的有序操作台账覆盖 producer、read 和 cards，记录 requested/resolved/applied；原调用、读取捕获及卡片轮次都有稳定身份和未知查询。已经完成的决定直接复用。未完成经过继续使用原 implementation/schema，不自动迁移或让新版重判。

原解释器或材料不可用时，保留原等待与责任并报告具体缺项。新采用只影响尚未开始的经过。缺席可选扩展的跳过规则不能用于已有调用或卡片的活动经过。协议归[公开接缝](../../../agent-contract/docs/public-api/README.md#请求扩展和材料接缝)、[精确采用接续](mechanisms.md#扩展经过与精确采用接续)和[扩展规格](../../../agent-contract/docs/public-api/extensions.md#结构换代与未完成判断)。

待完成的是解释器解析、读取捕获、提供者及故障验证。原材料保存不授予当前资格；assembly 仍拥有合法构成与撤除，HITL 拥有卡片及有效决定，Model/Tool 拥有原执行。外部协调者的重装配及工作终局协调归[外域依赖](#外部协调者怎样与-agent-共同受理输入和终结)。这些外部责任未兑现时，对应系统组合仍不能宣称可运行。

<a id="agent-m03"></a>
## AGENT-M03 原子推进、可靠交接与长期读取机制

Agent 自有的条件提交、原操作去重、未知对账、结果责任、终态后观察及完整快照/投影协议已明确。精确行为归[Journal 契约](../../../agent-contract/docs/public-api/README.md#执行记录与调用方交接端口)，内部组织归[提交机制](mechanisms.md#执行槽与条件提交)和[事实投影与长期读取](mechanisms.md#事实投影与长期读取)。Agent 不将自己的幂等、资格检查或保管责任交给外部协调者代为定义。

外部协调者的输入受理与终结共同提交、推进映射与换代、日志与消费恢复，归[外域依赖](#外部协调者怎样与-agent-共同受理输入和终结)中的外部协调者条目。Agent 保留所需保证和装配拒绝条件，不宣称这些提供者已经形成完整实现。

待验证事务、实际发出围栏、崩溃/断电耐久、分页完整性、历史保留及负载尺度。选择具体数据库、线程或部署参数属于相应提供者，不能从设计推出统一吞吐、恢复时限或已满足性能目标。

<a id="agent-m04"></a>
## AGENT-M04 Journal 契约与节点表的出入

本项的剩余出入尚未闭合。下列各项已关闭，规则写在各自拥有者的正文中。

- M04-2 与 M04-6：依据 [#558 的阶段 1 决定](https://github.com/nemori-ai/omne-harness-lite/issues/558#issuecomment-6307768802)，ready 的 requestPreparation 构成最终请求记录，检查与退避时刻不持久化。恢复立即重读，进程内消费 reconciliationDelayMs，拒收退避恢复后重新计足。
- M04-5：按 [#558 修订稿](https://github.com/nemori-ai/omne-harness-lite/issues/558#issuecomment-6366444012)对现行条款的对账（及其[复核](https://github.com/nemori-ai/omne-harness-lite/issues/558#issuecomment-6366538839)），参加者声明只约束 `commit.caller`，不约束 `recordResult.transfer`。规则见公开接口页的[执行记录与调用方交接端口](../../../agent-contract/docs/public-api/README.md#执行记录与调用方交接端口)与 SPEC 的[提交与保管](../../../agent-contract/SPEC.md#提交与保管)。
- M04-7：按同一修订稿对现行条款的对账，`open` 与 `attach` 不追加事件，execution 的第一个事件由 open 之后首次产生事件的提交分配。规则见 SPEC 的[逐操作及输入分类](../../../agent-contract/SPEC.md#逐操作及输入分类)。
- M04-8：依据阶段 1 决定，`input.submit` 不追加事件，input-taken 只由 I0 固定输入批的那次提交追加。规则见同一节与节点表 I0。
- M04-9：按同一修订稿对现行条款的对账，逐操作表按 SPEC 的[提交参加者协议](../../../agent-contract/SPEC.md#提交参加者协议)列出 `commit` 与 `tryFinish` 的 unavailable，以及 `tryFinish` 的 unsupported；依据 [Q11](https://github.com/nemori-ai/omne-harness-lite/issues/558#issuecomment-6370175199) 第 5 条，对 ended execution 的新 `commit`、新 `detach` 与新 `tryFinish` 返回 terminal。规则见 SPEC 的[判定次序与失败映射](../../../agent-contract/SPEC.md#判定次序与失败映射)与[逐操作及输入分类](../../../agent-contract/SPEC.md#逐操作及输入分类)。
- M04-1：依据 [Q1/Q1b](https://github.com/nemori-ai/omne-harness-lite/issues/558#issuecomment-6368831820)，`control` 的受理事实及其 control 事件、`recordControl` 的每个新适用阶段事实及其 control 事件，与可查询的原操作结果在同一原子边界保存，并与 `tryFinish` 共用权威排序；合法 ended 之后只保存三种迟到的责任事实，不追加事件。`recordResult` 不追加 producer 事件，T1 的 producer 事件由第二步的条件提交承载。规则见 SPEC 的[六个阶段](../../../agent-contract/SPEC.md#六个阶段)与机制页的[提交点总表](mechanisms.md#提交点总表)。
- M04-3：依据 [Q2](https://github.com/nemori-ai/omne-harness-lite/issues/558#issuecomment-6369509929)，Journal 绑定以必填的 `capabilities.coordination` 声明 standalone 或 coordinated，工厂核对配置 `coordination` 严格相等并逐种比对 `jointCommits`；coordinated 绑定在 `open`、`attach`、`submit` 与 `tryFinish` 的同一次提交中完成协调核对。规则见 SPEC 的[提交参加者协议](../../../agent-contract/SPEC.md#提交参加者协议)与公开接口页的[执行记录与调用方交接端口](../../../agent-contract/docs/public-api/README.md#执行记录与调用方交接端口)。
- M04-4：依据 [Q3](https://github.com/nemori-ai/omne-harness-lite/issues/558#issuecomment-6369509929)，每次建立新 execution 事实的原子 mutation 分配恰好一个新 revision，只保存认回索引的认回不分配；逐操作的首次新事实、认回与无变化边界见 SPEC 的[执行修订](../../../agent-contract/SPEC.md#执行修订)。新操作认回的回执与保留依据 [Q13](https://github.com/nemori-ai/omne-harness-lite/issues/558#issuecomment-6369723218)，见 SPEC 的[原操作认回与恢复](../../../agent-contract/SPEC.md#原操作认回与恢复)。
- M04-10：依据 [Q6/Q7/Q14 的 C3E-FM](https://github.com/nemori-ai/omne-harness-lite/issues/558#issuecomment-6373930927) 第 6、7 条，消息准入分为准备记录操作 P、准入原操作 H（`MessageHandoff.prepare`）、应用操作 Ja（`commit` 带 `handoff.resolve` 或 `retire`）与保管记录操作 Rh（`recordHandoff`）。每个来源的真实历史在 Ja 同次提交；提供者声明了对应种类时 `caller` 为 message 或 context-transition，未声明时 `caller` 为 none，且 Journal 在工厂前固定的历史组合在同一事务兑现同样的核心历史义务，缺实际组合时工厂返回 unsupported。规则见 SPEC 的[消息准入](../../../agent-contract/SPEC.md#消息准入)与[请求准备与压缩](../../../agent-contract/SPEC.md#请求准备与压缩)第 7 条；节点表的 Q1、Q2、C3、T5 与提交点总表按此写。Rh 的写入契约依据 [P5E](https://github.com/nemori-ai/omne-harness-lite/issues/558#issuecomment-6375988640)，见 SPEC 的[准入结果保管](../../../agent-contract/SPEC.md#准入结果保管)。
- M04-12：依据同一 C3E-FM 第 8 条，H0 不是写入节点：它只读原 recorded 且 rejected 的结果、原来源请求与当前执行事实作纯路由，没有新 operation、决策帧、快照字段或事件；失败候选由 F1 条件提交写入，只保管由 O0 的 `recordHandoff` 承接。规则见 SPEC 的[消息准入](../../../agent-contract/SPEC.md#消息准入)的“H0 的路由”；节点表 H0 与提交点总表按此写。

其余未决如下。[#505](https://github.com/nemori-ai/omne-harness-lite/issues/505) 把每个写入节点的提交点对到 Journal 契约，结果写在[提交点与聚合边界](mechanisms.md#提交点与聚合边界)。下表登记契约与[节点表](loop-algorithm.md#节点表)不一致、或两者都没有写明的地方。提交点总表照写两边，不作选择。内存 Journal 替身、耐久后端与节点实施卡都不自行补定这些项。

| 编号 | 出入 | 拥有者 | 阻塞 |
| --- | --- | --- | --- |
| M04-11 | 节点表 E9 的“写什么”没有写暂停的责任释放阶段，SPEC 的六个阶段对暂停适用责任释放。[#730](https://github.com/nemori-ai/omne-harness-lite/issues/730#issuecomment-6443023419) 已采用暂停解除挂接与崩溃恢复协议，写回卡待建，[排在 M2 之后](https://github.com/nemori-ai/omne-harness-lite/issues/784#issuecomment-6497861221)。写回之前本项保持开放 | Loop 完整算法页 | E9 的实施卡补“何时提交” |

关闭条件是每一项由其拥有者裁定，并写回拥有该事实的正文：契约项写回 agent-contract 的 SPEC、公开接口页或源码类型，节点表项写回 Loop 完整算法页。写回之后，机制页同步更新下列位置：提交点与聚合边界一节删去对应的指向，[等待、唤醒与公平](mechanisms.md#等待唤醒与公平)与[恢复切点表](mechanisms.md#恢复切点表)中采用的进程内检查计时保持与上文 M04-2 与 M04-6 的关闭记录一致。两种 Journal 实现按裁定结果补同形测试。

<a id="journal-联合表达的具名缺口"></a>
## 待各拥有者闭合的具名缺口

本节不属于 AGENT-M04。下列缺口已有拥有者与关闭条件。U 编号是本页的稳定编号，不重排也不复用。每项阻塞什么，由该行的缺口与关闭条件说明。

| 编号 | 缺口 | 拥有者 | 关闭条件 |
| --- | --- | --- | --- |
| U-2 | 重试策略协调者（实现 Model 的 `ModelRetryPolicy`、托管调模型之后失败分支的链）、受信系统重试扩展与两者 manifest 安装的实现位置：manifest 必填完整的链与组件采用、能力声明、正有限的总预算与组件预算、可信时钟、持久记录及来源与资格适配，缺生产值或提供者未就绪时不可安装；语义已由 SPEC 的[作为 Model 调用方](../../../agent-contract/SPEC.md#作为-model-调用方)第 4 条与机制页的[扩展协议的边界](mechanisms.md#扩展协议的边界)固定，依据是 [Q8 采用](https://github.com/nemori-ai/omne-harness-lite/issues/558#issuecomment-6373457058)。另含扩展宿主在启动前持久登记原执行记录并按 execution 或 Passage 认回的实现位置 | Model 主干（协调者与重试决定对 Model 端口的对应，见下文[调模型之后的重试决定怎样对应 Model 的重试策略端口](#调模型之后的重试决定怎样对应-model-的重试策略端口)）；`ExtensionImplementations` 提供者与宿主的装配与资产拥有者，见下文[端口提供者缺口](#端口提供者缺口) | 拥有者给出实现位置与验证（协调者的持久存储、跨重启时钟、来源认证、启动撤回、发送围栏、迟到保管与跨进程故障），正文不预开包。关闭前 Agent 正文按正文语义实现 X5 归约，不含协调者与强制组件 |
| U-6 | Q14 与 C3E-FM 的外域配对：Request Context 的 decoder、CommittedCompaction 证明与 epoch 映射；Session 的参加查询桥与存储载荷 | Context（request-context-contract）与 Session | 各拥有者在自己的正文采用映射，Request Context 正文登记的“待 Agent 写回后重验”关闭 |
| U-7 | 真实提供者证据：coordinated 四操作的同提供者事务、控制事实的跨进程原子、多页快照同修订、认回与排除的保留、永久迟到围栏、宿主的耐久接收 | Journal 提供者与宿主的实现与验证 | 真实提供者以故障注入与重启验证取证；内存替身不证明这些性质 |
| U-8 | 两个分支。Tool 分支：无引用、无副作用的只读认回入口（[Tool 配对回复](https://github.com/nemori-ai/omne-harness-lite/issues/665#issuecomment-6373072576)）。Model 分支：重试策略协调者的采用与记录 authority 整体缺席时的收场（[MP1、MP2 的配对](https://github.com/nemori-ai/omne-harness-lite/issues/558#issuecomment-6373845600)） | Tool 分支：Tool 主干。Model 分支：Model 主干，[#683](https://github.com/nemori-ai/omne-harness-lite/issues/683) 的 M5 | Tool 分支：拥有者采用对应读取能力或明确该分支继续 unknown。在此之前正文按 unknown 处理，不以普通 invoke、lookup 的 not-accepted 或当前快照冒充原结果。Model 分支：#683 采用收场协议。在此之前按 SPEC 的“[作为 Model 调用方](../../../agent-contract/SPEC.md#作为-model-调用方)”第 4 项处理 |
| U-9 | 终结责任清单的 control 责任项：control 项的必需内容与控制受理时的保存义务已由 [#730 DD1](https://github.com/nemori-ai/omne-harness-lite/issues/558#issuecomment-6443041428) 修订，SPEC 的[终结责任清单](../../../agent-contract/SPEC.md#终结责任清单)只固定其余各项，control 项写为具名缺口 | Agent 契约（agent-contract SPEC），由 [#730](https://github.com/nemori-ai/omne-harness-lite/issues/730#issuecomment-6443023419) 的写回卡承接 | 写回卡把 control 项与控制受理的保存义务写回 SPEC。在此之前实现不能按某一种 control 内容声称已兑现清单联合 |
| U-11 | 没有活体 runtime 时 submit 的公开入口：SPEC 规定 submit 沿原 execution 的耐久视图受理，不要求活体 runtime、advance、grant、槽、resume 或 attach，并把它列为经恢复入口的执行记录操作，但 Cordis 服务键没有对应入口，Session 仍要求执行句柄。按 execution 取得读取视图的入口是另一项缺口，拥有者与关闭条件不同，见“[无活体 runtime 时怎样按 execution 取得执行视图](#无活体-runtime-时怎样按-execution-取得执行视图)” | Agent 运行时（#502）或宿主；Session 的 NP-03 随之放宽 | 公开入口与服务键落地，Session 正文取消“submit 仍需要执行句柄”的前提 |
| U-12 | 外部输入逻辑意图的最终撤回：外部 Ki 不因原实例失联、旧 grant 失效或一次撤权自动封闭 H，`MessageHandoff.exclude` 只覆盖内部请求的取消围栏；外部输入最终撤回的认定与封闭协议没有拥有者正文 | 原输入拥有者（会话路径为 Session，独立路径为调用方） | 原输入拥有者在自己的正文采用撤回协议，Agent 正文在“[输入内容与水位线](../../../agent-contract/SPEC.md#输入内容与水位线)”引用它。在此之前 H 保持原状态，入口只 lookup 与保管 |
| U-13 | 永久 excluded 的原 O 的受控重新受理：SPEC 要求提供者证明怎样区分新受理与旧迟到请求、怎样序列化查询与重试，现有决定没有给出这项证明 | Journal 提供者 | 提供者方案给出区分与排序证明并经验证。在此之前原 O 永久 excluded 后不自动复用或换号 |
| U-14 | 压缩提交之后“重签当前读取资格”的承担端口：SPEC 的[请求准备与压缩](../../../agent-contract/SPEC.md#请求准备与压缩)第 9 条、节点表 C4 与 SPEC 的[准入的恢复切点](../../../agent-contract/SPEC.md#准入的恢复切点)要求在原应用操作 Ja 认回 committed 之后先重签当前读取资格，再重读条件、模型与 Runtime Context。这句义务来自 Session 的 AD-03，Agent 契约没有指定由哪个端口承担，Loop 无从调用。本项与 U-6 配对 | Session 与 Context 的拥有者 | 拥有者指定承担这项重签的端口，Agent 正文引用该端口。在此之前 Loop 不能声称已完成重签 |
| U-16 | 工厂从 Journal 绑定的哪个成员读到历史组合登记：SPEC 的[真实历史的提交点](../../../agent-contract/SPEC.md#真实历史的提交点)要求工厂从可信的绑定构造结果核历史拥有者 Adoption、原准入记录 resolver、共享事务域身份与两个提交处理器，绑定上承载这份登记的成员没有公开形状 | Agent 契约（agent-contract 的公开类型） | 公开类型给出该成员的形状，工厂页引用它 |
| U-17 | 取消 control 未成立时 `MessageHandoff.exclude` 的返回：SPEC 的[内部 H 的排除与退役](../../../agent-contract/SPEC.md#内部-h-的排除与退役)只规定当前有效取消已成立时的调用与结果表，没有写明调用者在取消尚未成立时调用 exclude 得到哪一种失败 | Agent 契约（agent-contract 的 SPEC 与 `MessageHandoff` 的公开类型） | exclude 的结果联合写明该分支并落到公开类型。在此之前提供者不得在取消未成立时封闭 H，也不得返回 excluded |
| U-18 | 同一来源位置在旧 H 未定时另建 H 的失败映射：SPEC 的[消息准入](../../../agent-contract/SPEC.md#消息准入)规定同一来源位置在旧 H 未定时不能另建 H，`commit` 带 `handoff.prepare` 遇到这种情形返回哪一种失败没有写进逐操作表 | Agent 契约（agent-contract 的 SPEC 逐操作表与 `commit` 的公开类型） | 逐操作表的 commit 行与公开类型写明该失败映射。在此之前提供者拒绝该写入并保留原 H，不返回成功，失败种类由关闭时固定 |
| U-19 | 协调者的取消路线：协调者没有实现 F0 与 cancelled 候选的 F1，遇到时以未实现失败停止。`commitSettlement` 的六个变体已在契约、两份替身与一致性套件中实现，协调者还不调用它们。内存替身接受结论为 cancelled 的 F1 `commit`，测试用它构造旧的 cancelled 候选；节点表的 [F1](loop-algorithm.md#节点表) 规定 cancelled 候选经 establish-cancellation 建立 | Agent 运行时（[#502](https://github.com/nemori-ai/omne-harness-lite/issues/502) 阶段 5） | 协调者按节点表实现 F0 与 cancelled 候选的 F1 至 F3，测试经协调者的取消路线构造候选。在此之前 Agent 不能声称取消路线已实现 |
| U-20 | 候选 origin 的固定记录：SPEC 的[候选与路线](../../../agent-contract/SPEC.md#候选与路线)要求 origin 解析到提出该候选的那次求值的固定记录。求值本身没有耐久记录，协调者暂取快照的 `history` 作为最接近的固定记录。取消候选的 origin 与 conditions 同样取最接近的固定记录：两份内存 Journal 替身取控制的受理记录与 intent 来源 | Agent 契约与 Agent 运行时（[#502](https://github.com/nemori-ai/omne-harness-lite/issues/502)） | 拥有者给求值指定耐久的拥有者记录，或在 SPEC 写明 origin 可以指向的现有记录，协调者按此取值 |
| U-21 | author route 的 `plan` 与 `policy`：协调者建立的 author route 的 `plan` 为空，`policy` 取 `checkpoint.definition`，Journal 因此看不到落终态之前位置的声明。两份内存 Journal 替身建立 author route 时 `plan` 也都写死为空，一致性套件的 plan 断言在本项关闭之前只能比较两个空列表 | Agent 运行时（[#502](https://github.com/nemori-ai/omne-harness-lite/issues/502)） | 协调者在 F1 交出落终态之前位置的实际声明与采用，替身据此建立 author route，一致性套件的 plan 断言与一个非空声明对照 |
| U-22 | material 类的终结责任：内存替身的 prepareFinish 不产生 kind 为 material 的清单项，SPEC 的[终结责任清单](../../../agent-contract/SPEC.md#终结责任清单)规定了这一项 | Agent 的内存 Journal 替身 | 替身产生 material 项，一致性套件有对应用例 |
| U-23 | 迁移与关联登记的核对：SPEC 的[commitSettlement 的变体](../../../agent-contract/SPEC.md#commitsettlement-的变体)规定的三项核对在 Journal 一侧没有实现。第一，`priorExcluded` 原样复制，不核对它的排除链。第二，route 上存在未定的迁移请求时，Journal 不只恢复该请求。第三，新关联登记操作不符合稳定派生时，Journal 不返回 invalid（field 为 operation）。`MigrationRecord` 身份的稳定派生函数也还不存在，它归 agent 的 identities | Agent 契约与宿主，随 Agent 运行时（[#502](https://github.com/nemori-ai/omne-harness-lite/issues/502) 阶段 5） | 阶段 5 在 agent 的 identities 实现该派生函数，Journal 一侧实现这三项核对，一致性套件有对应的负例 |
| U-24 | 终结责任清单的 checkpoint 依据：SPEC 的[终结责任清单](../../../agent-contract/SPEC.md#终结责任清单)要求每份清单绑定原 checkpoint 及适用条件依据。两份内存 Journal 替身发行的 `FinishObligations.checkpoint` 由 Journal 自己生成，解析不到已存记录。同类的还有五处：清单项的 source 与 version 大多是替身自造的证据，load 读不回；只有 P、尚无准备结果的 pending H，其 lookup 续接引用自造的证据；会话日志替身的参加者事实在还没有提交时用自造的 `source/unread` 证据；card-lookup 续接引用的 passage 输入记录不承载 `{passage, round}` 这组参数；续接里的记录引用都用同一个泛化 schema，不是 SPEC 的[终结责任清单](../../../agent-contract/SPEC.md#终结责任清单)要求的原操作精确 schema | Agent 的内存 Journal 替身与 session-adapters 的内存 Journal 替身 | 两份替身的 checkpoint 依据、清单项证据与续接记录引用都解析到已存记录，并带原操作的精确 schema，一致性套件有对应用例 |
| U-25 | session-adapters 内存 Journal 中两处经公开端口不可达的防御分支。第一，[PA-01](../../../../session/session-contract/SPEC.md#pa-01) 取消收束情形的 SE16 条件由 Session reducer 保证，合法历史构造不出反例。该条件遇不变量破坏时抛出缺陷。第二，[PA-02](../../../../session/session-contract/SPEC.md#pa-02) 的「结论不是 cancelled」核对：Journal 在调用参加者之前已核对授权种类与 intent，参加者看到的结论必然等于候选结论。两处核对都保留。第三，[PA-08](../../../../session/session-contract/SPEC.md#pa-08) 第 3 项参加者对推进授权的「冲突」回答：SE26 cancelled 已使推进授权失效，Journal 按判定次序先返回 `stale-advance`，不调用参加者。差分变异在这些行上的存活体登记为等价变异体 | Session 适配器（session-adapters） | PA-02 的核对抽成可直接测试的纯函数并有用例，或参加者与 Journal 核心分开装配后该核对经公开端口可达并有用例。Session reducer 不再保证 SE16 条件时，该分支补用例 |
| U-26 | `OriginalMutationRequest` 的公开类型：SPEC 的[终结责任清单](../../../agent-contract/SPEC.md#终结责任清单)规定 operation 项保存原方法的固定完整语义请求，形状是按原方法判别的封闭联合。agent-contract 的源码还没有这个类型。operation 项的 `request` 是指向原请求记录的证据，记录内容按哪个类型解码没有定义；`original-operation-query` 的续接只带 execution 与 operation。同类的缺口还有三处：Rh 后继的 `RhSemanticRequest` 与 `sourceAttribution`、handoff-source-recovery 续接里「应用操作的完整请求」都没有公开类型，handoff-source-recovery 的 purpose 固定为 query，表达不出新的来源应用要用推进资格；`input-read`、`output-read-ack`、`terminal-observe` 等续接的参数不带 execution，依赖所属清单的 execution，是否算原公开操作的完整参数没有定论 | Agent 契约（agent-contract 的公开类型） | 公开类型按 SPEC 的变体表落地，operation 项、Rh 后继与对应续接引用它们，一致性套件有对应用例 |

<a id="agent-m05"></a>
## AGENT-M05 生产者的解除回执怎样进入 Journal

本项尚未闭合。拥有者是 Agent 契约与宿主拥有者，闭合放在 M2 之后的里程碑。

结果接收方保存生产者的交付后只返回 saved，见 SPEC 的[结果接收](../../../agent-contract/SPEC.md#结果接收)。saved 只证明保存，不证明生产者已经解除交付责任。生产者收到 saved 后自己解除：Model 沿专用 ACK operation 取得 ACK，见 SPEC 的[持久性与交付责任](../../../agent-contract/SPEC.md#持久性与交付责任)；Tool 宿主经 `releaseDelivery` 释放，见 Tool 契约的[结果推送与保存](../../../../tool/tool-contract/SPEC.md#结果推送与保存)。所以读取同一 Journal 的外部协调者不能从 Journal 得知解除是否已经成立。

| 生产者 | 现状 | 外部协调者一侧的登记名 |
| --- | --- | --- |
| Model | Journal 没有记录 Model ACK 的公开路径。Agent 不执行 Model 的 ACK，也不为此新增 ACK 回调、条目种类或端口 | MODEL-ACK-ARRIVAL |
| Tool | Tool 结果已采用推送路径，Tool 解除回执怎样进入 Journal 未定。SPEC 的[恢复与接管](../../../agent-contract/SPEC.md#恢复与接管)、[工具执行与结果承接](../../../agent-contract/SPEC.md#工具执行与结果承接)第 2 条，机制页的[交付责任解除的两条路径](mechanisms.md#交付责任解除的两条路径与保管者更替)，上下文页[交接清单](../../../agent-contract/docs/context.md#交接清单)第 3 项，对象模型页[对象与生命周期](../../../agent-contract/docs/object-model.md#对象与生命周期)表的 ResultResponsibility 行，本目录机制页[恢复切点表](mechanisms.md#恢复切点表)的「Tool 确认前后」行，以及 [README_ZH](../../README_ZH.md#临时做法) 与 [README](../../README.md#temporary-choices) 临时做法一节的 M04-5 条，仍按 recordResult 写 Tool 结果的保管与解除，与推送路径不一致 | JC-RELEASE-TOOL-PATH |

关闭条件是拥有者写明 Model 与 Tool 的解除回执怎样进入 Journal，并同步上表列出的 Agent 正文。

<a id="agent-m06"></a>
## AGENT-M06 Tool 交付的完整收场 schema

本项尚未闭合。拥有者是 Agent 契约与宿主拥有者，补采用放在里程碑 M2。

SPEC 的[结果接收](../../../agent-contract/SPEC.md#结果接收)第 11 条只为 Model 交付规定了 facts 材料分支与具名版本 schema。Tool 交付的完整收场材料（`terminal`、`actualTerminal`、`effect`）没有已采用的 schema，当前公开的 `ReceivedDelivery` 与 `Material.tool` 也不直接声明这三项。所以读取 Journal 的外部协调者不能从材料确定 Tool 调用已经收场，只能返回不可用并保留任务。外部协调者一侧的登记名是 [TOOL-SETTLEMENT-SCHEMA](../../../../../docs/architecture/runtime/application-assembly.md#tool-settlement-schema)。

关闭条件是拥有者为 Tool 交付采用完整收场 schema，并写回 SPEC 的结果接收第 11 条。

## 保留的专题边界

上下文压缩是 Agent Loop 的执行节点。Agent 协调节点进入、扩展前后位置、压缩模型调用、结果交接及继续推进；现有请求准备契约提供预算与转换依据。本页不重新划分压缩算法、范围选择及历史存储的更细责任，沿 Loop 专题继续讨论，不把整个压缩过程归到外域。

模型内部重试的策略请求与调度协议、流式在途内容的跨生产者耐久、以及部署规模证据，继续由各原拥有者及已有专题承接。三项自有设计闭合不扩大这些事项的接受或实现状态。

下面四项是 Agent 自己的装配设计缺口，不依赖外域。

### 无活体 runtime 时怎样按 execution 取得执行视图

宿主恢复入口的形状没有定义。无活体 runtime 时，按 execution 取得输入、控制和输出视图的入口，公开接口页只有 `AgentExecutionRecovery` 的四个操作，没有返回 `AgentExecutionHandle` 的操作。[Cordis 页](../../../agent-cordis-contract/docs/cordis.md#服务键与提供者)因此没有为这个入口定义键。关闭条件是公开接口页给出该入口的形状，Cordis 页再补对应的服务定义。无活体 runtime 时 submit 的公开入口是另一项缺口，拥有者与关闭条件不同，见 [U-11](#journal-联合表达的具名缺口)。

### 宿主怎样创建并持有实例的 AgentProvider

在 Cordis 装配中，宿主插件调用工厂，并持有返回的 `AgentProvider`，见本地宿主装配的“[装载](../../../agent-host-local/docs/cordis.md#装载)”。宿主的服务面 `AgentInstanceHost` 只有 reserve、publish、withdraw 和 directory。装配者请求宿主以某次预约创建实例的入口，以及装配者请求宿主停用实例的入口，都没有定义形状。关闭条件是本地宿主装配页给出这两个入口的形状和逐操作要素，Cordis 页再核对它们是否需要新的服务面。

### Cordis 装配中工厂的依赖从哪里来

宿主插件调用工厂时，十项静态必需依赖是宿主 inject 得到的同一批服务实例，`access` 与宿主、目录用的是同一个 `agentAccessCheck` 实例。六项局部必需依赖由宿主的阶段适配器提供。适配器实现工厂要求的纯端口，在阶段内按 Cordis 页的[取得方式](../../../agent-cordis-contract/docs/cordis.md#依赖与定义拥有者)取得真实提供者。`registration` 是宿主在 reserve 时创建的登记句柄。没有定义的部分是：阶段适配器怎样在创建时向工厂报告提供者是否在场，以及这份报告的形状。工厂的[依赖逐项分类](../public-api.md#依赖逐项分类)要求采用的定义所需的局部能力在创建时在场。关闭条件是本地宿主装配页给出阶段适配器的形状与在场报告的规则。

### 独立调用路径的最小装配由谁拥有

独立调用者在类型上只依赖 agent-contract 与 agent，不认识外部协调者。但装配上它要自备工厂表中的全部必需依赖，其中授权、Context、模型选择与消息准入等外域适配器都尚无提供者。没有任何页拥有“最小独立装配”：哪些提供者组成能运行一次独立 invoke 的最小集合，由谁提供默认实现。拥有者定为 agent-host-local。关闭条件是本地宿主装配页给出最小独立装配的提供者清单与候选发行行，或登记为由应用装配拥有。

下面两项是 Agent 自己的 Loop 行为缺口，拥有者是 agent-contract。

### at 判定失败之后扩展调用怎样接续

拥有者是 agent-contract。调模型之后的失败分支里，扩展的 `retry` 计划 `notBefore` 为 null 时，Model 重试决定的 `notBefore` 取该 Conclusion 的 `at`。Agent 把 `at` 交给重试策略协调者之前以 `parseInstant` 判定一次。判定失败时，Agent 不把这次重试交给协调者，按 SPEC 的“[时钟读取与等待](../../../agent-contract/SPEC.md#时钟读取与等待)”取时失败一条保留原准备与接续，见“[作为 Model 调用方](../../../agent-contract/SPEC.md#作为-model-调用方)”第 3 条。之后该扩展调用怎样接续没有定义：由哪一次推进再判定一次，再次失败时该扩展调用怎样结束，以及这段等待怎样被观察。关闭条件是 SPEC“作为 Model 调用方”第 3 条写出判定失败之后的接续路径，与“时钟读取与等待”和作者协议的[调用结果](../../../agent-contract/docs/public-api/extensions.md#调用协议)一致，并有验证资源覆盖。

### 工具未知的调用在哪一步被拒绝

拥有者是 agent-contract，`admit` 的输入牵涉授权。模型完整回复中 `tool_call` 的 `name` 非空但工具未知时，该调用结构合法，进入动作批，不被执行（SPEC 的“[整批判断屏障与动作准入](../../../agent-contract/SPEC.md#整批判断屏障与动作准入)”）。拒绝落在哪一步还没有确定。可能的落点有三个：官方准入之前按目录判定；在 `admit` 中判定，这时输入的定义采用没有值可填；交 Tool 受理，由 Tool 以 `rejected` 拒绝（该节第 8 条）。三种落点的证据与槽位不同。关闭条件：[#502](https://github.com/nemori-ai/omne-harness-lite/issues/502) 实现 I4 动作节点之前，agent-contract 的拥有者定下落点，需要时与授权一起定 `admit` 的输入。

## 外域依赖

本节登记 Agent 依赖、但不归 Agent 拥有的契约与专题。每条写拥有者、Agent 所需的保证、被阻塞的能力、Agent 一侧已经产出的边界和关闭条件。Agent 只写自己需要的保证，不替拥有者写内部实现。拥有者没有兑现时，对应的系统组合不具备相应保证，其余独立设计继续。

### 静态注入依赖是否改为使用点取得

K09 已关闭。本部署按 [F2 应用装配的插件树](../../../../../docs/architecture/runtime/application-assembly.md#插件树)裁定，将 Agent 宿主的十项必需依赖全部设为静态 inject。缺任一项时宿主停在 PENDING，不改为首次使用时才失败。[本地宿主页](../../../agent-host-local/docs/cordis.md#静态依赖)保持这项取得方式。

静态依赖换代仍可能使宿主全部在途 execution 失联，恢复资格和处置沿[本地宿主页的换代](../../../agent-host-local/docs/cordis.md#换代)。关闭此设计问题不表示完整宿主插件或换代验证已经实现。

### 输入内容的展开、脱敏与否决在哪里完成

| 项 | 内容 |
| --- | --- |
| 拥有者 | 输入受理方（外部协调者）一侧业务流程拓展点的拥有者，以及 slash-commands 产品负责人。依赖现文的页面是 [slash-commands 的关键流程](../../../../../docs/domains/slash-commands/key-flows.md)和[架构页](../../../../slash-command/docs/architecture.md) |
| Agent 所需保证 | 消息持久化归输入受理方，不归 Agent。对外部输入的展开、脱敏与否决挂在输入受理方的[业务流程拓展点](../../../../../.meta_harness/design/ubiquitous_language/terms/interaction-and-dispatch.md#ul-business-flow-extension-point--业务流程拓展点--business-flow-extension-point)上，在输入交给 Agent 的 invoke 或 submit 之前完成。Agent 只看到受理后的完整内容，不读取处理前的原文，也不为此提供 Loop 拓展点 |
| 阻塞的能力 | 斜杠命令的“落盘前脱敏与否决，拒绝可见”。现文把它挂在已移除的“消息落盘之前”扩展位置上 |
| Agent 侧已产出的边界 | 消息准入是 Agent 的非扩展规则，见 SPEC 的“[消息准入](../../../agent-contract/SPEC.md#消息准入)”。扩展位置只有九处，见[系统页的位置表](../../../../../docs/architecture/runtime/loop-extensions.md#扩展位置与干预力) |
| 关闭条件 | 输入受理方的拥有者定义消息持久化前后的业务流程拓展点，slash-commands 改写上述两页与产品页，把命令内容处理挂到这些拓展点上，不再以 Agent 的“消息落盘之前”位置为前提 |

### 外部协调者怎样与 Agent 共同受理输入和终结

| 项 | 内容 |
| --- | --- |
| 拥有者 | 外部协调者，它同时是 Journal 端口的实现方。会话路径上的系统关系见[会话与 Run](../../../../../docs/architecture/runtime/session-and-run.md) |
| Agent 所需保证 | 第一，实现方在自己的日志上实现 Agent 的 Journal 端口，并以 `capabilities.coordination` 为 coordinated 的绑定交给装配。Agent 的执行记录是这份日志里的条目，条目格式归 Agent。输入受理、挂接与终结与实现方自己的业务事实在同一次提交中成立，核对义务见 SPEC 的[提交参加者协议](../../../agent-contract/SPEC.md#提交参加者协议)。第二，协调者保存自己的业务关联与 Agent 的 execution、执行挂接和操作身份之间的映射。换推进者时用 resume 并带推进资格依据，接管仍在推进的 execution 时另有 takeover 资格。第三，协调者按 Agent 公开的读取形状读同一份日志里的 Agent 条目，不从事件流抄写第二份副本，也不另设已读游标。它自己的外发消息和外部交付的身份、幂等与回执归它自己。单独写入本地完成标志不能消除外部已成功、本地提交前崩溃的窗口，外部渠道没有查询或去重能力时，这类动作保留为未知，见[流式输出后的不可逆边界](mechanisms.md#流式输出后的不可逆边界)。Agent 只保证事件的四个层次与业务接受层的区分 |
| 阻塞的能力 | 外部协调者路径上的外部输入拒收（CAP-AG07）、完成与取消（CAP-AG08）、接续与交接（CAP-AG09）。无法兑现共同提交的组合，Agent 拒绝装配 |
| Agent 侧已产出的边界 | SPEC 的“[提交参加者协议](../../../agent-contract/SPEC.md#提交参加者协议)”“[恢复与接管](../../../agent-contract/SPEC.md#恢复与接管)”“[输入内容与水位线](../../../agent-contract/SPEC.md#输入内容与水位线)”和“[事件流与读取](../../../agent-contract/SPEC.md#事件流与读取)”。协调者一侧的前提见[消费与系统定位](../../../agent-contract/docs/context.md#独立消费与外部协调) |
| 关闭条件 | Agent 一侧的共同提交边界已由[技术接受与产品采用决定](https://github.com/nemori-ai/omne-harness-lite/issues/384#issuecomment-6258475204)接受。剩余两项：Agent 契约给出日志中 Agent 条目的公开读取形状；实现方给出 Journal 端口在其日志上的实现、参与者版本和原操作查询。实现方公开接口页中表示整批扩展位置的 `extension-batch` 字符串随九处位置更新。此前 Agent 不宣称该组合已经实现 |

### Runtime Context 的拉取时点怎样对应到执行开始和挂接建立

| 项 | 内容 |
| --- | --- |
| 拥有者 | Context。涉及[系统页](../../../../../docs/architecture/runtime/runtime-context.md)、[Runtime Context 的 RC-04](../../../../context/runtime-context-contract/SPEC.md#rc-04-读取时点观察与变化材料)和 [Context 的关键流程](../../../../context/docs/key-flows.md) |
| Agent 所需保证 | 读取时点已由[技术接受与产品采用决定](https://github.com/nemori-ai/omne-harness-lite/issues/384#issuecomment-6258475204)接受为“执行开始或挂接建立”，系统页与 Context 规格按此写回。Agent 在主请求准备、模型选择变化和压缩提交之后再次读取。full 还是 incremental 由 Context 决定。Request Context 已有有限多步的压缩计划，并在组五接收实际收件模型的选择结果（[RQ-02](../../../../context/request-context-contract/SPEC.md#rq-02-组装的前置输入)、[RQ-06](../../../../context/request-context-contract/SPEC.md#rq-06-压缩共同结果与保护边界)） |
| 阻塞的能力 | 上下文与模型（CAP-AG04）：Agent 一侧 `RequestPreparation` 端口到 Request Context 操作组的适配器尚未实现 |
| Agent 侧已产出的边界 | SPEC 的“[Runtime Context 的消费](../../../agent-contract/SPEC.md#runtime-context-的消费)”写明 Agent 的五个拉取时点，前两个与系统页的时点对应。适配器的现状见[实施差异](../../../agent-contract/verification/coverage.md#实施差异) |
| 关闭条件 | Agent 一侧实现 `RequestPreparation` 到 Request Context 操作组的适配器，字段对照按 [request-context-contract 的消费与系统定位](../../../../context/request-context-contract/docs/context.md)。读取时点的对应关系由系统页与 Agent 正文共同标明 |

### Tool、Skills、MCP 的可用性重算由谁在何时触发

| 项 | 内容 |
| --- | --- |
| 拥有者 | Tool 主干，以及 Skills 与 MCP 专题的拥有者。现文见 [Tool 契约](../../../../tool/tool-contract/SPEC.md#已知与可用的动态关系)、[Tool 系统页](../../../../../docs/architecture/runtime/tool-runtime.md)、[Skills 关键流程](../../../../skills/docs/key-flows.md)和 [MCP 架构页](../../../../mcp/docs/architecture.md) |
| Agent 所需保证 | Tool 契约、Tool 系统页与 MCP 架构页以采用点与执行挂接建立为重算时点。Skills 关键流程仍写“attempt 开始”。Agent 不触发重算，也不等重算完成才开始 execution |
| 阻塞的能力 | 不阻塞 Agent。只影响这些专题对时点的措辞 |
| Agent 侧已产出的边界 | 工具描述的来源由模型选择端口返回，见 SPEC 的“[模型选择](../../../agent-contract/SPEC.md#模型选择)”第 3 条。Agent 不重算工具可用性 |
| 关闭条件 | Skills 专题的拥有者把触发时点的措辞对应到采用点与执行挂接建立 |

### hooks 导入专题怎样映射用户提示提交和整批工具之后的事件

| 项 | 内容 |
| --- | --- |
| 拥有者 | hooks 导入专题的拥有者。现文见[方言表](../../../../../.meta_harness/design/architecture/hooks-import/verification/dialects.md) |
| Agent 所需保证 | 映射不使用已移除的“消息落盘之前”位置，也不要求整批范围提供否决。用户提示提交对应输入受理方在消息持久化之前的业务流程拓展点，不对应 Agent 的拓展点。整批工具之后的事件对应执行动作之后的整批范围，该范围只允许 observed、inject、stop、ask |
| 阻塞的能力 | 方言表中 UserPromptSubmit 与 PostToolBatch 两项的导入 |
| Agent 侧已产出的边界 | [位置输出表](../../../agent-contract/docs/public-api/extensions.md#位置输出表)和 SPEC 的“[消息准入](../../../agent-contract/SPEC.md#消息准入)” |
| 关闭条件 | hooks 导入专题改写方言表与场景，使这两项映射符合 Agent 的位置集合和输出表。另需该专题确认各方言能否携带回放绑定：不能携带的方言，其 `ask` 在 Agent 一侧按不合法输出处理，见作者协议的[调用协议](../../../agent-contract/docs/public-api/extensions.md#调用协议)。若主要方言都不能携带，Agent 重新评估由适配器代为消费答复的方案 |

### 首内容前的调用失败和在途展示内容的耐久由谁处置

| 项 | 内容 |
| --- | --- |
| 拥有者 | Model 主干与 Tool 主干 |
| Agent 所需保证 | 第一，首内容前整调用失败时，Model 把处置交给调用方的失败处置位置，不规定调用方的类型，这一位置已由[技术接受与产品采用决定](https://github.com/nemori-ai/omne-harness-lite/issues/384#issuecomment-6258475204)接受。Model 契约的[故障交接](../../../../model/model-contract/SPEC.md#故障交接)已写明交原消费位置，不再规定为 Run。Agent 一侧对应调模型之后位置（failure 维度）的重试结论和失败候选。第二，在途展示内容在生产者 runtime 失联后的耐久机制，由 Model 与 Tool 契约拥有，具名拥有者是 Model 契约的“[展示、诊断与实施证据](../../../../model/model-contract/SPEC.md#展示诊断与实施证据)”节，以及 Tool 契约的 [P11](../../../../tool/tool-contract/SPEC.md#p11-作者输出与等待原语) 与“[过程帧的观察契约](../../../../tool/tool-contract/SPEC.md#过程帧的观察契约)”。两处都自述没有验证断电耐久，Agent 一侧只写依赖与未解决状态，见[流式输出后的不可逆边界](mechanisms.md#流式输出后的不可逆边界) |
| 阻塞的能力 | 在途展示内容的跨 runtime 恢复。首内容前失败处置的 Model 契约写回前提已闭合，实现支持仍须验证 |
| Agent 侧已产出的边界 | [位置输出表](../../../agent-contract/docs/public-api/extensions.md#位置输出表)中调模型之后位置的 retry 输出。SPEC 的“[事件交付的四个层次](../../../agent-contract/SPEC.md#事件交付的四个层次)”区分耐久提交、出口接收、消费者处理和业务接受。Agent 正文只写依赖与未解决状态 |
| 关闭条件 | 首内容前的故障交接设计已闭合；Model 与 Tool 仍须给出在途展示内容的耐久机制并经验证 |

### 扩展发起工具调用的准入

| 项 | 内容 |
| --- | --- |
| 拥有者 | 授权领域与 Tool 主干 |
| Agent 所需保证 | 第一，授权领域对不属于任何动作批的调用方给出准入，含 need-decision 时的收场方式（[AU-04](../../../../identity/authorization/SPEC.md#au-04-当前准入与结果)）。第二，Tool 说明不带批决定的固定工具请求需要什么许可与准入证据才能受理，见 Tool 的[发起的完整前提](../../../../tool/tool-contract/SPEC.md#发起的完整前提) |
| 阻塞的能力 | 扩展经注入能力直接发起工具调用。现行作者协议不提供这项能力，扩展需要工具效果时经 `inject` 或 `ask` 影响主 Loop |
| Agent 侧已产出的边界 | 作者协议的[输入](../../../agent-contract/docs/public-api/extensions.md#输入)：能力集合与按来源收窄 |
| 关闭条件 | 两项保证都发布后，Agent 再决定是否把工具调用加入能力集合，并写明它与整批判断屏障的关系 |

### 调模型之后的重试决定怎样对应 Model 的重试策略端口

| 项 | 内容 |
| --- | --- |
| 拥有者 | Model 主干 |
| Agent 所需保证 | Model 以[重试策略端口](../../../../model/model-contract/docs/public-api.md#重试失联与恢复)拉取重试决定，并要求同一身份可认回、原位置可查询。这个端口由重试策略协调者实现，它是外部装配中消费 Agent 与 Model 公开契约的适配提供者，托管调模型之后失败分支的链，不是 Agent 的扩展调用本身。已采用的配对：`prepareRetry` 的 consumer 编码为 owner 等于协调者 adoption 的 owner、work 等于原 ModelCallId、position 等于原 DispatchId、purpose 为 `model-retry-policy`；Model 的受信适配按原 `position.policy` 解析协调者的 inspect 核验 decided 的来源；协调者的寿命归 Model 宿主或其独立持久依赖，原 Agent 退出不卸载它，Agent 恢复后在等待原调用的节点只等同一个调用；Model 迟到给出重试决定时，Agent 不以 Agent 侧的超时推断策略不可用。规则见 SPEC 的“[作为 Model 调用方](../../../agent-contract/SPEC.md#作为-model-调用方)”第 4 条，依据是 [MP1、MP2 的配对消费](https://github.com/nemori-ai/omne-harness-lite/issues/558#issuecomment-6373845600)与 [Model 一侧的约束](https://github.com/nemori-ai/omne-harness-lite/issues/669#issuecomment-6373671854)。`notBefore` 非 null 时是 `judgeExtensionOutput` 以 `parseInstant` 校验过的 `UtcInstantText`，Agent 原样交给重试策略协调者；为 null 时取胜出 Conclusion 的 `at`，`at` 是 `AgentClock.now` 的成功值，形式见 Agent SPEC 的“[时钟读取与等待](../../../agent-contract/SPEC.md#时钟读取与等待)”，Agent 交给协调者之前以 `parseInstant` 判定一次，见“作为 Model 调用方”第 3 条 |
| 阻塞的能力 | 首内容前失败的重试决定（CAP-AG08）在协调者实现落地前不可运行 |
| Agent 侧已产出的边界 | 作者协议的 `retry`、`stop` 输出与链归约规则（[输出](../../../agent-contract/docs/public-api/extensions.md#输出)、[位置输出表](../../../agent-contract/docs/public-api/extensions.md#位置输出表)）；SPEC“作为 Model 调用方”第 4 条；机制页的[扩展协议的边界](mechanisms.md#扩展协议的边界) |
| 关闭条件 | 协调者、强制组件与 manifest 安装的实现位置落地并经验证（U-2）。协调者的采用与记录 authority 整体缺席时的收场见 [U-8](#journal-联合表达的具名缺口)。`at` 判定失败之后的接续是 Agent 自己的开放问题，见“[at 判定失败之后扩展调用怎样接续](#at-判定失败之后扩展调用怎样接续)” |

### 命名读取与注入能力怎样对应需要声明

| 项 | 内容 |
| --- | --- |
| 拥有者 | 读面拥有者（授权的命名读取协议）与装配 |
| Agent 所需保证 | 三点。第一，装配凭需要声明的哪一项认出要注入的能力种类。第二，`NamedCapturedRead` 的 `schema` 与对应需要声明的 `schema` 是什么关系。第三，命名读取里“读不到”包含哪些读取结果。Agent 只按需要名交付与核对，不定义读取怎样产生 |
| 阻塞的能力 | 官方准入按需要名收到读取时“读不到必需需要”的完整判定，以及装配按 `schema` 核对注入物 |
| Agent 侧已产出的边界 | SPEC 的“[声明判断](../../../agent-contract/SPEC.md#声明判断)”的 `needs` 段与“[整批判断屏障与动作准入](../../../agent-contract/SPEC.md#整批判断屏障与动作准入)”第 2 条。`NamedCapturedRead` 的形状见公开接口页的[扩展、人工卡片与材料](../../../agent-contract/docs/public-api/README.md#扩展人工卡片与材料) |
| 关闭条件 | 读面拥有者写明命名读取协议里“读不到”的读取结果集合，以及读取的 `schema` 与需要声明的 `schema` 的对应关系。装配写明凭需要声明的哪一项认出能力种类。SPEC 的 `needs` 段改为引用这些规则 |

### 端口提供者缺口

下表登记 Agent 自己定义的端口所需的外域提供者。这些外域目前没有公开契约或提供者，Agent 只写自己需要的保证。

| 端口 | 拥有者 | Agent 所需保证 | 阻塞的能力 | Agent 侧已产出的边界 | 关闭条件 |
| --- | --- | --- | --- | --- | --- |
| AgentAccessCheck、ActionAdmission | 授权领域。公开入口是空导出，精确形状由其公开形状设计承接（[AU-09](../../../../identity/authorization/SPEC.md#au-09-阶段范围公开形状与维护)） | check 返回 allowed、denied、unavailable，unavailable 不放行。admit 返回 allow、deny、need-decision、unavailable 四类（[AU-04](../../../../identity/authorization/SPEC.md#au-04-当前准入与结果)）。allow 附准入证据，参数或依据变化时旧批准失效（[AU-05](../../../../identity/authorization/SPEC.md#au-05-人工决定参数改写与重新核验)） | 所有公开操作的主体资格核验。工具动作的发起 | SPEC 的“[主体资格核验](../../../agent-contract/SPEC.md#主体资格核验)”和“[整批判断屏障与动作准入](../../../agent-contract/SPEC.md#整批判断屏障与动作准入)”。Cordis 页的[核验调用位置](../../../agent-cordis-contract/docs/cordis.md#主体资格核验的调用位置) | 授权领域发布公开契约和提供者，Agent 的两个端口改为引用或适配该契约 |
| DecisionCards | 人在回路领域。公开入口是空导出，[Q-HI02](../../../../human-intervention/human-intervention/docs/internals.md#q-hi02-采用公开请求答复及原等待接口) 未定 | 按 passage、round 与完整请求身份集合呈现卡片并去重。按原卡片身份查唯一有效答复，五类结果：chosen、declined、remark、pending、invalidated。作废只作用于尚无答复的卡片（[INV-HI06](../../../../human-intervention/human-intervention/SPEC.md#inv-hi06-一张卡片只有一个有效人的处理)、[INV-HI07](../../../../human-intervention/human-intervention/SPEC.md#inv-hi07-答复和原等待可恢复一致且交接无空档)、[INV-HI10](../../../../human-intervention/human-intervention/SPEC.md#inv-hi10-批次只阻塞其原等待范围)、[INV-HI11](../../../../human-intervention/human-intervention/SPEC.md#inv-hi11-合法拒答拒绝与故障不混同)、[INV-HI14](../../../../human-intervention/human-intervention/SPEC.md#inv-hi14-未知保持原身份并只接续未完成责任)）。人有话说但没有给准驳时，read 返回 remark，带原话；原话由人在回路领域保存，Agent 不合成拒答或批准（INV-HI11），处置见 SPEC 的“[整批判断屏障与动作准入](../../../agent-contract/SPEC.md#整批判断屏障与动作准入)”第 11 条。确定生成有效卡片失败时，人在回路领域返回确定失败并给出真实原因，与保存确认未知分开，Agent 据此拒绝相关动作（[INV-HI04](../../../../human-intervention/human-intervention/SPEC.md#inv-hi04-授权决定仅在允许范围与真实资格内生效)、INV-HI14）。作者扩展的卡片 present 确定失败时，处置已由[技术接受与产品采用决定](https://github.com/nemori-ai/omne-harness-lite/issues/384#issuecomment-6258475204)接受：不论官方准入还是作者扩展，都以拒绝结束该扩展调用，不改按扩展声明的错误策略 `onError` 处置，见 SPEC 的“[整批判断屏障与动作准入](../../../agent-contract/SPEC.md#整批判断屏障与动作准入)”和扩展规格的“[不可用与报错](../../../agent-contract/docs/public-api/extensions.md#不可用与报错)” | 扩展的 ask 和需要人决定的动作准入 | SPEC 的“[卡片与准入端口的逐操作要素](../../../agent-contract/SPEC.md#卡片与准入端口的逐操作要素)” | 人在回路领域发布公开契约，Agent 端口改为引用或适配 |
| ModelSelection、ModelContextReader、RequestPreparation | Model 与设置的适配器、Context 的适配器 | select 返回可选档案和实际收件模型。read 返回模型可读块，full 或 incremental 由 Context 决定。prepare 与 derive 按有限压缩计划工作 | 主请求准备与压缩（CAP-AG04） | SPEC 的“[模型选择](../../../agent-contract/SPEC.md#模型选择)”“[Runtime Context 的消费](../../../agent-contract/SPEC.md#runtime-context-的消费)”和“[请求准备与压缩](../../../agent-contract/SPEC.md#请求准备与压缩)” | 各适配器存在，Context 一侧的压缩计划接缝缺口关闭 |
| AgentAdoptions、CurrentConditions、ExtensionImplementations、AgentMaterials、RegisteredReads | 装配与资产领域、协作设置、材料保管提供者、各具名读取协议的拥有者 | 只解析精确采用，不取最新版本。CurrentConditions 只投影当前推进要求与采用依据，不复制权限模式，不计算守卫，守卫由循环判断这一受信系统扩展计算并记为 checkpoint 的守卫事实。材料不只存在于 Agent 的内存中 | 定义采用、扩展经过、custody 路径、具名读取 | 公开接口页的[扩展、人工卡片与材料](../../../agent-contract/docs/public-api/README.md#扩展人工卡片与材料)和 SPEC 的[采用交接](../../../agent-contract/SPEC.md#采用交接) | 各提供者存在并通过各自的换代与恢复验证 |
| AgentJournal | 独立提供者由本域建立，带提交参加者的提供者是外部协调者的适配器。两类包都尚未建立 | 条件提交、原操作查询、可靠事件和围栏。声明能兑现的提交参加者 | 所有托管的 execution | SPEC 的“[托管协调与运行实例](../../../agent-contract/SPEC.md#托管协调与运行实例)”和“[提交参加者协议](../../../agent-contract/SPEC.md#提交参加者协议)” | 两类提供者包建立，并通过断电、围栏和共同提交的验证 |
| CancellationPolicy 与 CancellationPolicyInstallation | 治理（装配与资产领域）。安装记录由治理发行，Journal 提供者在受控装配入口取得 | 安装实际的 policy、inputSchema 与 implementation 四元组、legacyProtocols 的精确旧版本映射与 admission 的当前状态读取来源；判断实现只读求值、不取得 Model、Tool、消息准入或卡片写权限；治理版本可在迁移、判断、prepareFinish 与 tryFinish 的提交点核验 | cancelled 候选的终结（CAP-AG08 的取消部分）与旧取消记录的迁移。安装缺席时 commitSettlement 的候选、迁移与判断变体返回 unavailable | SPEC 的“[取消判断与路线](../../../agent-contract/SPEC.md#取消判断与路线)” | 治理发布安装记录与判断实现，并通过判据纯度、权限隔离与提交点核验的验证 |

## 已关闭的问题

下面三项已经关闭，保留标题供原链接定位。

<a id="u-15"></a>
### U-15 正文先于类型的写入与形状

原 U-15 列出的写入与形状已有源码类型。`commit` 的 `handoff` 带 prepare、resolve 或 retire，`recordHandoff`、`prepareFinish` 与 `commitSettlement` 在 [journal.ts](../../../agent-contract/src/journal.ts)。`MessageHandoff` 的 prepare、lookup 与 exclude 在 [passages.ts](../../../agent-contract/src/passages.ts)。取消判断与路线的形状在 [finishing.ts](../../../agent-contract/src/finishing.ts)，`FinishIntent` 与 `ExecutionSnapshot.settlement` 在 [execution.ts](../../../agent-contract/src/execution.ts)，`invocationUnresolved` 在 [extensions.ts](../../../agent-contract/src/extensions.ts)。Agent 的内存 Journal 替身与协调者按这些类型实现 F1 至 F3 的普通路径。实现中尚未兑现的部分登记为上文的 U-19 至 U-25。

### Model 与 Tool 的契约源码何时导出 Agent 引用的名称

model-contract 与 tool-contract 的根入口导出 Agent 引用的名称，agent-contract 的包清单声明这两个契约包的类型依赖。公开接口页开头的[依赖说明](../../../agent-contract/docs/public-api/README.md#身份原位置与纯求值)按实际导出写明 `M.*` 与 `T.*` 的来源。

### 目录登记的撤除方式怎样对应 IC-13

[IC-13](../../../../../docs/architecture/cordis-integration-conventions.md#ic-13) 采纳了 Agent 目录的三处写法：`register` 返回 `Reply<Registration>`，撤除函数由目录持有并与调用方 fiber 卸载共用同一个幂等删除，同一实例的后继登记在同一个本地动作内原子取代旧登记。Cordis 页的[符合性映射](../../../agent-cordis-contract/docs/cordis.md#符合性映射)不记偏离。四成员集成页的[生命周期与宿主](../../../../../docs/architecture/runtime/runtime-contract-integration.md#生命周期与宿主)写明后继登记按 Agent 的 SPEC 取代旧登记，[配置与插件树](../../../../../docs/architecture/runtime/runtime-contract-integration.md#配置与插件树)的候选发行行列出 `agent-instances`。目录实现的撤除行为由 `registration.spec.ts` 验证。
