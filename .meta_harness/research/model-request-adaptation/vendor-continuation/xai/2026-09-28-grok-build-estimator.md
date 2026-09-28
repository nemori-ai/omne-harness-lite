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
