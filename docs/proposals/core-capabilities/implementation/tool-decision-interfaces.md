# P3 工具、系统审批与本地执行接口候选

状态：**proposed，待独立 architecture-reviewer 审阅与整合者接受**。本稿是
`p3-tool-decision-design / agt-037` 的技术候选，不是产品 API 已交付声明。
先支持[最小运行节点](runtime-baseline.md)，再完成 M1 系统审批；M2 的工具消费
面在此固定，模型请求/路由仍归 MC。本稿不制定文档长期归属规则，相关迁入由
[维护交接](../design-spec-maintenance-handoff.md)的接收方统一处理。

## 四输入、范围和实现依据

| 输入 | 固定版本与消费范围 |
|---|---|
| 目标 | `8c791b3a1966afa86b3d60c24fecd3da3f1ea0b9` 的 [scope](scope.md)、[runtime-baseline](runtime-baseline.md)；确定性真实文件闭环优先，不缩减完整 M1/M2 |
| 验收 | 同提交 [acceptance](acceptance.md)：A10–20、A26 本地子场景、A28–32，及其 A01–09 前提；SR S18 的 proposed→直接 deny→原 Step 恢复必须贯通 |
| 规格与共享面 | 同提交 [implementation-spec](implementation-spec.md)、[shared-interfaces](shared-interfaces.md)、D-010 [observability](observability.md)；治理受审源 `058c77c`、SR 受审源 `cd16f1`，采用本树 [治理](governance-interfaces.md)及 [SR](session-runtime-interfaces.md)正文和接受范围 |
| 计划 | 同提交 [plan](plan.md) 的提前 P3 设计与 P3 施工段；本稿末尾细化共享产物、角色、独占写路径和真实开放门 |

正式身份从 [catalog](../../../../spec/catalog.json)定位：`data.agent-runtime-identity@1`
经 D-005，`data.core-work@1` 经 D-008；`capability.live-agent@1` 经 D-005，
`composition.agent-session-binding@1` 经 D-007；下列均为 D-008 接受的 v1：
`capability.tools`、`capability.human-decisions`、`capability.action-authorization`、
`capability.budget-accounting`、`capability.session-run`、`capability.tenant-governance`、
`capability.durable-records`、`capability.engineering-observation`
及 `composition.core-work-coordination`。下文 TL/HD/AU/BG/SR/TG/DR/OB/CC
沿这些精确契约，不把实施事件或 TypeScript 记法升格为冻结规格。

work-data/records 已有真实产物；P1 writer/admission 及业务 owner 尚须真实交付。
D1 diagnostics 候选正在独立验收，本稿仅消费已接受的 Diagnostics/factory 注入
接口。runtime-baseline 中历史实施状态不取代后续接受记录，也不证明节点已运行。
以下 shape/方法/事件是语言无关施工记法，**不是已编译 TS 模块**。

本批只开放 system_approval、部署信任的工具、Linux 本地文件和前台关系；
question/agent_approval、专属账号/设备同意、暂行执行、detach、任意代码、shell、
网络文件系统、模型路由不开放。识别未知/不支持的声明并拒绝，不能退化成普通
批准或成功空操作。独立 owner、费用、停止和恢复义务不因前台或本地而豁免。

实现选择沿证据，详细来源与局限见[设计证据](evidence/tool-decision-design/README.md)：

| 部分 | 采用及理由 |
|---|---|
| 工具 fork | 直接演化现有 DSH tools fork，源 `c291e7961a515f6d7af9304e7fd1d257929aef26`、MIT/provenance；保留声明 DSL、冻结、纯呈现和具名贡献算法，删除产品入口对 llm/baseline、裸 execute、当前同名查找的依赖 |
| Schema | 复用本仓已采用的 Ajv `8.20.0`、draft 2020-12；TL 独立编译动态命令 Schema，work-data 只校验共享 DTO。源子集 validator 不能承担任意声明的完整校验；不扩写另一套 JSON Schema 解释器 |
| 执行 | Node `24.18.0` 的实际 FileHandle I/O 加本项目具名接纳/停止账本。Promise 队列、任务库或源 in-memory jobs 不拥有原批准、当前许可和崩溃核实责任，不能替代它们 |
| 运行组合 | 官方 `@deepseek-ai/cordis@4.0.2`；状态、操作面和实际资源分配到下文具名 Fiber。Cordis 不 fork，不借其卸载自动推导安全停止 |

## 包、公开入口与状态权威

| 包 / 目标默认公开入口 | 所有职责与导出 |
|---|---|
| `tools/tools` / `@omne-harness-lite/tools` | TL 定义/贡献/manifest 与调用状态，proposed/准入/结果/控制组合，TG ReferenceInventory、AU BindingFacts、HD SystemApprovalSource 的实现；导出 ToolStatePlugin、ToolsPlugin、ToolAdmissionLinkPlugin、ToolApprovalLinkPlugin、ToolExecutionLinkPlugin，具名消费端口、事件 decoder/纯 fold、声明 DSL/纯呈现 |
| `governance/human-decisions` / `@omne-harness-lite/human-decisions` | HD 请求/评论/唯一决定/消费/后果权威和可重建池；导出 HumanDecisionStatePlugin、HumanDecisionsPlugin、HumanDecisionAuthorityLinkPlugin、SystemApprovalSource/DecisionFacts 交接、事件 decoder/纯 fold。Session 与池不各造一个 answer |
| `tools/local-execution` / `@omne-harness-lite/local-execution` | 原执行接纳/取消账本、固定文件计划/真实 I/O/帧与停止事实；本地文件资源身份、当前对象权限/可授予上限及使用责任；导出 LocalExecutionPlugin、LocalResourceAccessPlugin、LocalFileToolPlugin、ExecutionProvider 实现与本地资源管理/事实接口、事件 decoder/纯 fold |

这些默认入口待实施；现有 tools `/baseline` 不是可交付旁路。三个包直接依赖
work-data/records/admission/diagnostics 的公开类型；HD 消费 AU/TG/SR 端口，TL
消费 HD/AU/BG/TG/SR 端口，local-execution 消费 TL 的 ExecutionProvider/PermitFacts
及 AU/TG 的窄类型。**TL 不 import local-execution，HD 不 import TL**：HD 自己
定义 SystemApprovalSource，由 TL 实现并注册；AU 的 DecisionFacts 由 HD 实现。
SR 继续拥有已接受的 prepareProposedCall/Wait/Result 等端口，无反向实现依赖。

记录 owner 固定 `tools`、`human-decisions`、`local-execution`。每一域每个 owner
只有一份 logical/durable 根；多 Context 注入同一权威，不各建 Map。类型、codec、
纯 fold 不变成 service。记录沿 `core-journal/1`、`core-operation/1`，每 stream
每 batch 一个 append，事件 version 为字符串 `"1"`，Counter 不转 number。
投影可重建但不授予读取、作答或执行资格；未知版本/缺 required fold 拒绝该入口。

### 身份和最小状态

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
| Call consequence | `{sourceVersion,sourcePosition,target:SR|BG,operation,delivery:pending|applied|failed|unknown,receipt:null|Receipt}`；只存具名原结果/费用/停止交付，不建通用消息总线 |

| HD 状态 | 最小值与不变量 |
|---|---|
| Request | `{request,kind:system_approval,contentVersion,revision,action,call,sourceStep,continuationId,missing:MissingPermission[],grantorRule,sourceOperation,content,status:pending|answered|cancelled|superseded,decision:null|Decision,consequence}`；内容从冻结 Action 和 AU 缺口生成，不从自由文本猜对象/效果 |
| Consequence | `{outcomeVersion,delivery:not_ready|pending_delivery|applied|failed|unknown,consumption:unconsumed|consumed|closed,consumedBy:null|CallRef,reason,sourcePosition,targetReceipt}`；交付 q1 ready 不等于消费批准。answered 与其后果关闭分别记录，保留原人类答案 |
| Pool | 原请求的 derived 索引，键为 RequestRef；按水位分页，当前权限变化使旧游标失效。可答性 available/unreachable/not_placed/unknown 独立于 pending |

| 本地执行状态 | 最小值与不变量 |
|---|---|
| Attempt ledger | `{execution,phase:accepted|dispatch_intent|terminal,acceptedOperation,planDigest,controlRevision,tombstone:null|StopFence,terminal:null|ExecutionTerminal,deliveries}`；absence 独立于任一状态。数据恢复不复活 Permit、ExactUse 或 FileHandle |
| StopFence | `{execution,controlOperation,revision,requestedAt,epochClosed:true}`；即使 absence 也可创建，在 start 的同一账本/共同门排序；墓碑按原 execution 身份永久保留或可证明压缩，不能按时间过期 |
| ExecutionTerminal | `{resultCandidate,acceptance:accepted|never_accepted,physical:active|quiescent|unknown,isolation:sealed|pending|unknown,cleanup:released|retained,effect:none|happened|possible|unknown,sourceVersion}`；unknown 不等于已停止，安全停止也不保证效果撤销 |
| Live task | 原 provider 私有 `{incarnation,execution,launches,issuedIO,openHandles,cleanup}`；每个异步取得从开始前即有原 owner，迟到 handle 回原 cleanup；计数只是索引，必须对应实际 task/handle 及完成证据 |

新 ID 沿 SR 已固定的宿主唯一启动命名空间与 owner 不回绕计数；request/outcome/
registration IDs 在原 operation 候选中只分配一次。执行提供者 incarnation 是新
运行身份；已准入 executionEpoch 不等于可反序列化的当前能力。旧 disposer/permit/
消息不能控制新 incarnation。initiator 是因果来源，不冒充 owner、原 caller、当前
作答者或受委托执行者；租户隔离逐条沿完整嵌套引用检查。

### 事件和恢复输入

streamId 使用规范元组：TL 的 `registration(scope,id)`、`call(CallRef)`、
`manifest(work,id)`、`reconciliation(tenant)`；HD 的 `request(RequestRef)`；
本地的 `execution(ExecutionRef)`、`environment(ResourceRef)`、`file(ResourceRef)`。
Position 指已耐久事实；同批来源使用 SR 已固定的
`{kind:this_batch,stream,recordIndex}`，fold 检查原 owner/协议/对象版本和同批互指，
不预猜 seq，不凭跨 owner DTO 更新权威。

| owner / 事件族（全部 /1） | 保存与合法转移 |
|---|---|
| tools.registration_planned/published/retiring/released | 精确声明/选用/实现/来源与上一修订；published 的持久记录只说明当代曾发布，当前可用仍查运行绑定；退役意图立即关闭新使用，released 要资源真实排空 |
| tools.manifest_recorded / call_proposed | 原 manifest/消费证据或完整 Call 初值；proposed 与 SR call_proposed/原 blocked continuation 同批 |
| tools.call_waiting / call_admitted | 原 call、AU 判定来源、request 或 ExecutionRef/permit 依据/chargeAttempt；分别与 HD/SR 等待或 AU/HD/BG/SR 准入同批 |
| tools.call_terminal / result_delivery_changed | 原终态版本、可信 ToolResultBlock、效果/物理事实与待交付后果；不能用迟到观察覆盖已有终态。unknown 的 resolution 另写 tools.call_resolved，保留旧 unknown |
| tools.control_requested/progressed / reconciliation_advanced | 原 call/epoch/control 和停止责任；或已处理的 AU/TG 记录水位及待处置原请求。控制不由帧推断 |
| human-decisions.request_created/commented/answered | 原 Request 或评论，或完整唯一 Decision+pending_delivery；answered 仅从 pending、按当前资格和精确修订转移 |
| human-decisions.request_closed / consequence_changed / decision_consumed | pending 的取消/取代或 answered 的后果关闭分别保存；approve 在 action_execution 中 consumedBy=原 CallRef，唯一消费；applied/failed/unknown 附原目标回执/原因 |
| local-execution.accepted / dispatch_intent / terminal_recorded | 精确计划/准入来源，实际 I/O 前的保守意图，实际终止事实；不能先写 succeeded 再做文件操作；终态与待交付 TL/BG 后果同批 |
| local-execution.stop_fenced/progressed / delivery_changed | 原取消墓碑、真实任务/handle/迟到启动隔离结果，目标回执；stop 的否定屏障不等同步等待 I/O |
| local-execution.environment_registered/file_registered/rights_changed/file_observed | 原对象/owner/根与注册版本，权限上限合法变更，已核实内容修订或 unknown；读取文件内容本身不成为授权事实 |
| 各 owner.operation_denied | 具名操作、目标、code、当前依据/水位，原 owner 关键拒绝审计；写失败为 audit_unavailable，不报已耐久拒绝 |

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
| proposeCalls | SR 原 new_step claim、完整受管返回/原 manifest 或程序化消费证据、调用有序列表；为每项解析冻结 Action 并与 SR 联合登记；返回原 CallRef/continuationId。未经完整参数校验不执行、不偷偷降级命令 |
| adjudicateCall | SR 原 adjudicate claim、原 CallRef、expected 与可选原 request；四值裁决按后文联合提交。程序化和模型同门，调用者不能填入 AU allow |
| listCalls/getCall/inspectCall/subscribeFrames | SR 当前正文/工具结果读资格及精确 call；inspect 通过原 provider 查询，缺失表示 unavailable/unknown，不能由空帧猜终态。每订阅独立 cursor/撤权检查 |
| stopCall/readControl | SR 精确 call 控制资格；作用仅原 call/attempt，不伪装成 Run interrupt。重复认回原 control；无当前控制权不能改设置或读正文 |
| reconcileWaiting | 受限宿主维护操作；按当前 AU/TG/绑定及原 request 核对待批后果，保存明确关闭/取代原因；不能自造人类答案 |

| HD 方法 | 实际消费面与错误 |
|---|---|
| list/get/subscribeRequests；pool.list/get | 同一原请求权威/当前可披露对象权限，池是索引；无权 tenant 不泄漏计数。Session owner 不是对所有资源均有授予权；不可达不离线代收 |
| answer | `{request,contentVersion,expectedRevision,response:approve|reject|comment,comment?}`；当前真实作答者须符合 AU 缺口每项的合法 grantor 和源工作资格，整个 Action 的缺口均能合法授予，不能代设备/账号专属同意。comment 不抢 outcome；其它自由文本 invalid_answer |
| closeRequest | 源 TL 的具名取代/失效/控制，或当前有明确关闭资格的用户；不修改已存在 Decision，不授予后续重试。管理员治理关闭不包含代答或正文权限 |
| readConsequence | 按获准范围显示 pending_delivery、消费/关闭/approved_but_not_admitted 及来源水位；后果失败不要求用户重复回答 |

Session 与池将同样的 operation/RequestRef 交同一 HD.answer；第一个合法决定
在 logical 根即封闭竞争，必须耐久才使继续权可用。第二个不同决定返回已决定的
当前结果，原 operation 重放返回原回执；同键异输入仍冲突。每次读/答/订阅投递
重新核对认证、TG 成员、SR 对象、资源 grantor 当前事实，scope 可见不代授权。
read 不拥有 outcome 更改权，单次 stop 不拥有批量 Session 设置写权。
answer 的源工作检查不要求活体 Agent、active DriverClaim 或 AR WorkPermit：等待
事实由长期 owner 认回。hold 允许获准答复保存局部 ready，但仍阻止取 claim；
cancel/强停/已随工具取消的 system_approval 则返回原关闭事实，不复活请求。
用户 closeRequest 复用 SR 的该调用控制资格并走 TL 停止/执行前取消联合路径，
不能只关闭 HD 行而遗留 SR 等待；治理关闭有独立具名资格，仍不获得代答权。
confirm 下持久 grant 已足时 missing 可以为空，仍须 AU 的当前合法 grantor 规则；
空缺口清单不表示所有同租户成员都可答复。

## 定义、声明、handler 与 skill 的同一发布单位

ToolDefinition.kind 在 TG 仍是其载体 plugin/skill 等正式种类，不发明第五类 TG
定义。工具贡献明确给出 `definition/toolKey/commands/implementationArtifact/
Binding/providerProtocol/acquisition/scope`。每条 handler 是该固定 provider 支持的
具名执行实现引用，不能携带可绕门调用的裸 execute；本地 read/write 的 handler
只准备受限 LocalFilePlan，实际 I/O 归执行 owner。公开工具消费者可以定义新工具
表面并绑定合格 provider；不能因注册一个任意 callback 就获得可靠停止声明。

1. 门外从可信 TG 发布物/制品读取完整定义。用 work-data 无损复制/结构校验，TL
   按 draft 2020-12 编译完整 input/output Schema；限制 Schema/参数大小、深度和
   引用图，禁止远程 `$ref`、`$async`、自定义执行关键字、未知 format/关键字。
   Ajv 禁止 coerceTypes/useDefaults/removeAdditional；本批命令输入根必须 object，
   明确 additionalProperties=false，未知命令/多余参数拒绝。超出支持 profile
   返回 unsupported_schema，绝不只验证自己认识的部分后继续。
2. AU.prepareDeclaration 验证词汇/resolverVersion/确认类型和真实实现匹配。
   TL 准备 handler、环境能力、输出 validator、全部必需 skill 及精确来源；返回
   私有 PublicationCandidate。准备回调不在共同门内，不给 resolver/handler
   coordinator、AU 写能力或 raw RecordWriter。
3. 同门重新核对 TG 原 acquisition/权益、SR scope、AU 声明/解析器、执行提供者
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
不重绑，同批关闭 HD 后果/TL 调用/SR 该接续或按显式新提议取代。已准入调用
保留原实现/依赖闭包；不能共存的提供者返回 busy，不能先 dispose 再等待使用数。
执行中的旧资源由独立 owner 持有，不是新贡献 Fiber 的临时资源。

一个工具不论命令多少，manifest 只有一个 alias；Schema 用同一命令表派生
`oneOf [{command:const,params:该完整inputSchema},...]`，总预算按顶层工具计数。
help 为保留元命令，不能注册同名业务 handler；授权读 help 也不是实际动作许可。
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

### 暂行与专属资格的边界

资格登记需由对应领域提供 `{contract:ResourceRef,version,executionProvider,
stagingProtocol,forbiddenEffects,revokeProtocol,dependencyRegistration,feedbackPolicy,
verificationEvidence}`，并由其真实 owner 同门提供 current/revoke 检查；完全撤销
与补偿不能互换。这里固定 HD-10–12 的输入义务，不实现暂行产物或 DAG 服务。
本批没有合格领域提供者，不能接受“已注册”的自报 Boolean；任何 provisional
声明/登记请求为 unavailable(provisional_contract_unavailable)，且不作为普通 ask
发布。specialized_consent 同理，普通 HD.answer 不铸造专属资格；这些仍属排除项。

## 原调用、审批与结果的窄交接

所有 prepare 在门外返回原 owner 私有冻结候选/记录/publication/依据 stamp；
check 在同一 GateFrame 只重检当前根，返回 ready/prepare_again/具名失败。
下面方法不让消费者直接 append，也不把 TS brand 或一份 Action 当真实性证明。

| 消费方定义的端口 / 实际提供者 | 必需数据与职责 |
|---|---|
| SR prepareProposedCall/checkProposedCall / SR | TL 原 CallRef/冻结 Action、new_step claim、原来源/呈现位置；沿 SR 同批登记原 blocked adjudicate continuation，proposeCalls 返回其原 ID |
| SR prepareCallLink、prepareWait、prepareResult、prepareRunControl 等 / SR | 原 Step/claim/Run epoch 与 CallRef.owner/Action.owner 恒定；TL/HD 交真实同批来源。每个 gate 都核对原 claim，不把“最新 Step”当调用来源 |
| HD prepareSystemRequest/checkSystemRequest / HD | `{call,action,continuationId,sourceStep,missing,grantorRule,sourceOperation}`，加 AU ask/源 TL 私有候选；仅 system_approval，同原调用/Action 的重复创建认回原 request。创建等待不 reserve 执行预算 |
| HD prepareDecisionFacts/checkDecisionFacts、prepareConsume/checkConsume / HD | 向 AU 给治理已固定的 DecisionFacts；向 TL 给原耐久 approve/完整 Action/缺口/资格依据、expected request/outcome、unconsumed/private 候选；消费事件只有本次 action_execution 能提交 |
| HD SystemApprovalSource / TL 实现 | prepareSource/checkSource 核验原 call/Action/等待/全 Run 控制；prepareAnswerConsequence/checkAnswerConsequence 给 approve 的 SR adjudicate ready，或 reject 的 TL 执行前终态+SR 原结果 ready；prepareClose/checkClose 给原等待/批准后果的关闭片段 |
| AU BindingFacts / TL 实现 | prepareBinding/checkBinding 返回原 registration/Command/Schema/Binding/skill/current 发布 stamp；不拥有资源 mayPerform/mayDelegate，不替代 SR 的当前 caller/工作事实 |
| AU ResourceFacts / 本地资源 owner 实现 | 下节精确 ResourceRef、动作权限、原合法 grantor/可授予上限/硬限制及当前根；任何缺口 unavailable，不给默认 allow |
| TG ReferenceInventory / TL 实现 | prepareReferences/checkReferences，带原 definition/acquisition、注册/manifest/call 引用和完整性/referenceRevision；同门增加立即计入，实际撤回/耐久确认后才移除。provider 缺失不是空清单，TG 停用先成立则新注册失败 |
| TL ExecutionProvider / local-execution 实现 | prepareBinding/checkBinding/acquireUse、start/inspect/requestStop/subscribe；协议/代次/环境资格及停止能力是实际实现事实；不经 raw handler 绕过 provider |
| TL PermitFacts / TL 实现，执行 provider 消费 | checkPermit(frame,privatePermit,execution) 核验原 tools.call_admitted 的耐久位置/publication ready、精确绑定、执行 epoch/当前 incarnation、精确取消；不重新评估普通 grant，也不从任意 Receipt 发许可 |
| TL prepareRecoveryPermit/checkRecoveryPermit / TL 实现，原恢复宿主消费 | `{execution,verifiedThrough,providerIncarnation,originalAdmission,executionFacts}`；核实原准入/控制与 LE 完整前缀中的未 dispatch 或已终态事实、原实际绑定可重新关联。只向当前真实 provider 发行同一 execution 的有限恢复/认回许可，旧私有对象作废；dispatch 不明时仅 inspect/收口，不给重新发出权 |
| TL prepareTerminal/checkTerminal / TL | 原执行 owner/epoch、terminalVersion、结果候选与物理/效果/费用来源。核验原记录后输出 TL result、SR 结果后果和 BG 事实交接；无法交付的源保留稳定后果 |

HD/TL 的注册句柄是唯一 generation 的活能力；缺 bridge/source 时 HD 展示
unreachable，TL ask 返回 human_decisions_unavailable，不能把跨服务通知当决定。
后台没有活体 Agent 也能入账原事实并使原接续 ready；实际 claim/执行仍经当前 SR/AR。

### 一个实际 batch 中的裁决

TL 是工具动作组合者，HD 是 answer 组合者，SR 是 fullRun 控制组合者。每次先
规范化原 operation，并以当前读权 lookupPrepared；not_seen 才准备。门外解析、
准备所有 owner 根/审计/结果并 coordinator.prepare **整个 batch**；末门再次去重，
按身份/TG→SR/AR→TL/资源→AU→HD→BG→执行绑定核对全部 stamp，才同步 pin
所需 ExactUse 并 submit 一次。门内无 await、解析器/handler、文件或观察回调。
多个写 owner 各一个 publication；同 owner 多记录/stream 合在其一份候选根。
本次准入所需 pin 的 requiredUses.recordOwner 是实际记录许可关系的 tools，
issuer 则是实际资源 owner；资源 owner 没有本批业务记录时不造假 publication。
恢复和退出必须逐项保留原 use 身份，不能以“工具条目已经移除”释放仍在途使用。

| 原路径 | 必须同批成立的事实及 claim 去向 |
|---|---|
| proposed | tools.call_proposed + SR call_proposed/原 continuation_waiting。保留 new_step claim，不执行、不建预算预留。SR recordStepReturn 将完整返回、原 adjudicate ready、checkpoint/yield 同批保存；不能靠尚不存在的结果唤醒 |
| 直接 deny | 原 adjudicate claim 的 AU deny 审计 + TL denied_before_execution 终态 + SR result_linked/consume_result ready/checkpoint/yield，owner_change 一批。使用 SR before_execution 终态证据，不要求不存在的执行接纳身份 |
| ask | AU ask 审计 + HD request_created + TL call_waiting + SR 原 request/continuation/checkpoint/yield，request_wait 一批。无 HD 不提交半等待；耐久前不呈现可答项 |
| answer approve | HD answered/唯一 outcome/pending_delivery + SR 同一 adjudicate ready，answer_consequence 一批；不发许可/不 reserve、不写 grant。目标源当前不可达则拒绝本次提交，不离线代收 |
| answer reject | HD answered/后果 + TL denied_before_execution 终态 + SR 同一 consume_result ready，answer_consequence 一批；只有该调用结束，q2 保持原 pending |
| allow（含 approve 后） | TL call_admitted/ExecutionRef/具名 dispatch 意图 + AU allow 审计 + HD decision_consumed（如有）+ BG 全部 reservation + SR call_linked/原 consume_result blocked/checkpoint/yield，action_execution 一批；pins 覆盖原工具/解析器所需闭包、环境和执行 provider |
| 正常工具结果 | local-execution 原 terminal/待交付事实耐久后，TL terminal/result 后果与 SR result_linked/ready 同批；同域可直接联合。BG 计量/释放走真实来源事实，分次交付保留原 sourceVersion/operation 至各目标回执，不因通知成功删除 |

这些 ready 都对应原 Step，下一模型决策才创建新 Step。q1 的 approve/reject/结果
可独立 claim/settle，q2 pending 不妨碍 q1；普通 completed 仍由 SR 检查所有接续、
未决后果和责任。应用只调端口，不补“TL 保存后再 SR 保存”的业务事务。

调用 logical 准入 n 后普通撤权 n+1 不推翻 n；n 耐久并 publication ready 后才
铸造/交付受约束 ExecutionPermit。force_stop/精确 stop 则关闭 n 的执行 epoch。
正向 grant/答案/新发布未耐久不能准入，logical 收紧不被后来的 pending 放宽掩盖。
audit/publication 失败保留原记录/票据/使用，committed+blocked 不改称未提交；
unknown 只 lookup 原 operation/attempt。fresh pin 的失败释放沿原 issuer，不能
释放重试所认回原票据的 pin；每项清理失败有原 owner 和查询入口。

### 批准后的失效、控制和等待维护

批准只补原缺口。参数、资源/秘密版本、环境、声明、实现或 parser 改变必须新
Action；当前候选不能修改原 Action/CallRef。硬拒绝时记录
approved_but_not_admitted，关闭原批准后果并结算原未执行调用；保留 answered/
approve 历史。绑定变更使未准入调用 stale_binding，关闭/取代原等待，不搬批准。
需要新提议由当前 driver 在合法新位置显式提出，不能自动另分配 attempt 执行。

确认模式改变不写答案。AU logical 根立即影响当前 answer/adjudicate 的资格，
TL.reconcileWaiting 按真实已确认 AU 修改位置逐请求保存 cancelled/superseded
后果及原因，并与 HD/SR 联合收口；grant 已足或 standard 恢复不伪造批准。
ToolsPlugin 的受管维护任务只用 RecordReader.readHead/readRange 追踪相关 AU/TG
水位、分页处理原等待；保留 reconciliation cursor/未交付引用，恢复先追齐。
通知仅唤醒，丢通知由配置的有界维护间隔/下次读答/准入重检补齐；不运行模型或
工具忙轮询，不给人类期限/默认答案，不限制请求总量。来源未知保留 unavailable。

单次 stop 由 TL 联合封闭原调用和其 system_approval/SR 接续；fullRun 的
interrupt/cancel/force_stop/driver_failure 则消费 SR 已固定的精确清单与当前 stamp，
将 TL 调用封闭/停止意图、HD 应关闭后果和 SR 控制事实一次提交。范围变动须重准备，
不能遗漏刚登记的 proposed 或已 answered 尚未消费项。interrupt 不等 cancel，
全 Run 阻塞不被答案清掉；force_stop 还要求执行器隔离证据。answered 历史不改写，
不以取消请求凑普通成功。晚到终态按原 epoch 入有效原结果或隔离证据，绝不复活。

## 本地资源与真实执行

### 最小资源权限提供者

LocalFileResources 是 local-execution 内具名责任，不是通用资源/ACL 框架。
可信部署通过实际 `registerEnvironment/registerFile/setResourceRights` 条件操作
建立 `{ResourceRef,owner:UserRef,tenant,rootIdentity,targetName,allowedOperations,
grantorLimits,revision,state}` 并耐久审计；TG 当前成员/原 owner 才可管理，组织
管理权不隐含文件读写/代授予。AU grant 仍由 AU 管理，这里只拥有对象当前资格/
硬上限，不再保存另一份动作 grant。真实凭据/TG 管理适配由应用/治理 owner 提供；
缺这些产物时资源不能以测试表初始化为全允许。

root 是部署创建、仅宿主控制的本地目录，登记 device/inode/规范路径和环境版本；
每个 targetName 是预登记单层 basename，不接受 slash、dot traversal、任意路径。
禁止 root 内其它不受管写者；拒绝 symlink、非普通文件及外部 hardlink，打开叶子
使用 O_NOFOLLOW 并核对实际 fd/根事实。恶意宿主/OS 管理员越权改盘属于可信部署
边界，本方案不声称沙箱。需要任意路径、可被其它进程改写的目录或远程 FS，换
合格 provider 并重新验证，不靠字符串 realpath 一次检查宣称消除 TOCTOU。

`prepareResourceFacts/checkResourceFacts` 向 AU 给精确对象/环境/权限/授予上限与
current stamp；`prepareFileUse/checkFileUse/acquireFileUse` 在实际准入同门给原
资源 ExactUse。固定目标一次仅一项文件工作使用，冲突 busy，不引入通用队列。
未知效果/未关闭 fd 保留原使用；按真实停止/核实才能释放。修改权限的收紧同门
封闭新准入，既有许可停止另走 control。ResourceRef.version 指注册版本，内容
修订另存；unknown 内容不冒充新的已知版本。

LocalFileToolPlugin 提供一个多命令工具，read `{targetId}` 为 none，write
`{targetId,text,expectedContentRevision}` 为 before_effect；两者都声明实际资源
权限。LocalFilePlan 为这两种具名闭合计划，绑定完整 Action/目标版本和长度限制；
不解释任意 shell/JS 或可变回调。handler 不能在许可外产生动态子动作；需要别的
效果须新 Action 和合格 provider。输入/输出大小、执行时限和并发是明确部署容量，
不冒充人类请求上限；超限在作用前拒绝或按原停止协议收口。
这个 read/write 限制属于本批 local-execution 提供者；ToolDefinition/Command 的
通用声明面和其它合格 ExecutionProvider 的注册边界仍保留，不能把所有工具改成
文件专用数据契约。缺相应 provider 的命令显示 unavailable，不能自动改用文件实现。

### start、inspect、stop 与 I/O 交接

`start({execution,permit,binding,plan,operation})` 只给受信 TL 派发 owner；
`inspect(execution)`、`requestStop({execution,controlOperation})`、`subscribe`
是 ExecutionProvider 的窄方法。inspect 返回 absence/accepted/dispatch_intent/
terminal、真实 physical/isolation/cleanup/effect 与 watermark；start 重复返回原
ExecutionRef/接纳回执，同键异计划或旧 permit 为 conflict/invalid_permit。
detach 固定 unsupported，不改变前台关系。
原宿主另持 `requestClose/inspectExit`：返回 provider 的 closing/quiescent/
releasing/closed、原未收口 execution/准备/handle 责任及最近错误。开始关闭先
同步关新 start，真正关闭按下述证据推进；调用者等待超时不转 closed。普通
用户不取得该宿主管理能力，单次 inspect 只按其权限披露对应工作。

1. TL 的耐久 dispatch 意图在原 authority 下保留至执行目标接纳回执。LE 在同一
   coordinator 短门核验私有 permit、精确 Binding/原执行 epoch、自己的墓碑及
   去重，提交 local-execution.accepted；该批耐久前不启动任何目标文件 I/O。
   start 回执丢失查同一 ledger，不能新建调用。跨域 provider 以后沿 CC-05，
   本地使用同一 core-journal，不另建 writer 或假定两文件原子提交。
2. 真正 I/O 前 LE 保存 dispatch_intent 及给 BG 的具名暴露交付意图；BG 通过
   recordExposure 认回这条真实 possibly_emitted 来源并耐久确认后，才继续启动。
   无回执保留原意图/预留且不发 I/O，不要求 BG 从执行帧猜暴露。随后在原执行屏障同步确认尚未 stop、
   登记一个原 launch/task；退出门后立即调用固定 Node I/O，无中间 await/插件
   回调。stop 先封闭则不发出，已登记的 launch 则仍由原 owner 收口，不能从
   任务表先删除再等待。每次下一文件系统步骤均检查原停止屏障；真实 syscall
   与 async await 都在门外，门不等待 I/O。
3. read/write/open/sync/close 的每个 Promise 和迟到 FileHandle 从发起前就有
   原 task。write 写原目标同目录的专用临时文件，sync 后 rename，再同步目标/
   必需目录，实际结果才可报告已完成；stop 不把已发生 rename 当回滚。结果
   经完整 output Schema 校验，非法输出/呈现错误结算 failed 并保留实际效果。
   最后关闭 fd、核实任务已静止，保存 terminal 和 TL/BG 待交付后果。
4. requestStop 即使早于 start 也在同账本写墓碑；logical 时关闭全部后续步骤/
   迟到启动，耐久后才确认该封闭可恢复。已发出 I/O 必须等待实际 settle/close，
   只发 AbortSignal、Promise.race 超时、not_found 或计数变零都不算 stopped。
   I/O 卡住时保留 stopping/retained，时限只结束等待，不虚报可强制中止内核。
5. 安全停止证据为原墓碑耐久、原 launch 均已收口、实际 I/O 不再进行、所有
   通道禁止迟到 start、handle 已关闭或具名安全隔离。效果 none/happened/possible
   单独保存。成功先耐久成立则 stop=ended；先 stop 后迟到成功按真实已发生事实
   入账，不能自动重写成成功或声称外部效果已撤销。

本地只执行这些受管文件操作，不创建可逃逸子进程/网络任务；任意 native callback
不具有该停止声明。它支持可靠封闭和等待真实收口，**不承诺有时限的强制停止**。
新的 provider 若声明强制停止，须另给实际隔离/迟到启动证据；API 字段不授资格。

恢复先由 P1 独占 writer 验证前缀，再在同水位 fold TL/HD/SR/BG/执行/资源事实。
LE 未恢复墓碑前不可接收 start；旧运行 permit/handle 作废。原 accepted 且无
dispatch_intent 的完整前缀可证明未进入效果位置，通过上述恢复许可核对原耐久
准入/控制及实际精确绑定后继续，不以普通 grant 撤回重新裁决旧位置；已有
dispatch_intent 但终态不明，则 possible_effect/unknown，
不靠文件内容相同猜“恰好一次”，不自动重发。旧宿主是否仍有能力发出 I/O 也要
按实际退出/OS 独占证据核实，未核实保持隔离，不能仅以 PID 或进程内 Map 判断。
真实工具效果与业务 journal 不能原子成立的窗口见设计证据中的实际 kill 探针。

原执行终态已耐久则重交同一 sourceVersion/operation，直到 TL/SR/BG 回执认回；
无 Agent 也保留它们。SR S18 执行前 deny 恢复只有原 consume_result 接续，LE
不能凭有 attemptId 就创建执行记录。原取消/强停/已关闭后果不随重启复活。

### 本地费用与帧

本地执行 owner 向 BG 提供真实 CostSource：本固定文件实现没有供应方计费，
证据绑定 provider/artifact/命令/计价版本，maximum=明确币种的 0；租户必须通过
enableSource 建立实际 observe/soft/hard 立场，所有适用预算仍参与联合 reserve。
测试任意另一有价来源不能继承该 0。未知 I/O 效果和费用质量分开；只有真实
来源能证明完整零费用才可 final 0，不能因没有 usage 默认归零。非零/未知来源
沿治理 BG 的 knownReserve、当前暴露、原 period 和 late fact 去重规则。
releaseBeforeStart 仅接受原耐久墓碑+never_started 证明；断连/unknown 不释放。

LE 分配每 attempt 单调 frame seq；frame 是执行观察，非模型思考。保留量按
条数/字节/时限配置，裁剪返回明确 gap/earliest/latest，重启无法保留的旧帧报告
crash gap。每订阅独立 cursor；TL 当前读权通过后转交，投递前再次核对，撤权
结束该订阅而不 stop 工作。终态在 journal，与最后一帧/100% 进度分开；模型只
取 SR 明确选择的结果/摘要，不因 UI 展开而注入全帧。无帧返回 empty/unsupported。

## Cordis 具体映射与生命周期

下面是本稿的具体实现选择，语义仍归上文。官方 Service 构造即注册、随 Fiber
撤回；inject 持续追踪依赖，服务消失会卸载消费者；效果清理不保证跨资源串行。
依据固定版 [Service](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/cordis-api/service.md)、
[Services](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/cordis-tutorial/03-services.md)
和既有[生命周期核对](../../../research/cordis-lifecycle-and-tool-composition.md)。
实现使用 ctx.plugin、ctx.provide、ctx.effect/拥有 Fiber 的 disposer；没有 Cordis
transaction、durable event 或业务 stopped API。以下接口记法没有新编译验证。

| 导出 plugin / service key | inject、Context/Fiber/effect 归属 |
|---|---|
| 应用 RuntimeFoundationPlugin / `omneAdmission`,`omneRecords`,`omneDiagnostics` | 应用持有实际已接受 factory 产物，恢复完成后 ctx.provide 同一实例；不创建第二 coordinator/日志器。此处固定消费键，不替 P1 声称产品就绪 |
| TL ToolStatePlugin / `omneToolState` | inject 上述三个基础键；每域唯一宿主 sibling Fiber，安装完整 TL fold/permit/control/贡献占位和恢复水位后注册。私有状态服务不向用户给 raw roots；其 effect 持有未交付后果和退役责任 |
| TL ToolsPlugin / `omneTools` | inject `omneToolState`,`omneTenant`,`omneSession`,`omneIdentity`；获准读/精确控制与 ReferenceInventory 归此 Fiber。授权/预算资格另经下行链接，只影响需要它们的新动作；BG 缺失不卸载可获准的调用读控。必要读控来源失联则该面 unavailable，原状态/执行责任仍在 ToolState/LE |
| TL ToolAdmissionLinkPlugin / 不新增 service | inject `omneTools`,`omneAuthorization`,`omneBudget`；登记当前 AU/BG 消费端口及 TL ActionFacts。失联首段同门撤回此代候选/新准入资格，不能清理已转移给原调用的 pin；不会补一个默认预算或 Action allow |
| HD HumanDecisionStatePlugin / `omneHumanDecisionState` | inject 基础三键；独立于 Agent/客户端/模型的宿主 sibling Fiber，持有请求/决定/交付权威与恢复根 |
| HD HumanDecisionsPlugin / `omneHumanDecisions` | inject `omneHumanDecisionState`,`omneTenant`,`omneSession`,`omneIdentity`；公开读答/池归此代；作答还必须具备下行链接的当前授予资格，缺席只关闭答复并显示 unknown/unreachable，不能清掉 durable request |
| HD HumanDecisionAuthorityLinkPlugin / 不新增 service | inject `omneHumanDecisions`,`omneAuthorization`；连接 HD 当前 grantor/缺口资格及向 AU 注册 DecisionFacts；撤回先封闭本代 answer/消费检查，已有答案/剩余后果保留 |
| TL ToolApprovalLinkPlugin / 不新增 service | inject `omneTools`,`omneHumanDecisions`；只以双方具名注册端口连接 SystemApprovalSource 与请求/消费端口，effect 撤回精确两端句柄并先关正向使用。无此插件允许已具备全部事实的 allow 路径，ask 明确 unavailable；桥不拥有决定/调用状态 |
| LE LocalExecutionPlugin / `omneLocalExecution`,`omneLocalResources` | inject 基础三键；宿主 sibling Fiber，与 Agent/Tools 操作 Fiber 无父子拥有关系。恢复接纳/墓碑/资源后提供两个有真实职责的表面；一个具名复合 effect 持有全部 I/O/task/fd 与其有序关闭 |
| TL ToolExecutionLinkPlugin / 不新增 service | inject `omneToolState`,`omneLocalExecution`；登记 ExecutionProvider/PermitFacts 互供，原代句柄撤回先关新 start。原任务/墓碑归 LE；丢 TL 链接不能把 LE 未完责任销毁或让新链接认领旧 callback |
| LE LocalResourceAccessPlugin / 不新增 service | inject `omneLocalResources`,`omneTenant`,`omneAuthorization`,`omneBudget`,`omneIdentity`；连接当前认证/TG、AU ResourceFacts/可授予上限及 BG 所需来源事实。对象管理政策在 LocalFileResources，桥只装配；任一当前来源缺失，依赖它的操作 unavailable；原 I/O 清理仍归 LE |
| LE LocalFileToolPlugin / 精确工具贡献、无新 service | inject `omneTools`,`omneLocalExecution`,`omneLocalResources`,`omneAuthorization`；定义/Schema/声明/handler 选择一起 prepare/publish。该 Fiber 只拥有贡献注册和未转移准备，不拥有已准入 I/O；原执行实现和 FileUse 的资源归 LE |

`omneIdentity/Tenant/Authorization/Budget/Session` 及基础三键目前是相邻消费键
候选；TG/AU/BG/AR/SR/身份与 P1 挂载的唯一提供者设计归独立的
`runtime-provider-interfaces.md` 任务，最终共同面须按其固定受审版本对齐才能
接受，不能把本表当其 exports/生命周期已经完成。各包默认入口的 Context
类型增强只供工具检查，不授运行权。
同宿主重复安装 state plugin 必须由域唯一占位拒绝，不能依赖不同 Context 自动
隔离同一协调域。scope 只表示贡献可见性；每次调用仍校验完整 tenant 身份。

操作 plugin 的 apply 只在原状态已恢复、所需窄注册已就绪后提供服务。尤其不能
先 new Service 注册成功，再用后台 Promise 补状态/声明。异步准备通过受管
effect 从开始纳管，准备完成后再次核对当代存活/current stamp；迟到结果回原
准备 owner 清理，不发布新代。服务存在、Fiber ACTIVE 与业务可用性分开。

计划替换：原 owner 同门关新注册/start→保存精确退役/停止或接管意图→原许可
和必需资源真实排空→确认责任转移/清理结果→实际 Cordis dispose。任一 retained
则保持原资源/诊断，不能靠更换同 service key 擦掉占位。纯条目更新可让原 LE
保有旧 generation，新的工具注册不夺走它；不能共存时 busy。

突发服务丢失：依赖刷新卸载操作插件，effect 的首段同步撤回原句柄/封闭门；
状态插件和 LE 保留原责任，已准入工作按实际可用资源继续收口或失败/unknown。
LE 失去 P1 时先封闭运行通道并尽力停止，无法写 journal 不声称耐久成功；其单个
复合 disposer 明确按 task→fd→provider 关闭，不能拆成互不相干并发 effect。
P1 计划关闭必须等这些 owner 确认后再关 writer/diagnostics；强行卸载的失败保留
在原宿主 cleanup 报告，不从 Fiber disposed 推导产品安全静止。

命令资源、I/O、帧订阅均归原 LE；Agent Fiber 仅有读观察/受限工作许可，客户端
仅持独立 cursor。二者 dispose 不 cancel HD 请求或释放调用 ExactUse。没有
通用 tools/change 总线推进业务：必要订阅使用具名原 owner 端口，通知异常逐项
隔离并记录；纯观察失败不否决已提交结果。

## 施工顺序、独占范围与真实开放门

此表是未来派发输入，**当前仅授权本稿和专属 evidence/tmp**。每任务同时消费
本文四输入及整合者固定的本稿接受 commit、真实前置产物版本、自己的验收行；
源码/签名冲突先报告，不能让应用临时补业务规则或修改冻结 v1。

| 增量 / 角色 / 独占未来写路径 | 前置产物和 RED→GREEN 交接 |
|---|---|
| T0-H / capability-developer / `packages/governance/human-decisions/` 的公开端口、事件/纯 fold 与测试 | 已接受 AU/SR/records 端口；先固定 SystemApprovalSource/DecisionFacts/事件来源，再以错 tenant、重复 outcome、错误转移的反例验证。真实打包、独立编译消费通过后才给 TL 开工；不把声明全绿当可答 |
| T0-T / capability-developer / `packages/tools/tools/` 公共端口、Schema/事件/纯 fold 与测试 | T0-H 固定产物及 SR S18；固定 ExecutionProvider/PermitFacts/资源消费端口、移除 llm/baseline 类型依赖。共享完整声明与跨包消费者编译后交 LE；不得让两作者同时改公共文件 |
| T1-L / infrastructure-developer / `packages/tools/local-execution/` | 真实 P1/诊断、T0-T、TG/AU 当前资源接口；先跑 D06/D07/D09 的真实失败，再交接实际资源管理、accept/stop 墓碑、I/O/fd 收口、恢复和 CostSource。资源权限没交付时不得用 permissive fixture 开工具 |
| T1-T / 原 TL capability-developer / `packages/tools/tools/` | 真实 P1/TG/AU/BG/SR、T0 与 LE 公开端口；D01–D05/D08 先反例再完整注册/proposed/deny/allow/结果。与 T1-L 可按固定端口并行，但共同真实 composition 才通过开放门 |
| T2 / application-developer / `apps/local-harness/` 被派定的文件工具/CLI/确定性驱动装配 | 真实 T1、AR/SR/TG/AU/BG/P1/身份产物；D03/D06/D07、SR S18 和最小节点全部适用门通过，给独立 tarball/实际启动和调用命令。ask 未完成则不可执行，交接仍不声称 M1 完成 |
| T3-H / 原 HD capability-developer / `packages/governance/human-decisions/`；T3-T / 原 TL owner / 原 tools 包 | 在 T0 固定面上独立实现 HD 管理/恢复/池与 TL 对应 source；D04/D05/D08/D10 的双客户端/q1q2/撤权/控制真实组合全部通过后才开放 M1 ask。保留缺失/关闭 source 的产品结果 |
| T4 / application-developer / 原应用入口；verification-developer / 单独派定组合与故障测试文件 | 接实际 Session/池/单次 stop/帧/资源管理；D01–D12、A28–32 和完整 M1 对账。M2 由 MC/Loop owner 消费本稿 manifest/结果/待答接口，在原包实现，不在这里伪造模型通过 |

每个包作者继续负责自己的恢复/失败/生命周期，verification 不补缺失产品行为。
跨 owner 的 ActionFacts/ReferenceInventory/BG 事实端口由其真实提供者共同验证，
对邻包必要接口修订归原 owner 单独任务；本稿不能授权改 P1/SR/AU 源码。根配置/
锁/索引/应用总装配归整合者，不能为并行建第二套类型或服务映射。

### 有区分力的实际测量

下列为待执行产品验收，只有真实组合实际通过才可写 GREEN。现有 fork 符合行为
先刻画保留，不人为造红；新增行为的 RED 必须能否定具体错误实现。

| ID / 原验收 | 刺激与必须观察 |
|---|---|
| D01 / A10/A30/PF024 | 同一工具 read/write，一个 alias；未知 command/多余参数/不支持 Schema、resolver/skill 缺失、handler 错配；在发布屏障换代 → 无半发布、无 body 效果，模型单槽位；程序化原证据也走相同门 |
| D02 / A01/A03/A11 | 两凭据/两 tenant 同名目标，真实资源 owner 权限和 AU grant/amend/revoke；none 读取缺权、模式矩阵、准备后撤资格 → 非法数据和旧私有句柄不能 allow/ask，不泄漏存在；管理预算不获得文件正文 |
| D03 / A09/A19/SR S18 | TL proposed+SR 原接续登记→完整返回/yield→当前直接 deny→重启消费原结果；在各批 fsync/回执处阻断 → 原 Step/Action/CallRef/continuationId 不变，无执行接纳/文件效果；旧 claim 和缺绑定无法绕过 |
| D04 / A12/A13 | ask 后释放 Agent/客户端、重启；Session/池同时 approve/reject/comment、旧 contentVersion/expected、同键异输入 → 唯一耐久 outcome，comment 不抢答；两入口认回相同原请求，时间前进不产生答案 |
| D05 / A14/A15/A17 | q1/q2 独立待答，q1 approve/reject 后先完成；批准后撤硬权/换绑定/改参数、两次消费、mode pending 收紧/放宽 → q1 串行续原 Step、q2 保留；旧批准不搬新 Action、不双执行，approved_but_not_admitted 和历史答案可查 |
| D06 / A16/A19 | start 尚未送达/已接纳但未 dispatch/真实 I/O 已发出三个窗口分别 stop，迟到 start、两个并行不同文件只停一个；实际 fd 延迟关闭 → 墓碑耐久且未实际收口前不报 stopped；另一个调用不受影响，超时保持 stopping/retained |
| D07 / A07/A17/A19 | 真实文件 open/write/rename/sync/terminal 回执各窗口 kill/reopen，重复 start、完整 journal 无回执 → 认回原 attempt；可能已效果保持 unknown 不重发，确认终态只重交结果；文件内容相同不能抵扣效果计数 |
| D08 / A18/A29 | 实际 Cordis 两 Context 同域、贡献新代准备失败/晚到、旧 disposer、AU/HD/LE 服务突失/重现、待批与在途各一项 → 同一状态 owner、无新准入、旧 pin/清理归原 owner；已准入不随操作 Fiber dispose 丢任务，请求不靠内存 Promise 存续 |
| D09 / A26/A28 | 真实 enableSource/budget 立场、最后额度并发、0 费用精确来源与另一个非零/unknown 来源、stop-before-start/late meter → 无超卖、无默认免费；原 period/CallRef 归集，unknown 暴露不因断连释放，同事实重放不增费 |
| D10 / A16/A17/HD-04 | fullRun 控制与刚 proposed/ask/已答未消费/真实终态竞争，强停中 continueQueue、迟到答案/结果、driver throw → 相关 TL/HD/SR 一批关闭，未证实安全停止/隔离保持 stopping；hold 不自动清，原成功不改写中断 |
| D11 / A20/A28 | 两帧订阅独立 cursor、保留溢出、重启缺口、终态早于重连、投递前撤权；审计/诊断同时失败 → 无竞争 cursor/隐含模型注入，gaps 明确，终态耐久；关键审计失败封闭效果，诊断失败不推翻原回执 |
| D12 / A29–32 | 原生公开 tarball 独立定义工具并跑真实最小节点；100 次待批/释放/恢复/结束循环，故障后再次装载 → 真实 task/订阅/timer/fd 回基线或逐项 retained，依赖无环；每门实际环境/命令/未执行项对账，不能以源测试或编译抵扣 |

D08 同时验证上述真实 Cordis keys/inject/资源归属；不能以“插件能加载”抵扣其
动态失联/退出测量。D07 的有效停止只在列名环境成立；内核 I/O 永不完成或
原提供者无法核实的情况保持 unknown/retained，不能为通过回归伪造安全证明。

## 尚待交付与作者检查

| 缺口 | 责任与开放限制 |
|---|---|
| 真实 P1/diagnostics | 各原 provider 作者交付并通过实际 JSONL/admission/诊断组合；本稿不推定其尚未交付行为。没有共同门，T0 可做共享/fold，目标运行不开 |
| 当前身份、AR/SR、TG/AU/BG | 各原作者交真实管理/当前事实和已接受窄口，应用只接真实凭据；完整插件映射由其原任务继续，不能因本稿列消费键而说全部完成 |
| 文件资源与执行协议 | T1-L 必须交真实对象权限/同门 stamp、受管 I/O/墓碑/费用依据，TL 的资源端口缺 provider 为 unavailable；不是 app 预置许可责任 |
| TL/HD 互供与恢复 | T0 固定类型、T1/T3 交真实 source/decision/后果端口及 D03–D10；未交付 HD 时 ask 不能执行，未交付原 source 时请求不可答 |
| 暂行/专属/后台/模型 | 仍按 scope 排除或后续 MC 任务交付，不由普通批准/本地 I/O 扩充能力声明；无相应真实提供者不能开放 |

作者只写本稿、专属 evidence/tmp；检查基线 `8c791b3`。文档/范围检查与必要
底层可行性观察记录在[设计证据](evidence/tool-decision-design/README.md)。没有
运行本稿产品 TDD、形式模型、完整 Cordis 组合或 TS 接口编译；技术候选的接受
不等于这些验收通过。独立 architecture-reviewer 由整合者安排，本作者不自行接受。
