# 共享工作身份、动作与内容

当前接受版本：[v2](v2/contract.md)，接受依据
[D-015](../../../docs/decisions/D-015-tool-execution-message-stream-and-hooks.md)。
[v1](v1/contract.md) 为 superseded，保持冻结与可引用，未迁移的消费者继续按 v1，接受依据
[D-008](../../../docs/decisions/D-008-core-capabilities.md)。

v2 拥有的对象：身份与引用（`UserRef`、`MembershipRef`、`DefinitionRef`、`RunRef`、`StepRef`、
`WorkRef`、`CallRef`、`AttemptRef`、`RequestRef`、`MediaRef`、`ResourceRef`、`SecretRef`、
`OperationRef`）、`Input` 与 `InputBlock`、十种 `ContentBlock` 与 `Origin`、缺失标记
`missing`、`Action` 与 `Decision`、`ToolDefinition` / `Command` / `BackgroundDeclaration` 的
声明面、调用结果 `Result`、`Money`、`MediaMetadata`。结构由 [schema.json](v2/schema.json)
表达，`$ref` 按 `$id` 本地解析。

覆盖说明：本契约没有形式模型；Schema 是结构证据，语义承诺由正文给出，实际符合性由消费
这些形状的能力与其提供者验收。v1 的设计来源与当时的验证范围见
[core-capabilities 提案](../../../docs/proposals/core-capabilities/README.md)与
[验证范围](../../../docs/proposals/core-capabilities/verification.md)；v2 新增形状的来源是
[工具执行提案](../../../docs/proposals/tool-execution/README.md)与
[消息流提案](../../../docs/proposals/message-stream/README.md)。本版本为目标契约，源码
fork 不表示实现已符合。
