# 来源与可复核观察

## 公开目录与实际请求

2026-09-27 读取 OpenRouter `/api/v1/models` 及 37 项 `/endpoints`，不加载凭据。随后显式加载用户授权的本机凭据文件，用 Node 24.18.0 `node:https` 固定 OpenRouter 地址、单供应商、禁回退、禁重定向、零重试，逐请求先预留再以实际 usage 结账。总预算 USD100、研究额度 USD50，所有请求使用同一排他账本。

[运行证据包](../../design/record/evidence/2026-09-27-probe-model-request-runtime/README.md)保存目录/配置/请求/响应与账务协调。公开归档移除不相关账号身份及凭据标签，源摘要与脱敏后摘要分别保留；不能用后者复现前者哈希。只包含合成消息，不包含真实会话正文。未给费用的三项请求采用限定账务核对假设，见各协调记录。

探针源码为 `tools/model-probe/`。快照在运行后取得，不声称所有早期请求来自完全相同源码字节；每条实际请求正文及原始上游 usage 是读数依据。

## 厂商文档声明

2026-09-27 核读 [OpenRouter 缓存文档](https://openrouter.ai/docs/guides/best-practices/prompt-caching)：描述自动缓存、显式块断点、Anthropic TTL 和 usage 中缓存读写计数；这是厂商声明。文档的例举模型与本次固定名单不完全一致，适用性须由路由实验限制。该文档还允许 session_id/prompt_cache_key；本项目已有身份规则禁止发送它们，不因上游提供而采用。

读取 [Chat Completions 文档](https://openrouter.ai/docs/api/api-reference/chat/create-a-chat-completion)，本次页面检索未找到 developer，不能据此宣布它不支持；实际 OpenAI 请求接受与角色优先级证明也不同。短板来自本次拒绝、元数据不完整与原型反例，不把厂商宣传转成无条件保证。

## 有限模型与真实原型

本次有限模型输入/配置、正向和否定输出、原始语法失败、实际命令与环境沿[同一运行包](../../design/record/evidence/2026-09-27-probe-model-request-runtime/README.md)读取。模型检查支持设计断言，不支持生产实现；真实 Cordis 原型支持其确切交错，不支持未测的停止、耐久或权限边界。
