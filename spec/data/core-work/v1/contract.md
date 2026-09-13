# 共享工作身份、动作与内容 v1

本契约身份为 `data.core-work`，版本 1。规范依赖：[共享基础身份](../../agent-runtime-identity/v1/contract.md)。

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

**CD-02**：跨边界请求显式传递可信主体、tenant、目标、操作和因果引用；引用本身
不授予读取、写入或控制权。身份认证、成员/委托权限与因果发起者分别保留。
工具和模型操作都必须关联所属 Step 或具名辅助工作，以便拒绝、费用和恢复归因。
运行对象、Context、句柄、AbortSignal、函数和凭据原文不进入持久数据。

**CD-03**：共享内容为有序块序列；每块有稳定 `blockId` 和明确种类：
`text`、`image`、`audio`、`video`、`file`、`tool_call`、`tool_result`、`deferred_receipt`。
deferred_receipt 引用尚待答的原 request/call/continuation，表示暂挂而非终态结果；
模型适配器须保持这种区分，不能伪造答案来满足供应方工具消息的成对格式。
非文本块引用受治理媒体或精确调用；文件名和宿主路径不代替原件。模型未提供的
内部推理不被构造为内容；实际提供、允许保留的辅助内容须具名来源与披露策略。
输入/输出投影说明每块是模型原生消费、仅作工具可用附件或明确失败，不静默丢块。
媒体块以 delivery=model_native/agent_attachment 保留这项意图；实际投影还须
核对目标能力，不因此字段便声称已发送。输出原生媒体沿原生路径记载，后续
模型消费仍重检；失败记录由调用／输出状态表达，不制造假的空媒体块。

普通用户 Input 仅接纳 text/image/audio/video/file；tool_call、tool_result 和
deferred_receipt 由各自执行／HITL 权威产生，不能经用户输入导入为可信事实。
粘贴结果说明可作为普通文本，但不改变调用状态或构造可信工具上下文。

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
