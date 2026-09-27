# 来源与可复核观察

## 2026-09-27 第一方与组合复核

[300成员原件归档](first-party-and-joint-2026-09-27.tar.gz)，SHA256 `bd5bb7f26ed868e445d2c3559c18c1519afd5ecd05bd5d87a565bedb0f45ac67`，2395403字节，主线全部成员读回匹配。含三路222原文／工具工件、逐字段facts与JSON pointer、主线重算脚本／结果、五个新endpoint原文、实际脚本／请求／响应／oracle／费用账本和Node24.18.0环境。37身份源精确冻结，源SHA `c093ffe6f6115cd8c0ba0d6a88bab3cb6d9473e2b1fdd662c9180ad2df48fdb0`；没有官方定义采用。

原公开source manifest的HTTP headers／cookies在派生provenance索引移除，原manifest与原body摘要分别保留，不用派生索引复现原manifest哈希；原body字节保持。付费响应只在出现不相关账号身份时移除并记原／派生摘要，没有凭据内容或真实会话。原assistant／signature JSON值没有改写。报告和评审类模型输出只保留出处；其它native报告内容为**仅转述，未核原文**，不因222摘要匹配升格。

[本轮报告](reports/2026-09-27-first-party-and-joint.md)列主线亲核的第一方段、15个实际非流式样例和不支持的推广；研究记录不给项目选实现。原162暖读run保持下节范围。新增15笔均有原usage.cost，无新增未知费用协调假设；原账本185 settled／0 unsettled，合计USD1.285185289500000000。真实请求零重试，wrong checksum、zero reasoning、Unable to verify初轮和语法准备失败原件均保留。

离线复核：解包后按SHA256-manifest逐字核验；verify-facts.py只重算元数据及原件摘要，需将其hub路径指向独立恢复目录，并恢复原collections和official-identities.ts的位置，不改断言。请求脚本的三份工具依赖已随档；恢复tools/、将joint-probe放回独立副本tmp/model-request-runtime/joint-probe-2026-09-27。重发会产生新费用和观察，必须使用明确授权凭据与该campaign唯一**当前**账本；归档ledger只作证据，不作为新的预算。execution-receipts为主线据实际工具结果写的结构化摘要，非原始工具逐字转录。当前全部请求exec终态exit0；没有TTL、流式production、native-wire或37认证证据。

## 公开目录与实际请求

2026-09-27 读取 OpenRouter `/api/v1/models` 及 37 项 `/endpoints`，不加载凭据。随后显式加载用户授权的本机凭据文件，用 Node 24.18.0 `node:https` 固定 OpenRouter 地址、单供应商、禁回退、禁重定向、零重试，逐请求先预留再以实际 usage 结账。总预算 USD100、研究额度 USD50，所有请求使用同一排他账本。

[运行证据包](../../design/record/evidence/2026-09-27-probe-model-request-runtime/README.md)保存目录/配置/请求/响应与账务协调。公开归档移除不相关账号身份及凭据标签，源摘要与脱敏后摘要分别保留；不能用后者复现前者哈希。只包含合成消息，不包含真实会话正文。未给费用的三项请求采用限定账务核对假设，见各协调记录。

探针源码为 `tools/model-probe/`。快照在运行后取得，不声称所有早期请求来自完全相同源码字节；每条实际请求正文及原始上游 usage 是读数依据。

## 厂商文档声明

2026-09-27 核读 [OpenRouter 缓存文档](https://openrouter.ai/docs/guides/best-practices/prompt-caching)：描述自动缓存、显式块断点、Anthropic TTL 和 usage 中缓存读写计数；这是厂商声明。文档的例举模型与本次固定名单不完全一致，适用性须由路由实验限制。该文档还允许 session_id/prompt_cache_key；本项目已有身份规则禁止发送它们，不因上游提供而采用。

读取 [Chat Completions 文档](https://openrouter.ai/docs/api/api-reference/chat/create-a-chat-completion)，本次页面检索未找到 developer，不能据此宣布它不支持；实际 OpenAI 请求接受与角色优先级证明也不同。短板来自本次拒绝、元数据不完整与原型反例，不把厂商宣传转成无条件保证。

## 有限模型与真实原型

本次有限模型输入/配置、正向和否定输出、原始语法失败、实际命令与环境沿[同一运行包](../../design/record/evidence/2026-09-27-probe-model-request-runtime/README.md)读取。模型检查支持设计断言，不支持生产实现；真实 Cordis 原型支持其确切交错，不支持未测的停止、耐久或权限边界。
