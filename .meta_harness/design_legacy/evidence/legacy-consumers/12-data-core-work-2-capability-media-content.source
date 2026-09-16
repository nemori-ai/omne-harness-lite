# 共享工作身份、动作与内容 v2

本契约身份为 `data.core-work`，版本 2。与 v1 的差异是兼容扩展加三处语义变化：内容块
补齐 `reasoning` 与 `system_reminder`、改写 `deferred_receipt` 与 `tool_call` 的形状并固定
缺失标记（CD-03）；新增命令执行面声明与调用结果形状，删除 `BackgroundDeclaration.automatic`
与 `Command.cancellation`（CD-05）；CD-01 增加一句关于调用尝试引用的澄清。CD-02、CD-04
原文不变。接受依据为
[决定 D-015](../../../../docs/decisions/D-015-tool-execution-message-stream-and-hooks.md)；
v1 保持冻结与可引用，未迁移的消费者继续按 v1。

规范依赖：[共享基础身份](../../agent-runtime-identity/v1/contract.md)。本契约只定义共享
身份与数据形状；这些形状的含义、状态转移、授权与投影归消费它们的能力——
[tools v2](../../../capabilities/tools/v2/contract.md)（命令声明、调用与结果、帧）、
[media-content v2](../../../capabilities/media-content/v2/contract.md)（媒体引用与内容交付）、
[human-decisions v2](../../../capabilities/human-decisions/v2/contract.md)（请求与决定）、
[model-execution v2](../../../capabilities/model-execution/v2/contract.md)（尝试记录与模型请求投影）、
[session v2](../../../capabilities/session/v2/contract.md)（历史与派生消息）、
[run-driver v3](../../../capabilities/run-driver/v3/contract.md)（切点与合批）、
[message-stream v1](../../../capabilities/message-stream/v1/contract.md)（帧信封与呈现意图）。
它们引用本版本，本版本不反向依赖它们。

## 身份、引用与内容

**CD-01**：所有身份是不复用的非空不透明字符串，元组按逐字段精确相等比较。
新身份由相应权威分配；调用者生成的去重键不是对象身份或操作凭证。
全局 `UserRef={userId}` 来自认证边界；`MembershipRef={tenantId,userId}` 来自租户
治理。`DefinitionRef={ownerTenantId,definitionId}` 与不可变的 `version` 分开；
租户选用保留原 owner，引用外租户定义须经明确权益，不能复制成匿名本地定义。

`RunRef={SessionRef,runId}` 表示一件逻辑工作；`StepRef={RunRef,stepId}` 表示一次
模型决策及它产出的工具执行批次，或一次具名辅助工作（标题／压缩）。辅助工作
未归入某 Run 时以 `WorkRef={tenantId,workId}` 为归属，并保持到 Session／切换
意图的因果引用；不得为归因虚构用户 Run。工具/模型的逻辑调用分别有 `callId` /
`requestId`；每个实际尝试有新的 `attemptId`，重连沿原 attempt，不算新尝试。
每个执行所有者的 `epoch` 和每份运行资源的 generation 区别于业务身份。

引用一次具体的工具调用尝试使用 `CallRef={WorkOwner,callId,attemptId}`，引用一次具体的
模型尝试使用 `AttemptRef={WorkOwner,attemptId}`；`WorkOwner` 是 `StepRef` 或 `WorkRef`。
两者已经包含 attempt，其它契约中写作"调用与 attempt"的位置由这一个结构承载，不另设
并列字段。

**CD-02**：跨边界请求显式传递可信主体、tenant、目标、操作和因果引用；引用本身
不授予读取、写入或控制权。身份认证、成员/委托权限与因果发起者分别保留。
工具和模型操作都必须关联所属 Step 或具名辅助工作，以便拒绝、费用和恢复归因。
运行对象、Context、句柄、AbortSignal、函数和凭据原文不进入持久数据。

**CD-03**：共享内容为有序块序列；每块有稳定 `blockId` 和明确种类：
`text`、`image`、`audio`、`video`、`file`、`reasoning`、`tool_call`、`tool_result`、
`system_reminder`、`deferred_receipt`。同一份内容记录服务历史、模型请求装配与客户端
呈现三种消费，差异只在投影，不另建第二套块词汇。

`reasoning{form: text | summary | encrypted, text, opaque, format, signature}` 是模型
实际提供的推理内容。三种形态都进耐久记录：加密形态必须保存，因为同一供应方族的下一次
模型请求要原样回传才能保持上下文完整。面向用户的投影与出站流只给明文，没有明文时退回
摘要，加密形态从不流出，历史投影只显示存在加密推理，其原件只经模型执行能力的私有记录
与读面取回。模型未提供的内部推理仍不被构造为内容；实际提供、允许保留的辅助内容须具名
来源与披露策略。

`system_reminder{reminderKind, ref, outcome, body}` 是系统向模型说话的唯一块种类，
`reminderKind` 恰四值并分两类。引用类 `late_result` 与 `human_answer` 只携带被引用结果的
`ref` 与其结论 `outcome`，不复制正文：该结果已有自己的耐久记录，投影按 `ref` 解析，不产生
第二份正文。两者的 `ref` 都是 `CallRef`：`late_result` 指向被占位的调用，`human_answer` 指向
内建 `human` 调用（人类请求附属于调用，不被独立引用）。正文类 `hook_context` 与 `system_notice` 的
正文在 `body` 里，`hook_context` 另带产生它的 `ref{handler, site}`。按模型族投影为哪一种
供应方消息由模型执行能力决定，投影不改写正文。

`deferred_receipt{call, reason, notice}` 表示被引用的调用尚未结算而不是终态结果；`reason`
恰六值 `detached_background | background_from_start | waiting_approval | waiting_human |
staged_provisional | foreground_pending`。模型适配器须保持占位与结果的区分，不能伪造答案
来满足供应方工具消息的成对格式。上一 Step 的每个 `tool_call` 在下一 Step 的切点恰得到一个
块：已结算并裁决为接续的给 `tool_result`，其余给 `deferred_receipt`；何时开这一 Step、如何
合批由 Run 驱动器决定。占位不放进 `tool_result.value`。

`tool_call{call, action, validation, raw}` 有两种成立方式：`validation: accepted` 时带已解析的
`call` 与 `action`；`validation: rejected{reason}` 时没有 `call` 与 `action`，保留模型原始片段
`raw{name, arguments}`——模型确实提出过这次调用，真实结局不能丢，也不能因此变成可执行的
Action。`tool_result{call, outcome, value}` 的 `value` 是 CD-05 的 `Result`，其 `content` 是嵌套的
内容块序列（限 text/image/audio/video/file），与块的 `outcome` 取同一结论词。投影选择器
（[TL-13](../../../capabilities/tools/v2/contract.md)）只能在模型投影里把 `value` 换成
`blocked_by_hook{reason}`（S7 站点上任一投影选择器排除结果时的投影值，站点归
[RD-19](../../../capabilities/run-driver/v3/contract.md)，[external-hooks v1](../../../capabilities/external-hooks/v1/contract.md)
是其消费者之一），耐久的 `tool_result` 块与历史呈现不变；`blocked_by_hook` 只是投影值，不是本
契约的耐久形状。

一次输出被截断或部分失败时，完整且已耐久的块照常保留，被截断的文本与推理块保留已流出
的前缀作为块内容；不完整与缺失逐条记为 `missing{blockId, kind, reason}`。本版固定
`reason: truncated` 表示"有前缀但不完整"，其余原因由产生该清单的能力定义。未取得耐久
引用的媒体与被装配器丢弃的调用没有块，只有 `missing` 条目；缺失不能被成功说明文字掩盖。

`Origin` 说明一条内容记录由谁产生，恰六种：`user_input{input{inputId,revision}, acceptedBy}`、
`model_attempt{attempt: AttemptRef, provider, model, actualModel}`、`tool_settlement{call: CallRef}`、
`human_answer{request: RequestRef, answeredBy}`、`hook{handler, site}`、`system{notice}`。本版
只固定"谁产生"这一轴；更完整的来源描述尚未定义，不得由消费者各自补造。

非文本块引用受治理媒体或精确调用；文件名和宿主路径不代替原件。
输入/输出投影说明每块是模型原生消费、仅作工具可用附件或明确失败，不静默丢块。
媒体块以 delivery=model_native/agent_attachment 保留这项意图；实际投影还须
核对目标能力，不因此字段便声称已发送。输出原生媒体沿原生路径记载，后续
模型消费仍重检；失败记录由调用／输出状态表达，不制造假的空媒体块。

普通用户 Input 仅接纳 text/image/audio/video/file；`reasoning`、`tool_call`、`tool_result`、
`system_reminder` 和 `deferred_receipt` 由模型执行、工具执行、HITL 或系统权威产生，不能经
用户输入导入为可信事实。粘贴结果说明可作为普通文本，但不改变调用状态或构造可信工具
上下文。

`MediaRef={tenantId,mediaId}` 指向不可变字节和已核实的摘要、长度、MIME；文件名
是元数据，存储地址是提供者私有信息。派生内容使用新 mediaId 并引用来源及处理
动作，不能用转写结果替换原音频却保留原身份。远端临时 URL 不构成耐久媒体引用。

**CD-04**：`Action` 是经命令参数校验、声明解析和实际对象解析后的不可变数据，
至少绑定调用身份、定义版本／命令、声明版本／实现绑定、目标环境、全部影响权限
判定的参数和规范资源对象、所需权限、影响说明及允许的确认路径。批准匹配使用
这些结构值的精确比较；摘要只作索引和完整性辅助，不靠含糊拼接或模型自报生成。
机密参数以不可变秘密版本引用进入记录；秘密轮换或目标解析变化若改变动作含义，
产生新动作，不暗中沿用旧批准。准入后实现接收冻结后的同一参数和资源绑定。

Action 的 attemptId 在 proposed 时分配，仅标识此次待准入尝试；实际执行
身份和执行许可在准入后建立，分配 ID 不代表接纳或执行。换实际尝试产生
新的 Action 和当前判定，不能借相同 callId 复用旧批准。数据 Schema 固定
RunRef.session、StepRef.run 等嵌套字段；同一结构内所有 tenant 必须满足
该操作已核实的归属关系，JSON Schema 的结构验证不代替此动态授权校验。

## 命令声明与调用结果

**CD-05**：`ToolDefinition` 的每条 `Command` 除输入／输出 Schema、授权声明、`effect`、
`requiredSkills` 与 `environmentCapabilities` 外，声明以下执行面字段。本条只固定形状与
取值集合；各值的含义、可声明条件的核实、状态转移与准入判定归
[tools v2](../../../capabilities/tools/v2/contract.md)。

- `background.startModes ⊆ {on_start, auto}`：`mode = supported` 时必填且非空，说明该命令
  允许的启动方式——`on_start` 为启动即后台，`auto` 为前台启动。
- `foreground{limitMs, onLimit: keep_waiting | detach | stop}`：可选，缺省等价于
  `onLimit: keep_waiting`。`detach` 只在 `background.mode = supported` 且 `startModes ∋ auto`
  时可声明；`stop` 只在 `stop.capability ≠ unsupported` 时可声明。有效阈值是
  声明值与系统上限的较小者，两个数值与计时来源在准入时记录到调用。本字段取代 v1 的
  `BackgroundDeclaration.automatic{thresholdMs, stopMarginMs}`：`thresholdMs` 等价于
  `limitMs` 加 `onLimit: detach`，`stopMarginMs` 随 Run 级执行预算一并删除。
- `concurrency: serial | parallel_safe`：可选，缺省 `serial`。
- `stop{capability: cooperative_fence | forced_isolation | unsupported}`：取代 v1 的
  `cancellation: supported | unsupported`。声明 `unsupported` 的命令不能声明
  `background.mode = supported`，也不能声明 `onLimit: stop`。
- `media{inputs: [{param, kinds, formats, maxBytes}], outputs: [{kinds}]}`：可选。`param` 是
  指向本命令输入参数的 JSON Pointer，被指参数的值形状是 `MediaRef`；`kinds` 取
  `image | audio | video | file`。
- `frames: [{kind, payloadSchema, recordLevel: critical | durable | transient, media, render,
  maxBytes}]`：可选，无声明即无帧。`kind` 在同一命令内唯一，`recordLevel` 缺省 `durable`。
  `render{kind, version, language}` 是呈现标识，其呈现意图词表由
  [message-stream v1](../../../capabilities/message-stream/v1/contract.md) 拥有；语义不依赖它。

工具在 manifest 上有两种范式，`projection` 取 `single | compact | oneOf`：命令表恰一条时可用
`single`，顶层 Schema 就是该命令的 `inputSchema`，没有 `command` 层；多命令工具缺省
`compact`，即 `{command, params}`，也可按预算展开为每命令一个分支的 `oneOf`。投影只是 manifest 的派生，调用、过程、费用与审计仍定位到具体
`commandKey`；参数在解析 `Action` 前按具体命令的 `inputSchema` 完整校验。保留参数名
`detach`、`command`、`params` 不得出现在 `inputSchema`。调用级 `detach: on_start | auto` 只在
`startModes` 含两种启动方式时出现，`on_start` 请求启动即后台，`auto` 是缺省的前台启动；
它不能否决定义声明的 `onLimit: detach`。该参数剥离后记为调用的 `requestedRelation`，不进
`Action.params`，准入后不改。声明侧的 `startModes` 与调用侧的 `detach` 取同一取值集合：
声明说明允许哪些启动方式，调用在该子集内选择。

一次调用的结果形状是
`Result{outcome, output, content, error{code, message, retryable}, possibleEffect}`，
`outcome` 恰七值
`succeeded | failed | interrupted | unknown | denied_before_execution | cancelled_before_execution | unavailable`。
`output` 按该命令的 `outputSchema` 校验，结论不含规范输出时为空；`content` 是
text/image/audio/video/file 的有序块序列，媒体块带 `delivery`；`possibleEffect` 表示派发意图
已耐久而终态不明。哪些 `outcome` 可达、是否消耗 attempt、以及结果如何进入模型，归
tools v2 与模型执行能力；本条只固定记录形状。

## 与上一版的差异

| 条款 | 性质 | 来源裁决 |
|---|---|---|
| CD-01 增加 `CallRef` / `AttemptRef` 承载 attempt 的澄清 | 澄清 | 由 CD-01 原文与消息模型 §1 的引用写法统一得出，无单独裁决 |
| CD-03 内容块种类增加 `reasoning` | 兼容扩展 | 用户裁决 U-49 |
| CD-03 内容块种类增加 `system_reminder` 及其两类规则 | 兼容扩展 | 用户裁决 U-46、决定点 ac；两类划分为消息流第二轮裁决 R13 |
| CD-03 `deferred_receipt` 改为 `{call, reason(6), notice}` | 语义变化 | 作者裁决 9 增补 `foreground_pending`；一份词表见消息流第二轮裁决 R13 |
| CD-03 `tool_call` 增加 `validation` 与 `raw` | 兼容扩展 | 消息流第二轮裁决 R12、工具第三轮裁决 18 |
| CD-03 `tool_result.value` 固定为 `Result`、`content` 可嵌套内容块 | 兼容扩展 | 缺口表 CD-03/04 行、结果形状 |
| CD-03 固定 `missing{blockId, kind, reason}` 与截断保留前缀 | 兼容扩展 | 消息流第二轮裁决 R16 |
| CD-03 固定 `Origin` | 兼容扩展 | 消息模型 §1、消息流裁决 R4 |
| CD-03 不可由用户输入导入的块种类扩展到 `reasoning`、`system_reminder` | 澄清 | 消息模型 §2 |
| CD-05 新增：`startModes`、`foreground`、`concurrency`、`media`、`frames`、两种 manifest 投影、保留参数与调用级 `detach` | 兼容扩展 | 作者裁决 i/j/k/l/m/n、用户裁决 U-42、U-46、维度总表 |
| CD-05 删除 `BackgroundDeclaration.automatic` | 语义变化 | 用户裁决 U-45、决定点 aa |
| CD-05 `Command.cancellation` 改为 `stop{capability}` 三值 | 语义变化 | 作者裁决 5、第三轮裁决 14 |
| CD-05 固定 `Result` 形状，`outcome` 增加 `unavailable` | 兼容扩展 | 缺口表 TL-07 终态词表行、结果形状 |
| CD-02、CD-04 | 原文不变 | — |
