# xAI Grok Build 输入估算源码窄核验

2026-09-28 UTC。对象是 xAI 第一方 `grok-build` 的固定 commit
[`f0e3be1100ef5252488e3be8bb0e91cf68d8c305`](https://github.com/xai-org/grok-build/tree/f0e3be1100ef5252488e3be8bb0e91cf68d8c305)，
而不是本项目的 OpenRouter 请求。取得方式：`git ls-remote ... HEAD` 记录 commit；从
`raw.githubusercontent.com` 按该 commit 下载下列两个文件，并核原文及 SHA-256。

| 第一方源码 | SHA-256 | 本次观察 |
| --- | --- | --- |
| [`xai-token-estimation/src/lib.rs`](https://github.com/xai-org/grok-build/blob/f0e3be1100ef5252488e3be8bb0e91cf68d8c305/crates/codegen/xai-token-estimation/src/lib.rs) | `34d5ed8c29ded692084fb4b8cf8c4f0e17d13e62e4b5faab7a84a9b5f5c19b8c` | `BYTES_PER_TOKEN=4`、`IMAGE_TOKEN_ESTIMATE=765`；文本按 UTF-8 字节整除 4，图像按数量乘常数。 |
| [`xai-chat-state/src/actor/state.rs`](https://github.com/xai-org/grok-build/blob/f0e3be1100ef5252488e3be8bb0e91cf68d8c305/crates/codegen/xai-chat-state/src/actor/state.rs) | `ce8c406d9abbcdbebeac0027b6d8951e695f9a03fb82601d22fb7bb480c4c0af` | 内部 `ConversationItem` 分支分别计 system、user、assistant、tool result、reasoning；工具声明计名称、描述和 JSON 参数；user 图像按固定项；注释明确这是 Grok Build 的 compaction/预算 estimate，其他 host 可使用真正 BPE。 |

此观察说明第一方确有结构化输入估算候选，**不证明**常数或字段映射适用于 `x-ai/grok-4.6`、`x-ai/grok-4.7` 经 OpenRouter 固定 `xai` 的最终 Chat Completions 请求。源码不计本项目 serialized 的 OpenRouter provider 包装、system reminder、reasoning replay、工具协议开销或网关变换；固定图像常数没有展示尺寸、裁剪、网关处理或这两型号的依据。它也没有给估计误差界。不能从“第一方 CLI 使用”推出当前 route 完整估算已符合 `data.model-profile/v6#S-8` 与 `capability.model-request-runtime/v9#S-74`。

已有 [xAI TokenizeText](https://docs.x.ai/developers/grpc-api-reference/tokenize) 是文本接口；本次没有调用凭据接口或模型。若上游换 commit、两型号的协议或 OpenRouter 处理有变化，本读数须重新核验。未系统搜索 xAI 私有实现，故“没有其他算法”不是本报告结论。

## 同轮补充：固定路由与完整历史的边界

再次逐函数核对该固定 commit：`estimate_tool_tokens` 对名称、描述和 JSON 参数求 UTF-8 字节和再除以 4；`estimate_item_tokens` 对 assistant 正文与工具调用参数求和，tool result 正文另计，user 文本加图片个数；reasoning item 把文本长度和估算解码后的密文长度取较大者，不把两份同义内容相加。其 `EstimatedItemTokenCounter` 明说其他宿主可插入真正 BPE。这些分支说明 CLI 并非只数最后一条 user；它们仍使用与 OpenRouter Chat Completions 不同的内部 `ConversationItem`，不提供本项目最终 JSON 的协议附加开销或模型误差界。[源码 state.rs](https://github.com/xai-org/grok-build/blob/f0e3be1100ef5252488e3be8bb0e91cf68d8c305/crates/codegen/xai-chat-state/src/actor/state.rs#L1065-L1235)。

[xAI Grok 4.7 推理文档](https://docs.x.ai/developers/model-capabilities/text/reasoning)在 2026-09-28 读取时称 4.7 的 Responses API 回传 `reasoning.encrypted_content`，可在下一次 Responses 请求原样回送；同页明确 Chat Completions 没有该密文字段。这个陈述不能推出 OpenRouter `reasoning_details` 的签名或其内部 token 组成，也不能把密文长度当本路由真实推理输入 token。[xAI TokenizeText](https://docs.x.ai/developers/grpc-api-reference/tokenize)明确只对一段 `text` 与指定 model 返回 token 序列，不处理本项目的消息角色、工具 schema、图像或网关包装。

[xAI 模型目录](https://docs.x.ai/developers/models)在该时点把 4.7 列为 text/image 输入，给出原生 image 一般限制（20 MiB、JPEG/PNG、图数不设限），并称 Chat API 可混排角色；这些是 xAI 原生 API 事实，不等于 OpenRouter 固定 `xai` endpoint 的图像成本/限制。[OpenRouter 图像输入文档](https://openrouter.ai/docs/guides/overview/multimodal/image-understanding)解释 data URL 入口，但没有给这两个固定路由可复用的每图 token 公式。本轮只核这些指定页面，没有测试不同尺寸、图数或 gateway 重写；因此 Grok Build 的 765/图是待校准粗估，不是图像上界。真实 image、tool-history 和 opaque replay 的当前能力仍须分别从生产最终计划与上游结果核实。
