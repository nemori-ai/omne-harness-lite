# 原文、读取路径与证据边界

协议依据全部来自官方OpenRouter primary来源。搜索返回过非官方结果，未用作事实。本轮没有付费请求、raw诊断重取、env/密钥/账本读取、SDK安装、build或测试执行。

## E0 来源固定与取得

- 消费对象：R1–R6及候选待定项。
- 日期与版本：2026-09-29；docs 58426585252517e9cc38993b8c2681b355a960b0；SDK 17de251b8db278092c401347c9444741f155214d。
- 取得方式：GitHub公开commit API解析各repo main；tree API定位目标；随后只从完整SHA raw URL取原文字节，完整字节SHA256见[source-manifest.json](source-manifest.json)。官方web overview/streaming交叉读取。
- 来源立场：官方schema、作者SDK代码和官方文档，是作者协议/实现说明，不是当次供应商响应观察或独立运行证据。
- 支持范围：版本化源码/文档结论。没有把读取源码说成SDK执行；hash可复取比对，但本 topic 不保存上游完整源码；完整 SHA URL 可复取并校验。
- 原调查读取了当前 reader 的他方报告。设计作者另核 301f9e00 的 stream.ts、CB3/MR9 和 v6/v12 映射；没有付费请求、原始付费响应读取或本轮产品测试。既有 16 测试结果只是他方报告，本 topic 不将其当实现证据。
- 独立复核：设计作者从清单的 16 个固定 URL 重取完整字节，全部与清单 SHA256 相等；实际读取关键 delta schema、finish/usage 文档与 SDK 结束路径。字节相等不表示 16 文件所有语义均已审核。

## E1 字段类型与含义

- 消费对象：R1、R2。
- 原始来源：[官方OpenAPI ChatStreamDelta](https://github.com/OpenRouterTeam/docs/blob/58426585252517e9cc38993b8c2681b355a960b0/openapi/openapi.yaml#L7435)、[ChatAssistantMessage](https://github.com/OpenRouterTeam/docs/blob/58426585252517e9cc38993b8c2681b355a960b0/openapi/openapi.yaml#L6310)；[SDK Delta类型](https://github.com/OpenRouterTeam/typescript-sdk/blob/17de251b8db278092c401347c9444741f155214d/src/models/chatstreamdelta.ts#L42)、[Delta schema](https://github.com/OpenRouterTeam/typescript-sdk/blob/17de251b8db278092c401347c9444741f155214d/src/models/chatstreamdelta.ts#L76)；[SDK assistant refusal](https://github.com/OpenRouterTeam/typescript-sdk/blob/17de251b8db278092c401347c9444741f155214d/src/models/chatassistantmessage.ts#L87)。
- 实际观察：refusal描述为拒答消息增量；string或null，无required/minLength；content为独立string/null属性；同一个object schema并存，未设二者oneOf排他。assistant完整消息refusal也是独立成员。
- 支持范围：合法值域与消息增量的文本性质；不是把所有非空未知值string化的许可，不是provider真实共存/时序证明。可缺席/null/空串不会自行构成有内容。
- 局限：官方说明没有明确必须显示、必须持久区分、具体安全原因或和content同帧排序；这些保持未知或交适配候选。
- 后续核对：相关schema变化时重核；不用Responses的response.refusal.delta代替Chat字段。

## E2 收尾计量与顺序

- 消费对象：R3、R4。
- 原始来源：[固定overview finish reason](https://github.com/OpenRouterTeam/docs/blob/58426585252517e9cc38993b8c2681b355a960b0/api_reference/overview.mdx#L448)、[usage时点](https://github.com/OpenRouterTeam/docs/blob/58426585252517e9cc38993b8c2681b355a960b0/api_reference/overview.mdx#L317)；[固定streaming末尾usage帧](https://github.com/OpenRouterTeam/docs/blob/58426585252517e9cc38993b8c2681b355a960b0/api_reference/streaming.mdx#L262)、[中途错误](https://github.com/OpenRouterTeam/docs/blob/58426585252517e9cc38993b8c2681b355a960b0/api_reference/streaming.mdx#L449)；[官网streaming](https://openrouter.ai/docs/api_reference/streaming)、[官网overview](https://openrouter.ai/docs/api_reference/overview)；[SDK choice](https://github.com/OpenRouterTeam/typescript-sdk/blob/17de251b8db278092c401347c9444741f155214d/src/models/chatstreamchoice.ts#L27)、[finish枚举](https://github.com/OpenRouterTeam/typescript-sdk/blob/17de251b8db278092c401347c9444741f155214d/src/models/chatfinishreasonenum.ts#L10)、[usage成员](https://github.com/OpenRouterTeam/typescript-sdk/blob/17de251b8db278092c401347c9444741f155214d/src/models/chatstreamchunk.ts#L94)。
- 实际观察：规范化finish名称为tool_calls/stop/length/content_filter/error，native_finish_reason单列。正常stream的usage在[DONE]前最后帧，空内容delta但choices非空，重复finish_reason/native_finish_reason；按计量帧理解重复收尾。顶层error另为错误信息通路，HTTP已200也可出错。
- 支持范围：字段职责及正常尾帧次序。所读材料没有refusal到content_filter/stop/error的必然映射；schema独立允许不等于服务会产生所有组合。
- 局限：官方正常尾帧说明不能推广为abort、断网、坏协议或reader先stop后必得usage。计量缺席按未知；不能推断实际Opus以后一定还有帧。
- 后续核对：尾帧形状或规范化映射变化时重核；native词不得未经核实便套本项目outcome。

## E3 官方 SDK reader 行为

- 消费对象：R2、R3、R5。
- 固定控制路径：
  1. [chatSend:331–332](https://github.com/OpenRouterTeam/typescript-sdk/blob/17de251b8db278092c401347c9444741f155214d/src/funcs/chatSend.ts#L331)对200 JSON/SSE选择响应schema。
  2. [response schema:105–120](https://github.com/OpenRouterTeam/typescript-sdk/blob/17de251b8db278092c401347c9444741f155214d/src/models/operations/sendchatcompletionrequest.ts#L105)创建EventStream；data等于[DONE]返回done，否则用ChatStreamingResponse解析并交出data。
  3. [ChatStreamingResponse:23–40](https://github.com/OpenRouterTeam/typescript-sdk/blob/17de251b8db278092c401347c9444741f155214d/src/models/chatstreamingresponse.ts#L23)对字符串data作JSON.parse，接ChatStreamChunk schema。
  4. [ChatStreamChunk](https://github.com/OpenRouterTeam/typescript-sdk/blob/17de251b8db278092c401347c9444741f155214d/src/models/chatstreamchunk.ts#L145)验证choices及可选usage；[Choice:48–55](https://github.com/OpenRouterTeam/typescript-sdk/blob/17de251b8db278092c401347c9444741f155214d/src/models/chatstreamchoice.ts#L48)验证delta并改finish_reason为camelCase。
  5. [Delta:76–90](https://github.com/OpenRouterTeam/typescript-sdk/blob/17de251b8db278092c401347c9444741f155214d/src/models/chatstreamdelta.ts#L76)保留合法refusal，不转content，不因其非空抛错。
  6. [EventStream:39–84](https://github.com/OpenRouterTeam/typescript-sdk/blob/17de251b8db278092c401347c9444741f155214d/src/lib/event-streams.ts#L39)逐SSE记录解析/enqueue；done时cancel/close；异常时error/cancel，无未来usage错误排空分支。
- 实际观察：此路径不检查refusal或finish_reason来提前结束，不替usage填值。schema通过且下游继续读时，可交付refusal及后续计量chunk。
- 支持范围：低层chat.send源码阅读推导，未实际运行。Responses转换器与只打印content的示例不替代此路径；已读stream-transformers仅用于避免误归因。
- 局限：未执行Zod/reader，不评价或采用SDK缺省重试、租户、存储和高级Agent API。
- 后续核对：operation schema、EventStream、Delta或finish退出逻辑改动时重核。

## E4 本地契约及实际诊断边界

- 消费对象：R6及不猜测真实响应的限制。
- 本地原始依据（HUB 301f9e00）：
  - .meta_harness/design/spec/data/content-blocks/v3/contract.md:274–299 S8：text为人/模型可读字符串；origin闭合四种命令/skill来源。
  - .meta_harness/design/spec/data/model-response/v9/contract.md:303–355 S12/S13：outcome四值、reply与delivered/failure/firstTokenAt条件；420行首内容定义。
  - .meta_harness/design/spec/data/messages/v6/contract.md S10：reply ending三值。
  - .meta_harness/design/realization/packages/model/pi-ai-transport/design.md:129–142：当前拒绝非空refusal。
  - 原调查输入的 reader 诊断报告为任务级材料，不是本 topic 的长期规范依据；本段将其作为明确的他方转述。
- 实际观察：text承载字符串不等于来源/收场策略已决定；MR9四值不能误说三值。当前拒绝是已接受映射，不是本研究自动判定的代码bug。
- 他方报告转述：Opus5公开诊断只有固定localError；unsupportedDeltaMembers由错误派生；公开结果无blocks且账未知；16本机既有测试通过。此处未读付费raw或重跑，不能由此推导真实refusal类型/内容/原因/同帧/后帧。
- 支持范围：本地类型表达力、当前映射边界与已报告事实强度。没有新拒答块、origin枚举、失败值、raw日志或安全分类设计。
- 后续核对：候选需明确采纳性质和正反例，采用后才进入实现；不以缺raw为由再次付费。
