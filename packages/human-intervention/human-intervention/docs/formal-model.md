# HITL 函数全化、状态与证明义务

状态：HJ0 技术采用已于2026-11-06由用户验收。行为权威模型位于[verification](../verification/README.md)，本页解释数学对象、前提、命题和实现对应义务。有限模型检查不证明任意规模、真实SQL、运行时调度或物理耐久。

## 动态治理贡献的组合模型

共同协议归[治理贡献合同](../../../assets/docs/governance-contributions.md)，不由 HITL 接管设置或权限。GovernanceLifecycle 从已有持久配值和一次许可开始，检查贡献登记、精确释放、关闭、重装配、准备/提交、撤回、会话终局及消费的交错。两个贡献槽、两代、两个来源/相容性选择、三个请求范围构成有限实例。

DG1–DG6 分别由 CatalogCurrent、OtherContributionsPreserved/OldTokenFenced、ScopeBound、DurableCustody/ReceiptPreserved/NoRevival/ConsumptionPreserved/SessionTerminal、CurrentCommit、NoTransfer/DefinitionCompatible 守护。DG7 使用 CanReprepare 检查失效准备可以刷新，SettingRecoveryProgress 检查合法保存值最终采用，RecoveryProgress 检查合法许可最终消费。DG8 使用 GovernancePublication 的 AtomicPublication、ConflictRejected、ProhibitionPreserved、AbsentItemCannotBypass。ImmutableDefinition 仅检查单定义摘要不被冲突覆盖，不能代表完整发布。

一次消费另由 OnceOnly 守护。恢复性质以对应 Ready 条件持续成立及采用/消费弱公平为前提。缺提供者、撤权或会话终局不要求继续执行。人的答复不被施加公平假设。恢复准备不改原业务内容，原操作已提交则认回结果。

check-contributions.py 对两个租户、两个服务、两代、两个贡献槽及最多两个活跃租约枚举精确释放。独立的逐条成员关系谓词检查 scope、代际、兄弟隔离与重复释放。三个负控分别绕过scope、忽略generation、误删兄弟。它是抽象关系检查，不是实际注册表符合性测试。

GovernancePublication 使用两项声明的完整发布、一个有效/冲突候选及持久禁止事实。任一合法发布更新整份采用。冲突不产生新采用。删除项声明保留能力级禁止，实际求值仍服从它。该有限实例不替代真实多项目录或所有资产类别的规则证明。

该模型抽象 prepare 与原子 commit，准备记录冻结代际、采用贡献集合和修订。提交同时核验它们，不能实现成先读 revision 再分离写。模型保存业务值与权威回执的独立投影，删除持久值或重置消费次数会产生反例。它不证明持有删除的清除实现、全目录分页、秘密处理或任意版本迁移。

组合时，GovernanceLifecycle 的 Available/Current 对应 protocol 提交保护清单的 adoption 行。Permissions/Settings 的当前规则和资格仍须同时成立。HITL 答复持久化不要求原 runtime 在线，授权解释、配值提交和继续执行才按实际需要检查 adoption。定义缺席不能让已登记的主动禁止消失。原 AuthorityComposition 七轴证据保留，新采用轴由本模型补充，不能把历史七轴检查说成已验证八轴实现。


## 状态空间与偏函数

设T为租户，P为已核验主体，R为有限请求集合，C为卡片，W为原等待，D为不可变人的处理，O为操作身份。域对象保存值与引用，不保存线程或进程对象。

状态S由五个正交部分组成：卡片及其pending/decided/invalidated状态；原等待live/terminal及消费位置；决定与耐久待交接记录；原操作绑定和终态；当前资格保护向量与短期提交reservation。池是受资格约束的投影，不另有一个决定状态。许可、实际动作和通知有各自拥有者，不合成“done”布尔值。

自然偏函数如下，其定义域正是成功前提。

| 偏函数 | 成功定义域 | 成功值 |
| --- | --- | --- |
| register(origin,questions) | 可信租户、合法问题、稳定原等待及可靠准备已确认 | 唯一请求与卡片 |
| decide(S,card,reply) | 当前读/答资格、输入匹配、pending、原等待live、共同提交提供者可用 | 原卡片的不可变决定与原等待耐久inbox |
| deliver(S,decision) | 决定已共同提交，原绑定可认回，接收者有当前消费资格 | 原消费者接受或按终局superseded |
| resume(wait,decision) | 原位置已接手，工作未终局、围栏有效、批次齐备、参数/实现/授权/环境匹配 | 原继续动作；由原执行者拥有 |
| project(S,principal,query) | 当前披露资格、有效查询和预算 | 获准且具完整性标记的投影 |

## 全化与结果代数

令Input为全部有限输入字节，Limits为显式有效预算，Observation为外部提供者返回的成功、拒绝、故障、超时或未知观察。纯计划函数为：

`Plan : S × Command × Limits → PlannedEffect + Rejection`

边界全化为：

`Handle : Input × Access × Limits × Observation → Outcome`

Outcome为带标签的不交并：成功/已处理/已失效/冲突/拒绝/非法输入/预算不足/提供者不可用/提交未知。成功并不包含全部阶段完成。schema解析失败只进入invalid-input；提交回执丢失只进入unknown；原话不明准驳只进入原拥有者的guidance，不进入批准。协议进程崩溃可能完全无响应，Handle的终止保证仅针对进程仍在运行且预算调度有效的单次处理。

判定优先级：预算与形状→身份及当前披露资格→原操作绑定→对象当前状态→答复合法值与当前决定资格→计划→受保护提交。即使是重复操作也先做当前披露检查；不能通过查询旧成功回执泄漏秘密。存储内部采用身份依赖时不得把这份纯计划当作以后仍有效的授权。

全化不等于“每次都成功”或“人最终会答”。单次调用必须在预算内返回有限结果，人工请求可长期保持pending。读/查询的分页工作量有上界；等待人通过耐久状态和唤醒后重读表达，禁止在HTTP请求、SQL事务或可运行执行槽内无期限等待。

技术操作同键同摘要幂等；同键异摘要conflict。unknown沿原操作查询；not-committed需要已封口证据，不能由not-found推导。

## 安全命题与保护者

| ID | 命题 | 保护者及实现义务 | 当前模型 |
| --- | --- | --- | --- |
| H-S1 | 每张卡有效决定基数≤1 | 原等待协调者与卡片唯一约束同提交 | HumanDecision.UniqueDecision |
| H-S2 | 可消费决定必有耐久原等待关联 | 共同业务单元写入决定和inbox | HumanDecision.Custody |
| H-S3 | terminal先成立后，不发生新有效决定或继续 | 原等待终局与提交排序；原继续点重核 | HumanDecision.NoRevival检查决定提交；ContinuationComposition.SafeAdvance检查原继续点的终局/当前性/代际；真实映射归C4/C5/C9 |
| H-S4 | 新有效决定在资格受保护期间成立 | 各资格owner的guard + Identity成员reservation + 目标封口/终态 | HumanDecision.QualifiedDecision；qualified抽象全部必要guard；不重新证明Identity内部协议 |
| H-S5 | 决定/消息关联租户匹配 | 可信Access和共同提交边界拒绝foreign | HumanDecision.TenantIsolation |
| H-S6 | 每个原位置至多接手同一决定一次 | 原等待inbox去重/消费原操作；外效另认回 | HumanDecision.OnceConsumption |
| H-S7 | 回执丢失/重启不删除决定或待交接责任 | durable状态与volatile观察分离 | HumanDecision.Custody；实际落盘待故障验收 |
| H-S8 | 时间、通知或关UI不产生人的答复 | 无对应Answer转移；runtime回收非terminal | 行为模型动作集+规范反例；真实事件路径待测试 |
| H-C1 | A工具等人不关闭无依赖兄弟B的可运行性 | Agent区分active execution与parked/outstanding；Tool释放执行资源 | WaitIsolation.ToolIndependence |
| H-C2 | Session1等人不关闭Session2可运行性 | Session分键lane与Agent分scope推进，无全局wait锁 | WaitIsolation.SessionIndependence |
| H-C3 | 等人不持有共享可运行槽或写事务 | park前可靠保存继续状态，释放active permit | WaitIsolation.NoWaitSlot |
| H-C4 | 公平调度下独立可运行工作最终前进 | 工作有限、依赖可用、容量至少1、弱公平调度 | WaitIsolation.IndependentProgress |
| H-Q1 | 同一输入操作只对应一个受理身份 | Session按入口族的租户/会话/acceptId原子去重，来源变化不得改绑 | ConcurrentIntake.UniqueInput |
| H-Q2 | 已确认受理的输入不因并发覆盖而丢失 | Session journal/队列序号与输入共同提交 | ConcurrentIntake.NoLostAccepted |
| H-Q3 | 同一会话消费遵循受理顺序且至多一次 | 会话单推进者、fencing与expectedRevision | ConcurrentIntake.OrderedConsumption |

H-C4前提不含“人必须回答”。共享Model容量耗尽等真实资源约束可导致短期排队；不得把与请求无关的人工等待当作占用这些容量的理由。表中“公平”是规范前提，生产调度是否满足必须由真实并发验收补证，不把WF公式当实现。

## 正交等待与执行槽模型

设call a、b属于会话s1，call c属于s2。依赖图E中没有a→b或a→c；a已完成动作准入并进入人工等待。每会话局部屏障B(s)只覆盖已声明的同轮扩展批次，独立工具等待不加入B(s)。

`Runnable(x) = admitted(x) ∧ dependenciesSatisfied(x) ∧ ownBarrierOpen(x) ∧ ¬terminal(x)`

active执行许可限制当前正在执行的工作；parked等待只消耗独立、有界的持久等待配额。不能用`所有未完成调用数`代替active计数。等待额度超限对新请求返回明确limited，不能靠长期占一个全局执行槽实现背压。已受理工作保留保管责任。

非干扰命题：Park(a)前后，b与c的Runnable值不变，前提是其依赖/资格/预算没有独立变化。局部失效和disposer同样不得移除其他等待或其他session的调度资格。Ask要求所有子题处理后才恢复a；这不使b、c依赖a。同轮扩展的已声明屏障则保持，不能为了证明非干扰删除真实因果依赖。

## 多客户端受理模型

合法请求先由可信接入绑定tenant、session、actor、source及稳定operationId。受理成功返回inputId及本会话的权威顺序；多个来源的墙钟时间不能决定总序。并发请求以持久提交线性化点排序，客户端只知本次回执，不被承诺不可观测的全局网络先后。

Session公开操作冲突域保持(tenant,session,SessionOperationId)。同键重传返回原inputId；同键异输入冲突。来源适配器若允许客户端局部key，须先在可信来源作用域内派生SessionOperationId；不得由不可信字段伪造来源。不同session的相同SessionOperationId不能碰撞。append/序号/去重回执在一个业务单元确认。expectedRevision冲突由服务有限预算重试或明确conflict/retryable，不把合法并发请求静默丢弃。满额拒绝必须发生在确认受理之前；已确认输入不能靠丢队列项释放容量。

受理、排队、开始执行、业务终局分别可观察。一个会话单推进者消费，并不阻止多个并发intake事务；HITL暂停Agent推进，也不关闭消息、后台结果和控制受理。取消/归档影响仍由Session明确作用域与竞争次序，不能由HITL自行删除队列。

## 证明草图与可推广范围

唯一性按归纳：Init每卡无决定；唯一增加决定的Commit检查pending并在共同事务中改状态；其他动作不增加决定，因此在该转移系统中基数不超过1。实现若先检查后分开写即不满足Commit抽象，证明不适用。

保管按归纳：Init无决定；Commit同时增加决定及inbox；重试/重启不删除两者；确认接手只改变交接阶段，不删除历史。实际参与者未共同提交或对账协议未采用时不能消费该命题。

非干扰按结构：b、c的Advance guard只读各自ready、显式依赖和当前执行容量，不读a的pending-human。Park(a)释放容量，不改变b/c字段；故保持enabled。在弱公平且工作有限的前提下，持续enabled的Advance最终发生。有限TLC实例检验具体模型，以上归纳仍须独立审阅，尚无任意规模机器证明。

排队按归纳：成功Append为未见operation分配唯一序号，并原子添加到accepted和queue；重复仅读原映射；Take仅移除首项并加入consumed；因此accepted的每项始终在queue或consumed。真实SQL/provider须兑现原子Append与Take，模型不证明适配源码已符合。

## 覆盖与明确未证明

模型使用两个卡片、两个竞争答复、一个资格撤销、有限消费计数；并发模型使用三个调用与两个会话；队列模型使用两个客户端来源、两个会话、三个请求和有限容量。必须同时运行正例及破坏唯一性、保管、终局、资格、租户、消费、工具/会话隔离和入列原子性的具名负控。

本闭包不证明真实Agent恢复、真实多客户端SQL竞争、网络公平、断电、模型费用不重复、第三方外效恰好一次或未来跨服务事务。实现闭包须将每个抽象动作映射到源码提交/围栏/接手点并运行对应故障场景。检查器不把parse错误、超时或缺工具当负控通过。

## 恢复路由义务

RecoveryRouting模型区分耐久waiting/replied/inbox与接收者online/generation。H-R1未答恢复后仍等人；H-R2已答始终有稳定inbox关联；H-R3旧代次不能确认消费；H-R4在相容接收者恢复与弱公平前提下已答最终交接。原调用身份不随进程换代变化。真实Session进程重启、Agent/Tool插件卸载重装、答复在离线期间提交、旧回调迟到及重传由C4/C5/C9验证。


恢复证明草图：Init的逻辑等待与目的地已持久存在；Crash只改变online、接收者generation及临时route，既不产生人的答复也不删除inbox。Answer原子写入reply和inbox；Rebind只绑定当前代际且不改逻辑目的地；Deliver要求当前代际并检查接手幂等。因此无答保持等待、已有答复保管不丢、旧代不可接手。若最后一次故障后提供者持续可用，相容恢复/绑定/交接动作弱公平，且等待未终局，则已提交答复最终交接。无限故障或永远缺失相容实现时不声称活性成立。

在实际实现中，接手记账与推进位置也必须共同提交，或使用原业务已接受的可认回协议。收到事件、函数返回、Promise恢复都不能单独证明交接成立。H-R4只到可靠接手，不证明外部动作必成功。RegistrationProtocol现在从登记之前开始检查请求与等待共同成立、封口和原结果认回；原子提交仍是抽象动作，C2须补真实故障矩阵。


## 补充模型与假设保证组合

| 义务 | 补充守护 | 有界前提 |
| --- | --- | --- |
| 请求登记、unknown及封口 | RegistrationProtocol：共同登记、唯一原请求、封口后不可提交、没有记录不等于已封口、查询带原结果 | 一个操作、两种潜在重复请求身份；原子提交和可靠介质为提供者前提 |
| Ask与扩展混合批次 | ContinuationComposition：第一轮两个Ask问题，第二轮两项allow/ask/deny判断；全部判断齐备且仅实际ask项已接手才越屏障 | 两轮两项；判断结果持久，不能恢复时重调已记录判断 |
| 继续时的终局和代际 | SafeAdvance、OnceAdvance；ReadyProgress在必要恢复/绑定/继续弱公平下，条件齐备最终推进或观察明确终局/撤权 | 不给Answer加公平假设；检查逻辑继续，不证明任意外部效果恰好一次 |
| 队列控制与容量 | IntakeControl：受理与archive竞争、pending容量、取消当前Run不吞后续输入、开始及完成绑定执行身份/代际 | 一会话三个输入、两个pending容量、两代推进者；单active是采用的局部调度结构 |
| 等待释放及重新占槽 | ExecutionSlots：human→ready→running→done，等待时不占active，恢复须重新获得容量 | 三调用一名额，各段运行有限、弱公平，无人为答复公平假设 |
| 权限层级与全化结果 | check-semantics.py：权限关系唯一合法结果与独立参考求值比较；18方法结果代数及观察分区 | 三档位、四配值层和具名有限分区；不是生产边界解析和服务状态实现 |

共同状态不是模型变量名的字符串拼接。组合采用以下映射，真实实现须给每行提交点和原操作读回证据。

| 共同原子动作 | 保证与跨模型投影 | 外部假设/失效动作 |
| --- | --- | --- |
| Register | RegistrationProtocol的cards=waits且result可认回，才允许HumanDecision/RecoveryRouting把该等待纳入初态 | seal与原提交同序。准备记录不属于有效等待；崩溃不能创造新请求身份 |
| AnswerCommit | HumanDecision的decisions与inbox共同增加；映射到RecoveryRouting的replied/inbox及ContinuationComposition的answers/inbox | AuthorityComposition各适用current guard为真。Session控制即其session轴，不能读异步live缓存 |
| Receive | 原等待原子更新received和consume回执；RecoveryRouting的delivered对应可靠接手，不对应已经执行 | receiverGeneration来自同一权威绑定。重试查询原回执；旧代拒绝，已成立历史不倒退 |
| Park/ResumeAcquire | 原继续检查点持久后才从active holders移除；已答先ready，取得名额后再运行 | ExecutionSlots的holders必须是实际调度权威。普通await不是Park，其他物理资源有独立所有权 |
| Continue | ContinuationComposition屏障、原终局、当前代际和authority一起检查；逻辑继续位置与一次推进账共同提交 | authority消费Permissions当前结果及Authorization约束，不将旧Context值视为真。实际动作还须PermissionScope的绑定/消费保护 |
| Intake/Control | ConcurrentIntake的队列/输入身份映射到IntakeControl的accepted、queue及started；archive清队列须记取消归属 | 实际Session受理顺序和操作scope兑现原子入列。CancelRun绑定当前目标，不把旧完成回调应用到新active |

组合安全证明草图：定义全局不变量I为请求-等待保管一致、有效决定有inbox、接手与推进身份不变、屏障/终局/当前性成立、active容量有界及受理输入可归属。初始空状态满足I。Register只共同增加请求/等待；AnswerCommit只在当前资格和未终局下共同增加决定/inbox；Receive只认原身份；Park不删除保管；ResumeAcquire只在容量内增加持有；Continue在I及屏障/终局/当前性守卫内写一次推进；Control只终止后续资格并保存历史及输入归属；Crash/Recover不改耐久业务事实。因此，只要每个实现动作均精化为上述动作或保持这些投影不变的停顿，I归纳保持。

这里的“只要”是可检查的采用前提，不是已经完成的源码精化证明。各owner必须声明影响上述投影的全部写者，不能引入未建模的删记录/改绑定/复活路径。AuthorityComposition只证明逐轴漏guard的有限反例；不自动证明所有真实provider都被枚举。没有机器检查整个实现到模型的refinement，也没有任意规模定理证明。新增组合模型检查关键交错，其余公共连接由这张映射和逐闭包实现守护承担。

组合活性分两段。答复可靠交接依赖相容恢复、服务最后一次故障后持续可用和公平投递；交接后的执行还依赖取得active名额、原工作未终局、资格未撤销及运行段有限。人的无限沉默不违反任何进展承诺。明确终局/撤权是停止依赖执行的合法结算，不是虚构答复。

## local 关系提供者的精化义务

本节约束 local 提供者的关系实现，不表示 C2 已完成独立验收。实际支持范围及可运行守护归 [local 验证说明](../../human-intervention-local/verification/README.md)。公共模型不拥有物理表，也不要求其他提供者采用相同 SQL 布局。

本地共同提交拆成五个职责。T 核验原操作的提交与封口围栏，W 只读原等待并生成规划，J 组合本次请求与等待规划，F 是原等待关系的唯一写者，H 是 HITL 请求关系的唯一写者。请求命令包含 T/W/J/F/H。恢复命令只包含 T/W/J/F，J 在该分支不读取 HITL 表。封口只需 T。Identity 的当前资格协调仍按其公开协议兑现，不因这些节点存在就视为已经检查。

| 公共抽象动作 | local 精化点 | 必须保持的观察 |
| --- | --- | --- |
| Register | 共同提交请求、卡片及原等待关联 | 原请求身份唯一，等待与请求同时可见，原操作结果可认回 |
| AnswerCommit | H 写唯一决定，F 写原等待的 inbox/pending；两者在同一提交内成立 | 不得只确认决定而没有原等待保管，不得覆盖已成立决定 |
| Receive | F 同时写消费 receipt、更新计数/checkpoint 并删除对应 pending | 重传不增加消费次数，未确认交付不丢失，旧代际不得接手 |
| 迁移 | 在各拥有者公开导出及校验合同下保持身份、正文和关系投影 | 不产生新 Register/Receive，不丢失旧回执，不修造不存在的登记证明 |

每次对外可见的 SQL 提交才对应一个抽象动作。事务内部的暂态行不能被读者观察。任一参与者失败必须使上述抽象投影不变；仅验证前驱依赖不能证明完整命令包含所有必要参与者，命令构造器也须有守护。

除公共状态性质外，local 必须维护派生关系的精确性。PoolExact 要求读者、请求与实际非空状态桶的目录，恰好等于业务关系导出的集合。PendingExact 要求待投递集合，恰好等于已答且未被原等待消费的决定集合。ReceiptCountExact 要求保存计数等于实际消费回执数。守护应从业务关系独立推导集合并双向比较，不能调用产品的目录维护函数自证。每条守护须配一个命中该性质的负控；不相关的唯一键异常不能算该负控通过。

这些关系性质保护查询和可靠接手，不替代 ContinuationComposition 的 SafeAdvance/OnceAdvance，也不证明 ExecutionSlots 的容量调度。实际 Continue、重新占槽及旧执行排除由 Tool、Agent 和其恢复组合兑现，仍需 C4/C5/C9 的源码映射和真实运行验收。
