# 工具状态提供者设计映射

状态：基础 tools fork 有 schema/definition 源码和测试；完整 ToolHost、调用状态、frames、links 与恢复许可尚未实现。本页保留后续实现会持续消费的端口、状态、失败与撤除协议；来源中的旧
接受和旧坐标仅作 provenance。本 baseline 对应契约均为 candidate、`acceptance:null`，本页也不是实现符合性声明。



## 投影共同约束

- Host 是长期状态与异步责任 owner；Cordis plugin 只注册受限服务/贡献并拥有本代资源。
- 链接插件固定双方 registration/generation，先封闭正向使用再撤回；它不复制业务状态。
- 每次 effect 前核对当前 Fiber、tenant、资格、binding、epoch 和取消；Context/AgentRef 不代授权。
- 撤除先关新工作、排空本代短门与私有资源；已耐久请求、调用、结果、费用与 unknown 留给长期 owner。

## 当前 v1 契约与来源映射

当前目标分别是 [TL-01～20](../../spec/capabilities/tools/v1/contract.md)、
[DR-01～05](../../spec/capabilities/durable-records/v1/contract.md)、
[CC-01～07](../../spec/compositions/core-work-coordination/v1/contract.md)、
[SE-12～17](../../spec/capabilities/session/v1/contract.md) 与
[RN-05](../../spec/capabilities/run/v1/contract.md)。下文的 `SR`、`core-journal/1`、
`core-operation/1` 和旧端口名均是固定来源设计中的命名，不表示本候选复用旧接口。
`SR` 所承担的等待登记、运行控制与到达裁决现分别归 Run、Session/Inbound；
凡下文仍用它表示一个共同提交伙伴，实施前必须按各语义 owner 拆开。当前差距集中在
通用 Tools 记录 codec、终态到达交接及恢复/强停的多 owner 联合验收。

## 提供者候选（由固定来源重基）

## 公开入口与记录权威

| 包 / 目标默认公开入口 | 所有职责与导出 |
|---|---|
| `tools/tools` / `@omne-harness-lite/tools` | TL 定义/贡献/manifest 与调用状态，proposed/准入/结果/控制组合，TG ReferenceInventory、AU BindingFacts、HD SystemApprovalSource 的实现；导出 createToolHost、ToolStatePlugin、ToolsPlugin、ToolAdmissionLinkPlugin、ToolApprovalLinkPlugin、ToolExecutionLinkPlugin，具名消费端口、事件 decoder/纯 fold、声明 DSL/纯呈现 |

现有源入口 src/index.ts（legacy source: `src/index.ts`） 仍是 `/baseline`，声明/呈现见
src/schema.ts（legacy source: `src/schema.ts`）、src/presentation.ts（legacy source: `src/presentation.ts`）。直接演化
DSH tools fork（`c291e796`、MIT/provenance），保留声明 DSL/冻结/纯呈现；目标
默认入口删除 llm/baseline、裸 execute、按当前同名查找的隐式依赖，不做兼容包装。
TL 消费 HD/AU/BG/TG/Run/Session 的公开窄类型，定义 ExecutionProvider/PermitFacts 供 LE
实现；**不 import local-execution，HD 不 import TL**。work-data/records 是共享
身份和 codec/端口，类型/纯 fold 不成插件。

记录 owner 分别由对应能力拥有；本包仅写 `tools`。每一域每个 owner
只有一份 logical/durable 根；多 Context 注入同一权威，不各建 Map。类型、codec、
纯 fold 不变成 service。目标遵守 DR-01 的一 stream 一 batch 至多一个 append、
每 append 使该 stream revision 恰加一；调用方在提交前冻结 appends 数组和各流内
facts 顺序，writer/read/replay 保持该顺序，按此 flatten 后才分配逐事实
`eventId=(coordinationDomain,batchSeq,recordIndex)`；Counter 不转 number。
DR v3 已定义普通单 stream envelope；它仍未定义 Tools 的事实种类与完整 codec。
Tools 的版本化 stream/fact/operation codec 与真实 writer/replay 映射仍待相应 owner 定义并验收；不得以来源的
`core-journal/1`、`core-operation/1` 建新写入兼容层。
投影可重建但不授予读取、作答或执行资格；未知版本/缺 required fold 拒绝该入口。

## 身份、状态与事件投影

Action、CallRef、StepRef、RunRef、WorkOwner、Binding、ResourceRef、Decision、
RequestRef、ToolDefinition/Command、ToolResultBlock 等精确复用 work-data。
CallRef 的 `owner/callId/attemptId` 与 Action 对应字段逐值一致；提议时已经分配
attemptId，**没有执行 attempt**是尚无执行接纳/效果，绝非省略这个共享身份字段。
operation 稳定认回整个原输入，不用新 operation/attemptId 自动重试。

| TL 状态 | 最小值与不变量 |
|---|---|
| Registration | `{registrationId,tenant,scope:SessionRef|RunRef,acquisition,definition,toolKey,commands,implementationArtifact,binding,generation,phase:preparing|published|draining|released,requiredSkills,providerProtocol}`；原 acquisitionId 保留，不按同版本借另一选用；运行句柄不写盘，持久装配意图不等于当前 published |
| ManifestTools | `{manifestId,work,requestBinding,items:[{alias,registrationId,definition,binding,commandSchemas,skillEvidence,consumerEvidence}],digest}`；保存真正送往请求的单槽位表面、正文依据；模型路径由 MC 保存完整请求，本表为其不可变组成 |
| Call | `{call,action,subjectDefinition,initiator,delegationBasis,proposalSource,presentationIndex,continuationId,state,request:null|RequestRef,execution:null|ExecutionRef,terminal:null|ToolResultBlock,consequence,controlRevision}`；state 沿 TL-07；原 subjectDefinition 是被代表 Agent 定义，不能误用工具定义找 grant |
| ExecutionRef | `{call,providerId,providerProtocol,implementationArtifact,binding,executionEpoch}`；executionEpoch 在准入时固定，与原 Step.createdEpoch/当前 Run.epoch 分开；不因 Agent 退役改写 |
| ExecutionExposure | `{call,attempt,executionOwner,providerId,providerGeneration,executionEpoch,stopFenceRevision?,state:open|closed,closedBy?}`；执行许可取得或执行 owner 接纳中较早的时点即 open，permit→start 空窗不能漏记；停止时绑定其 fence revision，只有同 call/attempt/owner/generation/epoch/fence 的 quiescent 或 verified isolation 关闭，`settled(unknown)` 保持 open。该空窗的耐久事实 owner、与许可提交的同批关系及跨域 CC-05 交接仍须 TL/LE/CC 联合定稿 |
| Call consequence | `{sourceVersion,sourcePosition,target:Inbound|BG,operation,delivery:pending|applied|failed|unknown,receipt:null|Receipt}`；工具结算交给 Inbound 到达，预算交给 BG；只存具名原结果/费用/停止交付，不建通用消息总线 |

新 ID 遵守 ARI-1 的作用域内不复用、CD-01 的 CallRef 共享身份；具体编码待
Tools/DR codec 定义。request/outcome/registration IDs 在原 operation 候选中只分配一次。
执行提供者 incarnation 是新
运行身份；已准入 executionEpoch 不等于可反序列化的当前能力。旧 disposer/permit/
消息不能控制新 incarnation。initiator 是因果来源，不冒充 owner、原 caller、当前
作答者或受委托执行者；租户隔离逐条沿完整嵌套引用检查。

来源候选把 TL streamId 写成规范元组 `registration(scope,id)`、`call(CallRef)`、
`manifest(work,id)`、`reconciliation(tenant)`；这些是待 DR codec 定义的语义身份，
不是已发布的 StreamRef 字节编码。Position 指已耐久事实；同批来源在 prepare
阶段只用相对位置/临时关联，commit 后按冻结 append 与流内 facts 顺序
解析为最终 eventId，不能因排序实现或重试到达次序改写同一原操作的身份。
fold 检查原 owner/协议/对象版本和同批互指，不预猜 seq，不凭跨 owner DTO 更新权威。

| 来源事件草案 / 当前 v1 对应 | 保存与合法转移 |
|---|---|
| registration planned/published/retiring/released（来源名待 codec） | 精确声明/选用/实现/来源与上一修订；published 的持久记录只说明当代曾发布，当前可用仍查运行绑定；退役意图立即关闭新使用，released 要资源真实排空 |
| manifest recorded（来源名待 codec） / `tools.call.proposed` | 原 manifest/消费证据或完整 Call 初值；proposed 与 `run.calls.proposed` 和原调用等待登记同批（TL-15/16） |
| `tools.call.waiting` / `tools.call.admitted` | 原 call、AU 判定来源、request 或 ExecutionRef/permit 依据/chargeAttempt；分别与 HD/Run 等待或 AU/HD/BG/Run 准入同批 |
| `tools.call.settled` / 交付状态（来源名待 codec） | 原终态版本、可信 ToolResultBlock、效果/物理事实与待交付后果；终态与 `inbound.arrival.accepted{call_settlement}` 同批或按 CC-05 跨域交付。不能用迟到观察覆盖已有终态；unknown 的 resolution 另写 `tools.call.resolved`，保留旧 unknown；业务终态不隐式关闭 ExecutionExposure |
| `tools.control.requested/progressed` / reconciliation advanced（来源名待 codec） | 原 call/epoch/control 和停止责任；或已处理的 AU/TG 记录水位及待处置原请求。控制不由帧推断 |
| 各 owner 的 denied 审计（来源名待 codec） | 具名操作、目标、code、当前依据/水位，原 owner 关键拒绝审计；写失败为 audit_unavailable，不报已耐久拒绝 |

## 公开操作与当前资格

变更统一接 `{invocation,operationId,target,expectedRevision,...}`；invocation 是
治理 AuthenticatedInvocation 的私有凭据，不接受正文传主体。业务提交返回现有
AdmissionResult，receipt 内业务结果区分 published/proposed/waiting/admitted/
settled/stopping/denied；committed 不自动等于工具执行成功。内部候选过期为
prepare_again，用户 expected 冲突保存原条件结果；unknown 只查询原操作，不换键。
读取返回 `{value,watermark,availability}`，私有不存在与无权统一 inaccessible。

| TL 方法 | 实际消费面与错误 |
|---|---|
| discover/getDefinition/help | 当前 tenant/原定义权益/可披露范围，kind=tool|skill；返回真实 available/requestable/unavailable，来源缺失不是空目录；help 只读获准定义 |
| load/loadSkill/retire | 明确 scope、原 acquisition、精确版本/配置、expected；装载可信实际制品，不能下载用户任意 JS。失权、unsupported_schema、missing_skill、unknown_declaration、stale_binding、busy/retained 分别可查 |
| prepareManifestTools | 真实 Step/消费类型/当前所选工具与 skill 证据；返回冻结表面与来源 stamp，真正请求方在发送前同门核验并保存完整 manifest；此方法不执行工具 |
| proposeCalls | RunDriver 原 new_step claim、完整受管返回/原 manifest 或程序化消费证据、调用有序列表；为每项解析冻结 Action 并与 Run 联合登记；返回原 CallRef/continuationId。未经完整参数校验不执行、不偷偷降级命令 |
| adjudicateCall | RunDriver 原 adjudicate claim、原 CallRef、expected 与可选原 request；四值裁决按后文联合提交。程序化和模型同门，调用者不能填入 AU allow |
| listCalls/getCall/inspectCall/subscribeFrames | 当前正文/工具结果读资格及精确 call，按 Run/Session 语义 owner 核验；inspect 通过原 provider 查询，缺失表示 unavailable/unknown，不能由空帧猜终态。每订阅独立 cursor/撤权检查 |
| stopCall/readControl/listExecutionExposure | Run 的精确 call 控制资格；作用仅原 call/attempt，不伪装成 Run interrupt。重复认回原 control；exposure 只由同 call/attempt/owner/generation/epoch/fence 的 quiescent 或 verified isolation 关闭，错代/迟到证据只审计 |
| reconcileWaiting | 受限宿主维护操作；按当前 AU/TG/绑定及原 request 核对待批后果，保存明确关闭/取代原因；不能自造人类答案 |

HD 读/答/关闭接口及其当前 grantor 义务见 HD 设计（legacy source: `../../governance/human-decisions/design.md`）。
## 定义、声明、handler 与 skill 的同一发布单位

ToolDefinition.kind 在 TG 仍是其载体 plugin/skill 等正式种类，不发明第五类 TG
定义。工具贡献明确给出 `definition/toolKey/commands/implementationArtifact/
Binding/providerProtocol/acquisition/scope`。每条 handler 是该固定 provider 支持的
具名执行实现引用，不能携带可绕门调用的裸 execute；本地 read/write 的 handler
只准备受限 LocalFilePlan，实际 I/O 归执行 owner。公开工具消费者可以定义新工具
表面并绑定合格 provider；不能因注册一个任意 callback 就获得可靠停止声明。

1. 门外从可信 TG 发布物/制品读取完整定义。用 work-data 无损复制/结构校验，TL
   复用仓库已采用的 Ajv 8.20.0，按 draft 2020-12 编译完整 input/output Schema，
   不扩写另一套 validator。限制 Schema/参数大小、深度和
   引用图，禁止远程 `$ref`、`$async`、自定义执行关键字、未知 format/关键字。
   Ajv 禁止 coerceTypes/useDefaults/removeAdditional；本批命令输入根必须 object，
   明确 additionalProperties=false，未知命令/多余参数拒绝。超出支持 profile
   返回 unsupported_schema，绝不只验证自己认识的部分后继续。
2. AU.prepareDeclaration 验证词汇/resolverVersion/确认类型和真实实现匹配。
   TL 准备 handler、环境能力、输出 validator、全部必需 skill 及精确来源；返回
   私有 PublicationCandidate。准备回调不在共同门内，不给 resolver/handler
   coordinator、AU 写能力或 raw RecordWriter。
3. 同门重新核对 TG 原 acquisition/权益、Run/Session scope、AU 声明/解析器、执行提供者
   当前能力与资源版本。一个 publicationId 同时安装命令表/handler 选择/Schema/
   AU 声明索引/关联 skill 指引；任一缺失不发布可调用半项。运行根逻辑占位后，
   正向可调用入口等待必要装配记录耐久；owner publications 与实际记录 owner
   一一对应，派生 AU 索引无 AU 记录时不伪造第二份 publication。
4. generation 的注销在同门先关新准入、撤去工具与声明/关联指引，原注册身份
   才能撤回。真实资源留给已 pin 的执行 owner，排空后 released；准备失败/清理
   晚到归原尝试，不能撤掉新 generation。恢复重建声明索引前入口 unavailable。

此处声明索引是 TL 同一注册根中经 AU 编译的只读描述，AU 通过 BindingFacts
消费；解析器解释与当前授权仍归 AU。没有一个可独立提前发布的第二 AU 声明根，
不能以“派生”名义在 TL publication 内任意修改其它 owner 的业务状态。

更新使新请求选新代，旧 manifest 的未准入调用 stale_binding；待批原 Action
不重绑，同批关闭 HD 后果/TL 调用及 Run 原等待关系，或按显式新提议取代。已准入调用
保留原实现/依赖闭包；不能共存的提供者返回 busy，不能先 dispose 再等待使用数。
执行中的旧资源由独立 owner 持有，不是新贡献 Fiber 的临时资源。

一个工具不论命令多少，manifest 只有一个 alias，总预算按顶层工具计数。
TL-01 的实际投影为单命令 `single`（无 command/help 层）、多命令默认 `compact`
（`{command,params}`）或可选 `oneOf`（逐命令分支），均从同一冻结命令表派生，
具体选用与预算/Schema 完整性在发布时检查。help 仅为多命令保留元命令，不能
注册同名业务 handler；授权读 help 也不是实际动作许可。
程序化入口记录 `{kind:programmatic,consumerId,protocol,work,registrationId,
skillEvidence}`，真实受管消费者核实其必需技能获取，不伪造模型 manifest。
模型建议只用原请求 manifest 的 alias/版本解析；不完整输出不能产生可执行提议。
proposeCalls 先校验/解析完整返回列表，再登记其中原调用；若整份返回不能形成
合法 Action，返回带原 source 的 invalid_proposal，不先执行其它项。原 driver
把该真实拒绝交 SR.reportDriverFailure 收口原 Step/Run，不能绕开完整返回检查
yield 成一个无来源等待，也不能虚造 Action 把非法参数算为已登记 proposed。

loadSkill 保存精确定义/正文摘要/资源位置和 scope 选择；实际请求必须包含所需
核心正文，取得原 `skillEvidence`。提供者返回裸摘要不算正文进入上下文；所需
内容超窗、读不到或版本不匹配就缩小明确工具集合或拒绝装配。独立 skill 不占
工具槽，脚本资源读取不自动执行。skill 撤回只撤相关选择/指引/未准入入口，不
清掉历史 manifest，也不撤销已经发生的效果。

暂行与专属资格由 HD 边界（legacy source: `../../governance/human-decisions/design.md#暂行与专属资格的边界`）
维护；本批缺合格领域提供者时 unavailable，不能降级成普通 ask。

## 原调用与邻包的窄交接

所有 prepare 在门外返回原 owner 私有冻结候选/记录/publication/依据 stamp；
check 在同一 GateFrame 只重检当前根，返回 ready/prepare_again/具名失败。
下表的 `prepare*` 名称沿固定来源，是待 Run/Session/Tools owner 落实的候选端口，
不是当前 v1 已发布 API；它们只标识必须请求哪个语义 owner 的联合检查，不让消费者直接 append，
也不把 TS brand 或一份 Action 当真实性证明。

| 消费方定义的端口 / 实际提供者 | 必需数据与职责 |
|---|---|
| Run call proposal（来源 `SR prepareProposedCall/checkProposedCall`）/ Run | TL 原 CallRef/冻结 Action、new_step claim、原来源/呈现位置；按 TL-15/16 同批登记 `run.calls.proposed` 和原等待登记，proposeCalls 返回原 ID |
| Run call admission/wait（来源 `SR prepareCallLink/checkCallLink`、`prepareWait/checkWait`）/ Run | 仅原 adjudicate 工作调用：核对当前 active claim、原 Step/委托/AR 许可、CallRef/Action 恒定；准入或请求等待按 TL-15 与对应 owner 同批成立，不能用最新 Step 代原 Step |
| TL 终态 + Inbound 到达 / Tools、Session | 直接 deny 核原 active adjudicate claim；执行终态核原执行身份/epoch，不要求已交还的 claim。所有结算同批写 `tools.call.settled` 与 `inbound.arrival.accepted{call_settlement,dedupKey=(call,attempt)}`，跨协调域走 CC-05 的源事实/目标去重与回执。Session 之后按 SE-14 独立分类，只有 continuation 与原 call 等待登记注销同批；context/queue/closed 不产生原 Run ready，stopping/force_stopped 按 isolated 关闭 |
| Run control（来源 `SR prepareRunControl/checkRunControl`）/ Run | 原 Run/observedEpoch、控制种类/operation、精确调用/请求与来源 stamp；当前控制者资格，不要求已交还 claim。driver_failure 来源另外核原 driver attempt，不能借控制入口伪造失败 |
| Run stop progress（来源 `SR prepareStopProgress/checkStopProgress`）/ Run | 原执行/控制 operation、真实物理/隔离/清理/效果来源和当前接收资格；不要求 DriverClaim，不能以本地 abort 或 not_found 推导安全停止 |
| AU BindingFacts / TL 实现 | prepareBinding/checkBinding 返回原 registration/Command/Schema/Binding/skill/current 发布 stamp；不拥有资源 mayPerform/mayDelegate，不替代 Run 的当前 caller/工作事实 |
| AU ResourceFacts / 本地资源 owner 实现 | 消费 LE 资源面（legacy source: `../local-execution/design.md#最小资源权限提供者`） 的精确 ResourceRef、动作权限、原合法 grantor/可授予上限/硬限制及当前根；任何缺口 unavailable，不给默认 allow |
| TG ReferenceInventory / TL 实现 | prepareReferences/checkReferences，带原 definition/acquisition、注册/manifest/call 引用和完整性/referenceRevision；同门增加立即计入，实际撤回/耐久确认后才移除。provider 缺失不是空清单，TG 停用先成立则新注册失败 |
| TL ExecutionProvider / local-execution 实现 | prepareBinding/checkBinding/acquireUse、start/inspect/requestStop/subscribe；协议/代次/环境资格及停止能力是实际实现事实；不经 raw handler 绕过 provider |
| TL PermitFacts / TL 实现，执行 provider 消费 | checkPermit(frame,privatePermit,execution) 核验原 tools.call_admitted 的耐久位置/publication ready、精确绑定、执行 epoch/当前 incarnation、精确取消；不重新评估普通 grant，也不从任意 Receipt 发许可 |
| TL prepareRecoveryPermit/checkRecoveryPermit / TL 实现，原恢复宿主消费 | `{execution,verifiedThrough,providerIncarnation,originalAdmission,executionFacts}`；核实原准入/控制与 LE 完整前缀中的未 dispatch 或已终态事实、原实际绑定可重新关联。只向当前真实 provider 发行同一 execution 的有限恢复/认回许可，旧私有对象作废；dispatch 不明时仅 inspect/收口，不给重新发出权 |
| TL prepareTerminal/checkTerminal / TL | 原执行 owner/epoch、terminalVersion、结果候选与物理/效果/费用来源。核验原记录后输出 TL 结算、`call_settlement` 到达与 BG 事实交接；跨域无法交付时保留稳定来源及待交付后果，不直接写 Run ready |

HD 提供的 prepareSystemRequest/DecisionFacts/Consume 和 TL 实现的 SystemApprovalSource
精确交接见 HD 设计（legacy source: `../../governance/human-decisions/design.md#答复与后果交接`）。后台
原事实可由长期 owner 认回，当前执行裁决才需 SR/AR 的 active adjudicate claim。

### 一个实际 batch 中的裁决

TL 是工具动作组合者，HD 是 answer 组合者，Run 是 fullRun 控制组合者，
Session/Inbound 是到达裁决者。每次先
规范化原 operation，并以当前读权 lookupPrepared；not_seen 才准备。门外解析、
准备所有 owner 根/审计/结果并 coordinator.prepare **整个 batch**；末门再次去重，
按本次操作所需来源核对全部 stamp，再同步 pin 所需 ExactUse 并 submit 一次。
新工作依身份/TG→SR/AR→TL/资源→AU→HD（如需）→BG→执行绑定检查；独立
结果/控制事实按前表核原来源与当前接收资格，不要求已交还的 AR 工作许可/claim。
门内无 await、解析器/handler、文件或观察回调。
多个写 owner 各一个 publication；同 owner 多记录/stream 合在其一份候选根。
本次准入所需 pin 的 requiredUses.recordOwner 是实际记录许可关系的 tools，
issuer 则是实际资源 owner；资源 owner 没有本批业务记录时不造假 publication。
恢复和退出必须逐项保留原 use 身份，不能以“工具条目已经移除”释放仍在途使用。

| 原路径 | 必须同批成立的事实及 claim 去向 |
|---|---|
| proposed | `tools.call.proposed` + Run 的原调用提议/等待登记同批。保留原 new_step claim，不执行、不建预算预留；完整模型返回由 RunDriver 按 RD-08 先校验，不能靠尚不存在的结果唤醒 |
| 直接 deny | 原 adjudicate claim 的 AU deny 审计 + `tools.call.settled{denied_before_execution}` + `inbound.arrival.accepted{call_settlement}` 同批。没有执行接纳身份；Session 稍后依 SE-14 分类，不能在此伪造 Run ready |
| ask | AU ask 审计 + `hd.request.created{system_approval}` + `tools.call.waiting`，请求附着原 Run 调用等待登记，一批成立。无 HD 不提交半等待；耐久前不呈现可答项 |
| allow（含 approve 后） | `tools.call.admitted`/ExecutionRef/具名 dispatch 意图 + AU allow 审计 + HD 决定消费（如有）+ BG 全部 reservation + `run.call.admitted`/执行许可/附着登记，按 TL-15 一批成立；pins 覆盖原工具/解析器所需闭包、环境和执行 provider |
| 正常工具结果 | 执行 owner 的原 terminal 与 `tools.call.settled{outcome}`、`inbound.arrival.accepted{call_settlement,dedupKey=(call,attempt)}` 同一共同提交；不同协调域以 CC-05 交付稳定来源和目标回执，不声称跨域原子。BG 计量/释放走真实来源事实，保留原 sourceVersion/operation 至各目标回执；Session 分类可独立发生，不因通知成功删除交付责任 |

SE-14 将 accepted arrival 按原发起 Run 与等待登记分类：有有效开放登记才是
continuation，并在分类提交中释放该登记；否则可能是 context、queue 或 closed。
后续模型 Step 由 Run/Session 自己创建，工具终态不直接授予驱动资格。多个原调用
可独立结算和裁决；Run completed 仍须检查接续、未决后果和责任。应用只调
具名端口，不补“TL 保存后再 Session 保存”的假原子事务。

调用 logical 准入 n 后普通撤权 n+1 不推翻 n；n 耐久并 publication ready 后才
铸造/交付受约束 ExecutionPermit。permit 到 LE start/accepted 的空窗仍计入
execution exposure，持久 owner 和原子/跨域交接见上表待决项。force_stop/精确 stop
撤销原 attempt 的继续执行权并建立 fence；单调用 stop 不等于 Run epoch 关闭，
fence 也不等于 execution exposure 已关闭。
正向 grant/答案/新发布未耐久不能准入，logical 收紧不被后来的 pending 放宽掩盖。
audit/publication 失败保留原记录/票据/使用，committed+blocked 不改称未提交；
unknown 只 lookup 原 operation/attempt。fresh pin 的失败释放沿原 issuer，不能
释放重试所认回原票据的 pin；每项清理失败有原 owner 和查询入口。

HD 的 answer_consequence 由 HD 设计（legacy source: `../../governance/human-decisions/design.md#答复与后果交接`）唯一维护。TL 提供其中 SystemApprovalSource 片段，不成为答案 owner。

### 批准后的失效、控制和等待维护

批准只补原缺口。参数、资源/秘密版本、环境、声明、实现或 parser 改变必须新
Action；当前候选不能修改原 Action/CallRef。硬拒绝时记录
approved_but_not_admitted，关闭原批准后果并结算原未执行调用；保留 answered/
approve 历史。绑定变更使未准入调用 stale_binding，关闭/取代原等待，不搬批准。
需要新提议由当前 driver 在合法新位置显式提出，不能自动另分配 attempt 执行。

确认模式改变不写答案。AU logical 根立即影响当前 answer/adjudicate 的资格，
TL.reconcileWaiting 按真实已确认 AU 修改位置逐请求保存 cancelled/superseded
后果及原因，并与 HD/Run 联合收口；grant 已足或 standard 恢复不伪造批准。
ToolHost 的受管维护任务通过受信 factory/options 注入的真实 RecordReader 的
readHead/readRange 追踪相关 AU/TG 水位、分页处理原等待；保留 reconciliation
cursor/未交付引用，恢复先追齐。运行插件只触发具名维护操作，不取得 reader。
通知仅唤醒，丢通知由配置的有界维护间隔/下次读答/准入重检补齐；不运行模型或
工具忙轮询，不给人类期限/默认答案，不限制请求总量。来源未知保留 unavailable。

单次 stop 由 TL 联合封闭原调用和其 system_approval/Run 等待关系；fullRun 的
interrupt/cancel/force_stop/driver_failure 消费 Run owner 固定的精确清单与当前 stamp，
将 TL 调用封闭/停止意图、HD 应关闭后果和 Run 控制事实按 CC-01 声明的共同提交
关系提交。范围变动须重准备，不能遗漏刚登记的 proposed 或已 answered 尚未消费项。
interrupt 不等 cancel，全 Run 阻塞不被答案清掉。RN-05 的 force_stop 终态门读取
**全部开放 execution exposure**：每项只有同 call/attempt/执行 owner/代次/epoch/fence
的 `quiescent` 或 verified isolation 才关闭；`settled(unknown)`、not_found、超时、
普通 cooperative fence、错代或未证实隔离都不能关闭。未过门的 Run 保持 stopping
及其派生 scheduler barrier；即使业务等待登记已清，也不能误报
`cancelled(force_stopped)`。answered 历史不改写，不以取消请求凑普通成功；
晚到终态按原 epoch 入有效原结果或隔离证据，绝不复活。

## Cordis 映射与撤除责任

| 导出 plugin / service key | inject、Context/Fiber/effect 归属 |
|---|---|
| TL ToolStatePlugin / `omneToolState` | inject `omneAdmission`,`omneDiagnostics`；受信 options 指定本域唯一 createToolHost 产物，核对同一基础实例与完整 TL fold/permit/control/贡献占位和恢复水位后提供受限运行面。宿主 sibling Fiber 的 effect 纳管附着/撤回；未交付后果和退役责任保留在原 host |
| TL ToolsPlugin / `omneTools` | inject `omneToolState`,`omneTenant`,`omneSession`,`omneIdentity`；获准读/精确控制与 ReferenceInventory 归此 Fiber。授权/预算资格另经下行链接，只影响需要它们的新动作；BG 缺失不卸载可获准的调用读控。必要读控来源失联则该面 unavailable，原状态/执行责任仍在 ToolState/LE |
| TL ToolAdmissionLinkPlugin / 不新增 service | inject `omneTools`,`omneAuthorization`,`omneBudget`；登记当前 AU/BG 消费端口及 TL ActionFacts。失联首段同门撤回此代候选/新准入资格，不能清理已转移给原调用的 pin；不会补一个默认预算或 Action allow |
| TL ToolApprovalLinkPlugin / 不新增 service | inject `omneTools`,`omneHumanDecisions`；以受信 options 指定的双方具名注册能力连接 SystemApprovalSource 与请求/消费端口，effect 撤回精确两端句柄并先关正向使用。无此插件允许已具备全部事实的 allow 路径，ask 明确 unavailable；桥不拥有决定/调用状态 |
| TL ToolExecutionLinkPlugin / 不新增 service | inject `omneToolState`,`omneLocalExecution`；登记 ExecutionProvider/PermitFacts 互供，原代句柄撤回先关新 start。原任务/墓碑归 LE；丢 TL 链接不能把 LE 未完责任销毁或让新链接认领旧 callback |

### 当前代次的最后门内检查

本包 createToolHost 的受信 options 注入唯一 coordinator、diagnostics、真实
RecordReader/恢复水位；准备面来自 `omneAdmission`，没有 `omneRecords`。
维护任务的 reader 仅在 host，普通 service/工具 body 无此能力。状态插件只挂
受限运行面；事实/参与者注册能力由应用精确传给 link options，不从 service 取得。
每个操作挂载/双端 link 保存 `{host,registrationId,generation,revision,closed,
canonicalFiber,requiredMounts}` 私有依据；requiredMounts 是实际提供者/链接的
精确挂载能力，不是字符串 key 或自报 active。第二个同域 host 拒绝，多 Context
只能附着同一 host；重挂分配新 generation，旧句柄/候选不自动迁移。

**T-R1：最后共同门必须自行同步验证这些依据。** 稳定宿主在开放挂载前安装
`internal/status` 观察，原 Fiber 从 ACTIVE 离开时调用本包受信 closeMount/
closeLink，在同一个 coordinator 门单调关闭原 generation 并推进 revision。
4.0.2 源 `_updateState` 先赋 Fiber.state 再同步 emit；`_unload` 在 disposer 前
await 微任务。因此即使更早的 status 监听器先重入旧方法，或撤代观察尚未处理，
最后 check 仍直接读取捕获的 canonical Fiber 和每个必需 provider/link 的当前
state，任何非 ACTIVE 都拒绝；不能只看 host 的旧 revision 或已清理 Boolean。
挂载身份在受信 apply(c) 捕获原 `c.fiber`，必要时仅对该 Cordis 对象按
`symbols.original` 解出 canonical 对象；status 事件按这个已登记对象认回。
`ctx.plugin()` 返回 Object.create(fiber) 的 PromiseLike 外壳，用于 await/dispose，
不能拿它与事件裸 `===`，也不能假定该外壳有 symbols.original；uid 不作代次。
门内禁止装卸插件、await、业务外部回调；同步 check
到 submit 间无 Cordis 状态变化入口。观察器失败关闭其所供生命周期依据，不能
吞错继续开放；未知或缺失必需挂载为 unavailable，旧 generation 为 stale_handle。

TL propose/adjudicate/声明发布的每个已捕获方法、每次重试最终门都检查原操作
mount、实际所需 TL/AU/BG/SR/身份/TG/HD（ask 或消费时）/执行链接及依赖
current；再做原认证/业务资格/ExactUse 检查。Fiber ACTIVE 只是一项必要条件。
结果/控制通道使用当前受信接收挂载及原事实身份，不重查已消耗 claim，也不因
普通授予来源丢失自动改写已准入结果。依赖重现可复用 Cordis Fiber 对象，但
重新 apply 建新挂载；旧 closure 即使仍可在 JS 调用也不能获得新 generation。

装载先门外恢复/准备，LOADING 只可登记 held 与清理责任；两端及 link ACTIVE、
恢复完成、同门重新核对后才开放。不得先 new Service 再后台补状态。准备失败/
晚到制品归原尝试，精确撤回本次 held 注册；不影响其它合法注册/原已 pin 工作。
计划退出先同门关新准入，门外 dispose；突失的即时屏障归上述 final check，
effect 仅撤服务/订阅/原句柄及清理。单纯撤 contribution 不抹历史 manifest/调用，
未交付后果、原 pin 和 retained 责任留 ToolHost/LE，不能恢复装载前总快照。
收口达到真实责任完成才 released；清理超时/失败保留 requestClose/inspectExit，
旧 disposer 不能撤新代。host 替换/应用 P1 退出次序引用相邻 P2 设计，不另造装配。

机制来源为固定官方 Cordis 4.0.2 与 DSH `c291e796`，详见
机制证据（legacy source: `../../../docs/proposals/core-capabilities/implementation/evidence/tool-decision-design/README.md`）。
T-R1 的有限实际探针不等于 TL 准入产品通过；T-R2 无 Agent 终态/控制、D01–D12
和公开类型编译均待真实产品。交付次序及独占写路径归施工入口，不由包自行接受。

TL-15 事实身份按 DR-01：同一工具流一个 owner append 只使 aggregate revision 加一，所含多条 facts
共享该 revision；逐 fact 去重只用 records commit 后的 `(coordinationDomain,batchSeq,recordIndex)` eventId。
`operationId` 只认回提交尝试，来源 arrival 的 `(call,attempt)` 是另一层去重；prepare 临时 correlation
及 `(stream,revision)` 均不能冒充 eventId。同批引用用目标 append 内的相对位置准备，
按冻结数组顺序 flatten 后解析；同一原操作重试认回原 envelope，不重排或重新分配 eventId。
