# 工具调用与结果消息的共享边界

Model 和 Tool 通过消息值协作，不互相消费运行时、注册表或领域定义。内容块形状归 [content-block](../../content-block/docs/public-api.md)，消息身份、角色及调用关联归本包。

下列 ToolCallPart 是尚未实现的精确形状候选。当前 [源码](../src/index.ts) 的 ToolPart 只校验 kind、非空 callId 和 JSON 负载，尚不校验 name 与 arguments。实现接管后，本页改为源码导航。

```ts
import type { JsonValue } from '@omne-harness/json-text'
import type { Message, ToolPart } from '../src/index.js'

export type ToolCallPart = ToolPart & Readonly<{
  kind: 'tool_call'
  callId: string
  name: string
  arguments: JsonValue
}>
export type ToolMessage = Message & Readonly<{ role: 'tool' }>
```

ToolCallPart 表示一个已封闭的调用建议。callId 与 name 必须非空，arguments 必须是完整 JSON 值。响应中的半截参数继续留在 Model 的流状态，不构造成 ToolCallPart。共享值校验不检查工具存在、参数是否符合工具业务 schema、当前调用资格或执行结果。

JsonValue 采用 json-text 的带 kind 值树，保留数字词法等解析事实。它不是任意 JavaScript 对象；跨供应商或工具参数编码边界须使用该值树的明确编码，不能把值树直接 JSON.stringify 后当成原参数。

callId 关联模型建议与其工具结果消息，不自动等于 Tool 的托管调用身份。协调者保存消息 callId 到原 ToolCall、结果版本和消费位置的映射。重放消息不重新执行工具。供应商 ID 的命名空间和转换由 Model 适配器维护，不能因更换供应商丢失原关联。

ToolMessage 是 Message 的 tool 角色视图，不增加消息身份。工具结果关联通过现有 tool_result 部分的 callId 表达；正文使用共享内容块。消息投影只交付获准披露的内容，不携带 executor、运行时句柄、ToolDefinition、授权凭据或私有结果保管对象。Tool 的 data 与 original 不因消息角色而自动成为模型输入。

模型请求中的可用动作声明是 [Model 请求契约](../../../model/model-contract/docs/public-api.md#根入口的值与请求)，不是日志消息，也不是本包拥有的工具定义。请求组装者负责定义投影和多命令路由。本包不登记工具、不选择命令、不装配供应商请求。

## 验证义务

验证完整调用关联、空名称拒绝、非 JSON 参数拒绝、半截参数不能成为完整调用，以及 ToolMessage 与原结果映射的接续。共享 ref 的消息校验仍须与 content-block 同步实施。类型候选及现有宽 ToolPart 不能证明上述运行校验已经存在。
