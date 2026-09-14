# Budget 提供者设计

状态：`f98ac926` 映射已接受为最小运行基线施工输入；纯数据、记录解码与恢复切片
已在本包实现，运行 host/plugin 与真实来源组合仍待后续切片。
[来源入口](../../../docs/proposals/core-capabilities/implementation/runtime-provider-interfaces.md)
保留历史与证据。当前实施只服务最小 allow 基线的真实本地预算。

采用 [BG v1](../../../spec/capabilities/budget-accounting/v1/contract.md) BG-01–04、
[CC v1](../../../spec/compositions/core-work-coordination/v1/contract.md)、
[DR v1](../../../spec/capabilities/durable-records/v1/contract.md) 和
[治理接口](../../../docs/proposals/core-capabilities/implementation/governance-interfaces.md)
`058c77c`。金额、来源立场、period/attempt、事件与联合预留算法见下文；
BG-05–07、支付/订阅/模型价格与用量接入后置，不借迁移扩充范围。

## Host、公开入口与插件

最终默认入口 `@omne-harness-lite/budget` 将拥有 `createBudgetHost`、`BudgetPlugin`
和 `registerChargeSourceFacts` 管理面；当前公开入口只提供纯值、记录 decoder/fold
与账目读面，不发布无运行行为的占位符。包只消费
TG/data/records/admission/diagnostics 公共入口，不 import 执行或模型实现。

BudgetHost 持有本域分租户的 logical/durable 预算账目、原 operation、来源立场、
attempt/period 归集及所有 finite/unknown 暴露。应用单次创建并保有管理面；
同一 coordinator 再创建拒绝 `authority_already_bound`。多个 Context 只复用它。
业务只持窄 AdmissionCoordinator/RecordPreparation，不取得完整 writer。

`BudgetPlugin` 提供 `omneBudget`；required inject 为 `omneAdmission`、
`omneDiagnostics`、`omneIdentity`、`omneTenant`。options 接原 host，先在同一
已验证 Watermark 完成 decoder/fold、待结算责任和币种/周期校验，再 provide。
费用来源未核实时新预留 unavailable；可用管理范围不等待未来模型提供者。

apply 捕获 `c.fiber` 的精确挂载及 host 的 mount generation，不能用 ctx.plugin
返回外壳或 uid 认业务身份。生命周期观察调用本 host 同门关闭；末门另核原
mount/source stamp 及所有必需 provider 的代次/真实存活，覆盖 consumer 尚
ACTIVE、provider 已失效及 UNLOADING 到异步 effect 的窗口。每次 apply 新建
mount generation，同 Fiber 重载不能复活旧闭包，再核
实际调用者/TG 当前预算管理或本次动作资格。Fiber ACTIVE 不提供预算许可。

## 来源与效应

`registerChargeSourceFacts` 只交受信 TL/执行 link，未来 MC 同理。内容是原稿
的真实 CostSource、精确币种/价格质量、目标 attempt、start 墓碑和计量事实。
用户参数、声称 readonly 或本地工具不使来源自动免费。门外准备双方、同门
核代次后登记，原 source check 只查自身事实，不递归向 BG 求许可。
返回的 retire/inspect/waitReleased 绑定原 registration/generation；部分装载
只登记 held，双方未就绪不正向使用，旧 disposer 只能撤原来源。

| 装载建立的效应 | 撤除完成判据与保留事实 |
|---|---|
| `omneBudget` 服务、普通订阅 | 本次 Fiber 撤精确注册，host 先封闭本代新调用；预算账和原操作不删除 |
| 当前来源登记与准备 | 原 source owner 收口其准备/注册；失联关闭依赖的新 reserve，晚到事实仍走原来源核实通道 |
| action_execution 中本 owner 预留/审计 | BG 自己 prepare/check/publish，TL 只组一次完整 batch；卸载不撤已耐久预留，pending/unknown 不因断连释放 |
| 原 attempt 计量/释放 | BG 与原执行事实 owner 保有责任；确认未发出才按原协议释放，迟到费用仍归原 period/currency，不改到新实例 |

普通 AU/BG/link 重载不能抹原已准入工作。关闭、等待取消和重试分开；清理未完
保留原资源和诊断，恢复消费原日志/来源事实后再开放。facade 可重挂同一 host，
host 本体替换先排空 publication/确认清理或合法移交并冻结完整 durable 水位；
原 host 未释放不能开第二账本。P1 失联不报告未完成结算为 durable。

## 本地基线的验证

在真实 P1/TG/身份/执行来源上验证 A26 本地切片：limit10，已有
unknown K7 后再 finite U7 或 unknown K7 都拒绝；C3+剩余4 保持已知暴露7。
USD-only 面对 EUR 来源具名拒绝，实际声明对应币种立场后才匹配全部适用预算；
changeBudget 不改 identity/币种/原 period。并发最后额度、取消早于迟到 start、
unknown、重复/迟到计量与重启必须观察真实账目及文件执行事实，不能只数 Map。
当前纯记录与恢复反例已运行；真实 P1/TG/身份/执行来源上的 A26 组合仍待后续切片。
完成本地基线后停止，不自动接模型计费或账单框架。

### 当前纯记录与恢复实现

默认入口的当前实现只解释已保存的 budget `/1` 记录。它复用 records 的完整
encode/decode 校验和 tenant/data 公共值，逐项核 owner、kind、version、shape、tenant、
因果、stream 修订及业务修订。按 `shared-interfaces/1`，同一个已提交 batch 令每个被
触及 stream 的修订加 1；Budget、CostSource 与 MeterFact 的 Counter 分别按自身链校验，
不能互相代用。

reducer 保留所有 period 身份、原 attempt allocations、来源索引与完整 MeterFact 历史，
对当前有效组成计算 C，并按 finite U 或 unknown K 计算 `R=max(bound-C,0)`。显式
reconciled/never_started 事件才释放终态预留；final 组成、Run finish、断连和重启均不
推导结算。源码入口、命令、反例和公开产物消费见
[包说明](./README.md)与[记录恢复证据](./evidence/records-recovery/README.md)。这些检查不
识别 EvidenceRef 的真实权威，不授予 runtime admission，也不证明实际费用或持久化。

## 实施协议的采用来源

下列状态、记录、端口和算法从已接受的 `058c77c` 治理输入迁入，
迁移源快照为 `7e758f21f8f92c1d46fab194fdaf120239b8e11c`。
原稿只保留受审/接受和取舍历史；本页拥有所列当前提供者设计，语言无关承诺
仍归所采用的精确 spec。接口记法不等于已经存在或发布的产品 API。

## BG：本地预算立场、attempt 与结算

### 状态和数据 shape

候选包 `packages/governance/budget/`，默认入口 `@omne-harness-lite/budget`，owner
为 `budget`。预算管理资格消费 TG 的精确 budget.manage 与独立财务读取权；
具体 Step/Session 正文依其 owner。BG 不依赖 AU grant 实现、不决定动作权限。

| 值 | 最小数据 shape |
|---|---|
| `BudgetScope` | `{kind:"tenant",tenantId}` / `{kind:"definition",tenantId,definition:DefinitionRef}` / `{kind:"session",session:SessionRef}` / `{kind:"run",run:RunRef}`；源定义 owner 可不同，但归集 tenant 必须匹配获权使用租户 |
| `Period` | `{periodId, startsAt:Instant, endsAt:Instant|null}`；明确身份不复用，边界 `[start,end)`；开启下周期是显式操作，不靠午夜清空账本 |
| `Budget` | `{budgetId, tenantId, scope:BudgetScope, currency, scale, limit:Money|null, mode:observe|soft|hard, thresholds:Money[], period:Period, revision:Counter}`；hard/soft 要求非负 limit，observe 的 null 必须显式保存；unknown 例外只由 source posture 持有，不在此复制 |
| `CostSource` | `{sourceId, revision, providerId, currency, priceEvidence:EvidenceRef[], bound: {kind:"finite",maximum:Money, guarantee:EvidenceRef[]}|{kind:"unknown",knownReserve:Money}, kind:tool|model}`；有限上界必须来自可兑现价格/单位约束，0 也要真实零成本依据 |
| `ChargeAttempt` | `{chargeAttemptId, tenantId, owner:WorkOwner, session:SessionRef|null, run:RunRef|null, subjectDefinition:DefinitionVersion, target:{kind:"tool",call:CallRef,toolDefinition:DefinitionVersion}|{kind:"model",requestId,attemptId}, source:CostSource, causality:Causality, allocations:Allocation[], phase:reserved|possibly_emitted|reconciled|released_before_start, uncertainty:known|unknown}` |
| `Allocation` | `{budgetId, budgetRevision:Counter, periodId, reserved:Money}`；该 attempt 准入时一次性绑定每个适用预算/周期，之后不能移到新周期 |
| `MeterFact` | `{sourceId, externalFactId, revision:Counter, previousRevision:Counter|null, chargeAttemptId:OpaqueId|null, providerRequestId:string|null, quality:actual|estimated|unknown, amount:Money|null, quantities:{integer:string,scale:number,unit:string}[], completeness:partial|final, corrects:{sourceId,externalFactId,revision}|null, evidence:EvidenceRef[]}`；null 只用于尚未归因的来源事实；unknown 的 amount=null，actual/estimated 必须有 Money |

ChargeAttempt 由 BG 分配唯一 chargeAttemptId，工具 target.call 精确匹配
Action.owner/callId/attemptId；模型 target 保留原 requestId/attemptId，而不是
为了套 CallRef 造一个虚假 tool call。同一次物理重连沿原 target，不分配第二次
ChargeAttempt；实际新尝试用新 attempt 并保留原费用。WorkOwner 是 Step 时
session/run 必须等于嵌套原值；辅助 WorkRef 可为 null，但原可得关联及派发因果
不能丢失，不虚构用户 Run。费用事实可在 Run/Agent 结束后到达。

definition 范围预算按 subjectDefinition 匹配原 Agent 定义；工具源版本另由
target.toolDefinition 保存且等于 Action.definition，两者与 AU 采用相同映射。
本批不另外开放“按 Plugin 定义归集”的预算类型，以免含糊 definition 同时指两种
对象。需要扩大预算范围时先增加明确的范围判别值和验收，不重新解释旧账目。

Budget 在 tenant `budget:<budgetId>`，ChargeAttempt 和计量事实在 tenant
`charge:<chargeAttemptId>`；source 姿态在 tenant `budget-source:<sourceId>`，显式
记录该来源已启用、采用哪些 tenant 立场、可信 source revision 与撤除状态。
首次 enableSource 必须显式绑定同 tenant、同来源币种的可用 tenant 预算立场；
不存在返回 budget_posture_missing，不能跳过其它币种预算后隐含放行。已绑定的
tenantPostureBudgetId 或 unknownPermissions 中任一预算币种与来源不相容，返回
budget_currency_mismatch；币种本身无法核实则 unavailable。所有已注册且 scope
及 currency 都匹配的预算均参与，消费者不能自选只检查最宽松的一个。同 scope
的另一币种预算不作跨币种比较，也不代替来源币种的明确立场。
新增/变更/停用适用预算更新 BG 的 scope
目录 stamp，使准备阶段漏掉新预算的调用必须重准备。

每个 sourceId 由来源注册权威分配并固定唯一 tenant/provider/currency；源回执不能被重指
另一租户。tenant `meter-source:<sourceId>` 保存事实键与归属/当前修订的唯一
索引，计量提交同时条件更新它和相应 charge/budget streams；因此将同一 fact
填到两个不同 attempt 也不能重复记账。unallocated 与后续 cost_attributed 使用
同一索引，归因移动不新增费用。索引与主事实同批，不依赖最终一致投影查重。

金额沿 Money：integer 是规范十进制整数字符串，scale 是校验过的非负整数，
currency 非空。内部用整数精确换 scale，同币种在共同 scale 上相加比较，只有
可整除才缩 scale；不经 Number 累加或四舍五入跨越上限。负数只用于实际调整/
余额，预留/上界/limit 不能负。不同 currency 分组，不自动换汇；同一来源存在
无法核实币种时 unavailable。数量 unit 独立于 Money，首批不把 tokens 当货币。

changeBudget 只改额度、模式、阈值等政策，不改 budgetId、tenant、scope、currency
或既有归集身份；其中 period 只经 openPeriod 的既有专用操作演进，不能经普通
变更换掉旧 periodId。金额、阈值与预留必须和目标 Budget.currency 相同，scale
仅作精确表示换算。改变币种/归集身份返回 budget_identity_immutable；需要另一
币种时由显式新预算与新来源关系进入其独立管理路径，不转移、清空或折算旧
attempt/period。恢复和迟到结算始终保留原 source/Allocation 的币种与归属；
不相容的来源事实具名报告，不能为了入账改写原金额的 currency。

### 公开端口与联合准入

| 端口 | 输入 → 结果与责任 |
|---|---|
| `createBudget/changeBudget/openPeriod` | 当前管理主体、Scope/金额/mode/period/expected → created/changed/period_opened；changeBudget 不改变币种/归集身份，openPeriod 保留历史归属；记录影响边界，未耐久放宽不可用，普通下调不强停在途 |
| `enableSource/changeSourcePosture` | 明确来源、tenant 立场与已核实 CostSource、expected → enabled/changed；`allow_unknown_exposure` 只能获准用户在此显式选择，Agent/普通审批无此写权 |
| `readBudget/readAttempt/readStepCosts` | 财务读权及目标 → 已确认消耗、预留、未决差额、质量、负剩余、未知上界、原周期与水位；不附正文/秘密 |
| `prepareReservation`（受信） | 真实调用 owner 提供的精确拟准入 target/WorkOwner/subjectDefinition、真实 CostSource 证据 → BG 私有 reservation 候选及其冻结 appends/publication；不预先扣账 |
| `checkReservation(frame,candidate)` | 当前调用/来源/budget scope目录/各预算修订与余额 → ready 或 denied/unavailable/prepare_again；与 call/AU/HD 的同一门、同一 batch |
| `recordExposure` | 原执行 owner 的 emitted/possibly_emitted/unknown 事实（经原权威认回） → exposure_recorded；调用者字符串不证明已发出或未发出 |
| `releaseBeforeStart` | 原 attempt、执行 owner 的已耐久 not_started 加迟到 start 封闭证明 → released；已发出或证明缺失为 refused/unknown，AbortSignal/not_found 不算证明 |
| `recordMeterFact/reconcileAttempt` | 来源 owner 核实的 MeterFact/最终对账证据 → recorded/replayed/superseded/fact_conflict 或 reconciled；不接受用户自报 usage 清零 |

工具 actions 的组合由 TL 拥有，模型请求的组合由 MC 拥有；它们调用 BG 准备和
检查后聚合调用/授权/批准消费/预算/执行许可记录，使用 action_execution 或
budget_call 只提交一份 batch。BG 不自己提前 submit 预留，应用也不能调用
“reserve 成功后再写 call”。候选中的 source/attempt 必须由真实 owner 私有
证据与准入记录对应；仅给 BG 填一个 `price:0` 不开放调用。

对每个按上述 scope/currency 匹配的适用预算及其原周期，先用同币种精确 scale
表示全部金额，再令 C_a 为 attempt a 当前有效的已知计费组成之和，
R_a 为其尚未结算的数值预留；R_a 同时包括有限上界留下的预留与 unknown 的
knownReserve 留下的预留。准入已知暴露 `E=Σ_a(C_a+R_a)`，同一 attempt 只贡献
一次，已完整结算的费用仍以 R_a=0 留在 E。计算消费 BG 的保守当前视图：新占用/
费用增加在 logical 立即计入，释放/减费等余额放宽只有 durable 后可用；同一
attempt 尚有未耐久变化时取其 durable 与各待确认状态中最大的 C_a+R_a，不能
将多个历史状态重复相加，也不能用尚未耐久的部分结算先腾出余额。

本次新 finite attempt 的 Q=U，新 unknown attempt 的 Q=knownReserve，准备时
尚无计量，所以准入后候选状态为 `E_after=E+Q`。每个适用 hard 都要求
`E_after <= 当前有效 limit`，并在同一个 logical 发布中占用 Q；不区分旧预留
来自 finite 还是 unknown。soft 同样记录预留和阈值事实但
不以余额拒绝；observe 保留费用/质量。多个适用预算任一个 hard 拒绝都不产生
call 准入或部分 reservation。新调用与未耐久预算下调交错仍用收紧交集，降低
后剩余可为负，后续拒绝/告警；旧调用不被 BG 停止。

上界未知且适用 hard 时默认拒绝 bound_unknown。每个适用 hard 的该 source
都显式允许 unknown，且上述包含本次 knownReserve 的 E_after 检查通过才可
准入；E 已触顶仍拒绝新 unknown（即使下一 knownReserve=0），另保留
unknownExposures 的 attempt 集合。例外只允许未知上界，不豁免已知金额的余额门。
不能把 unknown 当 0 或声称 total 上界有限。没有 hard 的 observe/soft 也要
明确展示未知费用；实际零成本工具必须有真实 CostSource finite(0) 证据和来源
姿态，不能因“本地工具”默认免费。

预算周期打开同时保存新 Period 和政策 revision。旧 reservation 继续挂原
periodId，late fact 不依据当前日期重归集。下一周期未耐久时不能用新余额准入；
跨边界的门外准备必须重算绑定周期，绝不在同一个 attempt 结算时改周期。
本批没有供应方授予额度；未来 BG-06 不能混成用户可自行增减的 limit。

### 计量、未知和事件

每笔来源事实按 `(sourceId,externalFactId,revision)` 去重。相同内容重放返回
原记录；同键异内容记 fact_conflict 并隔离该来源的后续准入，原费用不覆盖。
同一个逻辑 request 若真实供应方两次收费，用两个 externalFactId 或明确两个
attempt 记录，不能逻辑去重掉实际支出。source 修订链缺失则保留待核实事实及
差额，不跳到“完整 final”；旧修订晚到不覆盖较新有效值。

每个费用组成保留原估算和修订/冲销关系，读面计算当前有效值而非把所有历史
版本累计。由 estimated 转 actual 要有同组成的修订或显式 corrects 链；独立
收费事实则相加。令 C 为该 attempt 当前有效的已知计费组成之和，保留其各自
actual/estimated 质量；有限可兑现上界 U 的未决预留为 `max(U-C,0)`，已知总暴露
为 `max(C,U)`，作为前述 E 中该 attempt 唯一的 C+R 贡献，不能将已入账部分
再算一次预留。未知上界的已知预留 K 使用
`max(K-C,0)`，总已知暴露 `max(C,K)` 外仍有明确未知差额，不能因数值预留耗尽
移除 unknown 标志；它的 `max(C,K)` 同样进入所有后续 finite/unknown 准入的 E。
例如 K=7、部分 C=3 时 R=4、贡献仍为7；C=9 时 R=0、贡献为9，均不能再额外
加原 K 或只计 C。估算不是实际收费，缺价组成不纳入 C 伪装为零。
final 只有在来源证明该 attempt 所有费用组成完整时才能清除
剩余预留/未知标志，不能仅凭某一 usage 帧带 finish。实际金额超过 U 如实入账、
报告 bound_violated 并关闭该来源新的有限保证准入，不压成 U 掩盖外部收费。

能够确认从未发出并封闭迟到 start 时，BG 才释放全部未用预留；已经 possibly
emitted 的记录在费用核实前不因连接断开、Run cancelled 或进程重启释放。缺
emitted 回执也不能证明未发出；恢复与原执行 owner 对账，未知保留原归属。
无法归因的来源费用先记 tenant 的 unallocated stream/差额和来源去重身份，
后续明确 allocation 事实关联原 Step；不能平均分摊，不能丢掉原来源事实。

| kind（全部 /1） | data / 状态作用 |
|---|---|
| `budget.policy_changed` | `{budget:Budget, previousRevision:Counter, affectedAttempts:OpaqueId[], effectiveBoundary:"next_admission"}`；create 的 previousRevision=0 |
| `budget.period_opened` | `{budgetId, previousPeriodId, period:Period, budgetRevision:Counter}`；旧账不清空 |
| `budget.source_posture_changed` | `{tenantId, source:CostSource, enabled:boolean, tenantPostureBudgetId:OpaqueId, unknownPermissions:{budgetId,allowed:boolean}[], previousRevision:Counter}`；tenantPostureBudgetId 是启用来源的显式立场，不筛除其它适用预算；未知例外在此唯一保存 |
| `budget.attempt_reserved` | `{attempt:ChargeAttempt}`；和调用接纳同 batch；各 budget stream 同 batch 写下行 |
| `budget.reservation_changed` | `{chargeAttemptId, budgetId, periodId, before:Money, after:Money, reason:reserved|partial_meter|reconciled|never_started, evidence:EvidenceRef[]}`；核对原 attempt/金额，不单独开放任意设置 after 的端口 |
| `budget.exposure_recorded` | `{chargeAttemptId, phase:possibly_emitted, uncertainty:known|unknown, sourceFact:EvidenceRef}`；单向保守确认，不把缺席读成未发出 |
| `budget.meter_recorded` | `{fact:MeterFact}`；来源去重、组成修订和当前质量；金额进入原 allocations 的周期 |
| `budget.source_fact_indexed` | `{sourceId,externalFactId,revision,previousRevision,chargeAttemptId:OpaqueId|null,inputDigest:string}`；同 batch 更新来源索引，并核对主计量事实的规范内容；摘要不代替原内容比较 |
| `budget.attempt_reconciled` | `{chargeAttemptId, finalFacts:EvidenceRef[], released:Allocation[], remainingUnknown:boolean}`；真实完整证据才令 remainingUnknown=false |
| `budget.released_before_start` | `{chargeAttemptId, proof:EvidenceRef[], released:Allocation[]}`；先验证迟到 start 已被原 owner 封闭 |
| `budget.unallocated_recorded` / `budget.cost_attributed` | `{fact:MeterFact, tenantId}`（fact 的 chargeAttemptId 此分支为 null） / `{sourceId,externalFactId,revision,chargeAttemptId,allocations:Allocation[],evidence:EvidenceRef[]}`；归因前后总费用不变，来源索引同批更新 |
| `budget.threshold_crossed` | `{budgetId,periodId,threshold:Money,knownExposure:Money,unknownAttempts:OpaqueId[],delivery:"pending"}`；与触顶事实同 batch，通知失败另记 delivery，不回滚费用 |
| `budget.threshold_delivery_changed` | `{crossingOperation:OperationRef,budgetId,periodId,threshold:Money,delivery:applied|failed|unknown,evidence:EvidenceRef[]}`；按原触顶操作与阈值关联唯一后果，重试不新增超限事实 |
| `budget.operation_denied` | 共同拒绝 shape；额度拒绝、无立场、上界未知等各有明确 code，不能只留诊断计数 |

预算 owner 的纯 reducer 验证原 attempt/period、Money/currency、修订链、分配
与余额关系。恢复先重建所有已确认账目/预留，再接纳新工作；未决收费、未完成
释放、告警后果和来源不可用分别可查询。财务读面可以显示 unknown/未核实差额，
不因费用不完整关闭获准历史；新的计费准入则按真实资格和暴露决定。

## 共同表示、提交与来源消费

复用 [Tenant 共同值及协议](../tenant/design.md#数据边界与共同操作协议)，本包自己
持有预算、period/attempt 和所有 pending/unknown 根，执行 prepare/check/publication
及拒绝审计。未耐久收紧立即生效，放宽/新周期等 durable；logical 预留立即占用。
文档共用不授予 TG 预算求值、共同提交或释放权，不新增运行入口。

| 消费者需要的注入 | 最小内容与真实 owner | 必须共同验证的门 |
|---|---|---|
| TG/AU/BG 的主体事实 | 前述 AuthenticatedInvocation；本机凭据映射/撤销由身份适配持有，TG 解释成员，SR/AR 解释工作委托 | 伪造 DTO/句柄失败；两主体凭据真实区分；准备后撤凭据先封闭后续 gate；本机 IPC 在 P3 通过前不开放给用户 |
| BG 费用来源与执行事实 | TL/local-execution、后续 MC/OpenRouter 提供 CostSource、精确 target、start 墓碑、计量来源；证据引用经原 owner 认回，不能用户提交就可信 | 实际零费依据、并发最后额度、取消早于迟到 start、效果未知及迟到收费；缺 usage 不归零 |
