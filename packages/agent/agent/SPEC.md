# Agent 通用实现的行为边界

根入口导出 `createAgentRuntime`、通用评估器 `agentEvaluator`、它写入的 checkpoint 的 schema 采用 `agentCheckpointSchema` 与构造类型。根入口另导出独立 Model 接收工厂、宿主持有状态与完整交付材料读取器，形状见[公开入口](docs/public-api.md#独立-model-接收入口)。根入口还导出控制推进 `advanceControl`，供不经执行句柄受理控制的宿主推进已受理的控制，行为见[控制推进](docs/public-api.md#控制推进)。读取器只判断 schema 与原关联，不独自证明保存或当前资格。工厂的设计已由[技术接受与产品采用决定](https://github.com/nemori-ai/omne-harness-lite/issues/384#issuecomment-6258475204)接受。工厂的创建校验、四个面的访问守卫与 `invoke` 的 Loop 正常路径骨架已实现，I0 输入批与 I1 请求准备、不可用读取的 W0 等待、真实 cannot-fit 的 F1 出口已实现。F1 新建候选从注入的 AgentClock.now 取时；失败保留原准备与续点，不写候选；同一已形成候选重试不再次取时。I2/M0 的固定主调用与意图提交、M6 正常直接受理及未知时原调用认回，受理的确定拒绝经 F1 以 model-refused 候选结束执行，Model 不可用时在 M6 按依赖等待（R2-D237）、M1 等待 received、M3 完整材料采用及 M4/M5 直通已实现。首内容前最终失败且无有效回复经 I3 形成 no-reply 候选。I3 的接纳事实、message 事件与 Q4 接续同 revision 提交。I4 提交真实空动作批，I8 重读最新事实后选择新 step、一次等待保存或 F1 候选，部分内容不直接决定完成。W0 保存业务等待，启动观察后重读来源，再按注入时钟等待进程内检查时刻。观察从协调者确切知道的事件游标开始，所以每次进入等待最多一次 `load`（AG-03 R6.5）。R0 保留原 operation 与 expected，committed 认回后继，unknown 等待，excluded 才重求值。通知与检查到期都不证明原操作未执行。其他操作本体及剩余 Loop 节点的精确语义与失败分支尚未实现，实际支持范围见[成员 README](README_ZH.md#支持范围)。运行契约的接受范围以 [公共 SPEC](../agent-contract/SPEC.md) 为准。

F1 在候选依据的修订未变时提交终结候选的业务内容，Journal 据此建立候选与 FinishIntent 投影；提交被排除后保留原意图与时刻。新输入或其他事实先改变修订时，经 R0 重读再求值。no-reply 候选失效后，I8 依据已消费结果、原 received 材料 关闭该调用的业务续点，不把已收场调用变成 producer 等待；原 received 与账目待办保持。F2 以普通 settling 提交完成落终态之前的经过，Journal 据此设 author route 的 beforeTerminal。F3 先读快照，投影尚无清单或上次 tryFinish 答 changed 时以 prepareFinish 发行终结责任清单，再读最新完整修订，最后以读到的 FinishIntent 投影调用 tryFinish 创建终态。F3 的 tryFinish 返回 unavailable 时，协调者经 R0 在内存等待，按检查时刻重试，不提交 waiting。changed 与 blocked 回 R0；custody 未交清时仍是未清责任，真实移交之后下一次终结才能成立；回 R0 之后读事实不可用时同样在内存等待，不提交 waiting；commit-unknown 先查询原操作再读取终态，excluded 后按当前协议重新求值，不能据此重新受理原 open，unknown 或查询不可用不写会使原终结失效的等待提交。内存 Journal 以 prepareFinish 同一函数重算清单，按 SPEC 的五类责任固定次序以第一项 pending 阻塞终结，没有 pending 而有 unknown 项（未定写入，或既没有结果、关联也没有最终失败的调用）为 unavailable；核对 obligations 已发行且属本候选，核对 intent 与投影相等。author route 无 beforeTerminal，或 author route 上的候选是未迁移的 cancelled 候选时，以 passages 阻塞。cancellation route 无判断记录时以 passages 阻塞；判断记录的判据与当前闭包不同为 changed；判断为 blocked 时按记录的类别阻塞，判断为 unknown 时为 unavailable。取消候选经 commitSettlement 的 establish、migrate、judge 建立、迁移与判断；有效取消下带 complete 或 failed 候选的 F1 为 changed。协调者的取消路线仍未实现。

F4 从非空终态台账认回已登记观察，并把未登记项保留给长期 Journal 与合法观察者。本阶段不执行扩展求值、不虚构 observed。O0 不执行 Model ACK 或 release 记录；接收状态由宿主持有。O0 尚不经 Rh 保管 handoff 责任，见开放问题的[具名缺口](docs/architecture/open-questions.md#journal-联合表达的具名缺口) U-29。未确认输出不由 O0 代为确认，其他合法保管责任继续留在 Journal。终态责任可接续后，E9 释放执行槽并保持登记，旧 execution 仍可读，新 execution 可复用 runtime。这些回归只覆盖同一非耐久内存 Journal 上的新协调者，不证明实际杀进程或跨进程恢复。

## 原 Journal 写的认回

协调者在调用 open、commit、control、recordControl、commitSettlement、prepareFinish 或 tryFinish 前保存完整原请求与恢复节点。调用抛错与 commit-unknown 都保留原 operation、expected、业务输入及资格。认回前不提交另一个等待写。query committed 后读取权威快照，继续已保存的原路线。丢回执本身不建立业务失败候选。query unknown 或不可用时保留未定写与执行槽。

open 尚未认回时，reserved 保存原 coordinator 和 invoke 输入指纹。同一 invoke 先 query 原 operation。committed 后用原 open 请求认回 authority，不重新求采用、初始 checkpoint 或消息准入。异输入返回 conflict。query excluded 后原 invoke 返回 conflict 并保留 reserved。load 的 denied 不区分缺席与拒绝访问，query 也不证明 execution 不存在。当前端口没有可采用的缺席证明，因此本片不自动释放该预占，新 operation 仍返回 busy。该状态只占原执行槽，最多一项，保留至 runtime 生命周期结束，不累积排除表。

公开控制入口为每个 tenant、execution、control operation 独立保存未定写。并行控制不覆盖协调者或其他控制的请求。重试先查询这些原写，再读取控制阶段并继续。独立 receiver 仍由自己的 reception operation 协议负责。

这段保护只保存当前进程的请求。进程重启、未知写的持久枚举及迟到提交排除依赖 Journal 的契约。永久 Journal 不可用仍可能 occupied 或 unresolved。覆盖及限制见[原写验证映射](verification/original-writes.md)。

## 兑现责任

实现须完整兑现公共操作与失败语义，不在此复制公共状态机或结果形状。配置与注入能力聚合由 [构造入口](docs/public-api.md) 拥有，机制及尚缺设计见 [内部架构](docs/architecture/README.md)。

## 停用

<a id="停用"></a>依据 R2-D173。`AgentProvider.control.quiesce` 兑现 agent-contract SPEC「[交接与停用](../agent-contract/SPEC.md#交接与停用)」的一段：空闲实例的 quiesce 已兑现；在途交接仍是 #502 阶段 5。

- **受理**：quiesce 在第一个 `await` 之前把 runtime 置为 draining，然后核验主体。核验拒绝时，如果没有已受理的停用，draining 解除；核验期间被拒的 invoke 按失败关闭处理。核验通过的第一个 quiesce 成为本 runtime 唯一的停用。
- **draining**：新的 invoke 与 resume 返回 unavailable，owner 为 `@omne-harness/agent`。受理未知的 R0 待查项的重试也返回 unavailable。同一操作、同一输入的 invoke 重试仍取回原句柄。
- **执行槽空闲**：runtime 以停用的操作与原因调用登记句柄的 `withdraw`。答复为 withdrawn 或 null 时，quiesce 返回 drained，每个观察以 retired 结束。没有登记句柄时跳过撤登记。`withdraw` 失败、抛出或登记未到 withdrawn 时，quiesce 返回 unavailable，runtime 保持 draining，重试再次撤登记。
- **执行槽被占用**（含 R0 待查项）：quiesce 返回 unresolved，remaining 为该 execution。本实现不 detach、不交接，也不取消该 execution 的 Model 与 Tool 调用。该 execution 照常推进。E9 释放执行槽后，重试或新的 quiesce 撤登记并返回 drained。
- **执行槽为 failed**：见“[运行失败](#运行失败)”。依据 R2-D285。没有驱动在推进这个 execution，但它的责任没有交接。quiesce 照样把它算作剩余，返回 unresolved，remaining 为该 execution，不撤登记。重试得到同样的剩余。
- **操作身份**：drained 之后，同一操作、同一原因的重试认回原结果。同一操作配另一原因返回 conflict。其他操作的 quiesce 认回已受理的那一次，不开始第二次。
- **依据**：结果的 evidence 由 `agentEvidence` 派生，只在进程内存中，不是耐久记录。
- **阶段 5 仍未兑现**：在途 execution 的 detach 与交接、每个 execution 的交接依据，以及「被接管的执行不计入剩余」。

## 运行失败

<a id="运行失败"></a>一次 `runExecution` 返回失败，而 `waitForWake` 不再唤醒驱动，驱动就停止。确定节点故障先按下文尝试合法终结。仍不能继续的依赖、资格或责任保留以下停止规则。

- **何时算停止**：驱动停止，并且最后一次驱动通过带失败，或者 `waitForWake` 本身失败。只是一次通过失败不算停止。例如 commit-unknown 让驱动等待原操作，之后照常推进。驱动抛出也算停止，节点为空，失败是 owner 为 `@omne-harness/agent` 的 unavailable。
- **执行槽**：仍由这个 execution 持有的 `running` 槽改为 `failed`，带停止的节点与失败。E9 已释放的槽、已由另一个 execution 持有的槽都不改。`failed` 只是内部状态。`observe` 仍显示 occupied，因为 execution 没有终结。新的 invoke 照常答 busy。同一操作、同一输入的 invoke 重试仍取回原句柄。
- **报告**：执行槽改为 `failed` 之后，runtime 调用一次 `createAgentRuntime` 第三个参数里的 `failed` 接收者。事件是 `{ kind: 'run-failed', tenant, instance, execution, node, failure }`。`failure` 原样取自节点的答复，它的诊断文本只写身份与状态。接收者被同步调用，不得回调本 runtime。接收者抛出不改变任何答复，也不留痕。没有接收者时，执行槽照样改为 `failed`。
- **停用**：quiesce 把 `failed` 的 execution 算作剩余，答 unresolved，见“[停用](#停用)”。remaining 的契约形状只有 execution 身份，不带节点与失败。调用方要说明原因，就按 execution 对上这次报告。
- **未完成责任**：没有 Journal `ended` 就不释放槽，也不声称 Session 已终结。永久不可用、失权或无法证明保管的责任仍可能阻止收尾。quiesce 对占槽 execution 返回 unresolved。

## 确定节点故障的收尾

已受理 execution 的本地异常、不变量违规、未实现路径及无专门业务出口的确定拒绝形成 node-failed。分类由产生边界的私有来源与结构化 Failure 决定，不解析 diagnostic。Agent 自身 denied、stale-advance、busy、依赖 unavailable，以及原 Journal/Model/Tool 效果未知不构成这个故障。Model 的原确定拒绝继续使用 model-refused。

本地来源归本次调用返回值所有。端口可以复用同一个 Failure 对象，本地分类不得改变其他端口或 execution 对该原对象的解释。

协调者固定第一故障的 node、category、failureKind、step 和来源。节点尚未取得历史时，来源明确保留空的故障历史；F1 的 origin 则必须来自后来真实读取的 execution history。时间由 AgentClock 首次成功读取后固定。node-failed 不保存 Error、stack、任意 diagnostic 或请求正文。

有原未定写时先查询原 operation。随后依次认回已保存 ended、有效取消与原故障收尾。F1 读取真实 history 和 conditions，F2 保存终态前经过，F3 发行真实责任清单并调用 tryFinish。F1/F3 的暂时 unavailable 只进入内存等待。再次推进时继续收尾，不回 I0、请求准备或新的 Model/Tool 调用。已形成候选的内容、原因与时刻保持。窄内部 continueExecution 可从已保存 node-failed 的 settling 快照恢复相同候选。

node-failed 的原未取入输入按公共 Journal 契约保持可读并记为 held，taken 仍为空。协调者不制造 input-taken、不清 calls、不把输入投给后继执行。已受理 Model/Tool 的结果继续由常驻 receiver 按原 ConsumerRef 与 consumption 保存。普通 Tool associated 引用不是保管依据，仍等待真实 received；已有受信保管记录的清单由 Journal 判断。无来源 Tool unknown、未应用 Passage 和永久材料不可读继续保留原责任。

F3 只有取得 Journal ended 才经 F4/E9 释放槽。有效取消可在终态前转 F0；已经提交的 ended 不被后来的取消覆盖。Session 的终态解释仍归 AD-02。实现守护与有限模型边界见[节点故障验证映射](verification/node-failure.md)。

## 以失败终结

<a id="以失败终结"></a>执行以 `fail` 结论终结时，结论原因写明为什么失败，宿主据此记一条日志。以前主调用以失败收场时，原因只留在 Model 的账目里，结论原因只写 `no-reply`，会话历史与服务日志都看不到真实原因。

- **原因记录**：结论原因是 Agent 自记的证据，node-failed 的 record 为 `<execution>/node-failed`，其他失败的 record 为 `<execution>/<step>/<原因>`。主调用首内容前没有有效回复时，失败候选的 kind 仍是 `no-reply`（SC-AG-153）。原调用被 Model 判为失败收场时，原因段是 `model-failed/<故障 cause>/<诊断>`，诊断取 `ModelFault.diagnostic` 的前 120 个字符并做 URI 编码，所以不增加段；诊断为空时写 `-`。原调用正常完成却没有内容时，原因段才是 `no-reply`。Session 的 `run.terminal` 条目把这个原因原样放在 `cause` 字段，CLI 的 `read-history` 显示它。record 是给人看的标识，程序不解析它：失败收场时 `no-reply` 候选另带结构化的 `fault`，与 Settlement 的 `termination.fault` 完全相等（R2-D356，形状见[公共 API](../agent-contract/docs/public-api/README.md)）。
- **报告**：F4 读到已提交的终态后，结论为 `fail` 时，runtime 调用一次 `createAgentRuntime` 第三个参数里的 `endedFailed` 接收者。事件是 `{ kind: 'run-ended-failed', tenant, instance, execution, cause, failure }`。`cause` 是终态里的结论原因；`failure` 是快照里终结候选的 kind、step 与 `fault`（只有带 `fault` 的 `no-reply` 候选才不为 null），快照不再带候选时为 null。`complete` 与 `cancelled` 结论不报告。同一个驱动的协调者最多报告一次。接收者被同步调用，不得回调本 runtime；抛出不改变任何答复。没有接收者时执行照样终结。
- **与运行失败的区别**：[运行失败](#运行失败)是驱动停在节点上、execution 没有终结；本节是 execution 已经终结。一次 Run 只会走其中一种。
- **已知限制**：报告只在本进程 F4 时发出。进程重启后，恢复驱动重新经过 F4 时会再报告一次。

## 测量事件

<a id="测量事件"></a>依据 R2-D17（DP1 取 C）与 R2-D49：Agent 把 E9 要用的边界作为结构化事件交给调用工厂的人。参数是 `createAgentRuntime(依赖, 选项, { measure })` 的可选第三个参数，不是服务键，不是配置，不进入 `judgeOptions`，缺省不建任何事件。事件形状不是冻结的产品 API，字段名是 L-RUN 与联调 B 的约定。

| 事件                                            | 何时发出                                                                                                                                                                             | 字段                                                                     |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `segment`，`phase: 'start'`，`segment: 'agent'` | 一次工作通过开始：`accept`（`invoke` 等待的可靠受理，U0 到 E0，含 `coordinator.accept()`）或 `run`（一次 `runExecution` 驱动，从 E1 或 R0 起，到它结束、停在已保存的等待或终结为止） | `span`（进程内唯一，起止成对）、`pass`、`execution`                      |
| `segment`，`phase: 'end'`                       | 同一通过交回时，含抛出                                                                                                                                                               | 上列字段加 `outcome`：带 `failure` 的答复与抛出为 `failure`，其余为 `ok` |

- **时间**：事件不带时间。观察者在被同步调用的那一刻读自己的单调时钟，那一刻就是边界时刻。本成员不读 `Date.now`、`performance.now`，也不用注入的 `AgentClock`：它读 UTC 时刻、异步作答、测试会给它计次，不是单调时钟。
- **段是包含式的**：一次 `run` 通过包含它等待 Journal、Model、Tool 与其他端口的时间。两次通过之间的等待（`waitForWake`）不在任何段内。采集者按已知的外部等待区间扣除，段之间不能相加。
- **没有 Agent 的轮完成事件**：一轮的完成事实归 Session 的 `run.terminal` 提交（Session SPEC「测量事件」）。Agent 的执行终结能从 `run` 通过的最后一次 `end` 与 Journal 的 `ended` 事件读出，本成员不另发，免得出现两个相互可以不一致的“轮完成”。
- **观察者抛出**不改变任何答复，也不留痕。观察者不得回调本 runtime。
- **不覆盖**：`./testing` 的内存装配与独立接收入口（Model 与 Tool 接收工厂）不发事件；`resume` 与恢复面本阶段未实现，也不发；`quiesce` 不发事件。`invoke` 认回一次较早的受理时（`findAccepted`）重新受理的那一次，同样算一次 `accept` 通过。

## 资源与替换

通过显式依赖取得外部能力，不导入 Cordis 或固定本地提供者。业务身份作为操作输入，不以 Context 或插件配置替代。替换和退出保留未完成责任，不能把依赖丢失或 disposer 完成报告成业务成功。

## 验证

测量事件的测试在 `tests/measure.spec.ts`：受理与驱动两类通过的起止成对、观察者缺省与抛出时执行的结果不变。

以失败终结的测试在 `tests/run-ended-failed.spec.ts`：主调用以 connect-timeout 失败收场时，终态结论原因为 `<execution>/step-1/model-failed/upstream-unavailable/connect-timeout`，接收者恰好收到一次报告；诊断中的 `/` 被编码；负控为正常完成而没有内容时原因仍是 `no-reply`；正常完成不报告；接收者抛出时执行照样终结。只覆盖内存 Journal 与脚本化 Model。

运行失败的测试在 `tests/provider-run-failure.spec.ts`：I0 的提交答 unavailable 时，接收者收到一次带租户、实例、execution、节点与失败的报告，observe 仍为 occupied，execution 未终结，新 invoke 答 busy；quiesce 答 unresolved，remaining 为该 execution，不撤登记，重试答同样的剩余；接收者抛出时执行槽照样保持，quiesce 照样 unresolved；M0 回执丢失后经核对继续并正常结束时不报告。只覆盖内存 Journal 与登记句柄替身。

停用的测试在 `tests/provider-quiesce.spec.ts`：空闲实例 drained 并撤登记一次、draining 之后 invoke 与 resume 返回 unavailable、第一个 `await` 之前已 draining、核验拒绝解除 draining、占槽时 unresolved 且运行照常结束、撤登记失败不报 drained、同一操作认回、另一原因 conflict、停用进行中的新 quiesce 认回原停用。只覆盖内存 Journal 与登记句柄替身。

当前测试核对构造、访问守卫、正常路径、输入承接、请求准备、主调用接缝、回复准入、空动作批、I8 三种去向、原操作认回、等待保存、失通知后的计时重读与等待资源清理，以及终结的候选投影、清单发行与失效、五类 blocked 次序、取消路线的建立、判断与迁移和三个保管变体（内存 Journal 通过 agent-contract 的 Journal 核心一致性套件）。另有一条先等待再收到回复的完整模型请求，核对各节点提交次数、等待内的读取次数、自身 waiting 事件不唤醒与等待期间的重复 invoke。测试使用脚本化 Model 与非耐久内存 Journal，不证明真实提供者或完整恢复。needs-compaction 保留原结果并沿 node-failed 的 unsupported-path 收尾；压缩业务路径仍未实现。内部窄接续从同一内存 Journal 的已存 ready/step 或 PendingCall 重建固定帧，并从 received 条目读取完整材料，覆盖意图提交前后与 producer 已提交而尚未完成 I3 的切点，要求原 runtime、Access/Authority 与旧驱动已停；I2 尚须无未决 Journal 操作。它不是公开恢复或进程耐久。现行 Model 交付（`ModelDelivery` 的结果分支、`ResultPart`、`Settlement`）不带原产出 scope/format：它们只随流式到达的 finish 交出（model-contract SPEC「产出」与 finish 映射），不进 Agent 收到的交付与接收方材料。因此 Agent 收到的每个 reasoning_state 都缺 scope/format，回复不能带 `replay`（message SPEC RS-03）。依据 R2-D268（更正 R2-D70 的「一律返回 unsupported」）：M3 解释结果时，已封的 reasoning_state 与已封的 thinking 都不进入回复块，回复由其余块照常组成；去掉后没有块时按 no-reply 处理。这是 message SPEC 的投影规则允许的：去掉全部续接状态部件、也不剩 thinking 时不带 `replay`。去掉签名后的 thinking 能否回传尚未核实，所以一并去掉。未封的 thinking 按普通 partial 处理。已接收材料保持原样可读。后果是下一轮请求没有回放块（KL-66）。R2-D70 曾让这类结果返回 unsupported，M3 因此停住，Run 在 M6 等待中卡住，不终结。交付补上可选的 replay 通道后，接收方保存它，带 scope/format 的封装 reasoning_state 才作为回复块进入 reply（波 3）。

Model 接收遵守公共 SPEC 的 [J02](../agent-contract/SPEC.md#结果接收)。同一内存 Journal 提供四个视图，joint commit 在单一发布点写入材料、条目、操作结果与 saved。原消费绑定独立于当前 checkpoint 与 attachment 保留。独立接收工厂在当前资格和原 Model 权威核验后才认回或提交；unknown 只查询原 operation，excluded 不换号。账目在共同提交后出站，重试与 blocked 状态跨组件重装配保留。Model 的公开 testing pusher 自行执行其 ACK；Agent loop 不调用 Model consumption。

I3 只准入完整普通结果。completed/limit 的合法全 sealed 内容可形成回复，原 settlement、parts 与真实 trims 保留在 received 材料中，不合成提醒或 trim。含 partial 的结果不升级为完整消息。interrupted 按部分结果回 I8，原控制身份随材料保留，不改成上游故障。该消费出口不表示控制请求、阶段记录或公开恢复已交付。

## 执行槽预占

受理期间的预占按 [Agent 契约](../agent-contract/SPEC.md#受理与单执行槽) 发布 reserved。占槽与本地宿主 report 在同一同步片段，宿主据此撤销空闲计时器。资格检查之前未占槽，检查返回后仍须核对 draining。原 open 未知时不释放槽。该保证依赖本地登记句柄正常同步报告，不推导外部自定义报告失败后的回收安全。

持续证明与运行守护见 [预占验证](verification/reservation/README.md)。
