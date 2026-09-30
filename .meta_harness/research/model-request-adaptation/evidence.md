# 来源与可复核观察

## 2026-09-30 DeepSeek 旧原件与上游映射

[本轮报告](reports/2026-09-30-deepseek-reasoning-history.md)列出 HUB 忽略目录 `tmp/model-request-runtime/` 中实际 Pro／Flash 回包、六次 public、Flash image／service、Pro service 失败日志的路径与 SHA256；它们没有归档入库，文件仍需按哈希逐件确认。报告同时定位 DeepSeek 原生 Thinking Mode 原文、固定 Flash encoder、pi 0.86.1 快照与 omne-next 固定检出。首轮两份真实回包中可见 `reasoning.text` 与 thinking block 相等；这并不解释 `format="unknown"` 的一般语义，也不构成 DeepInfra 预发 token 真值。此轮只读，无模型请求或账本修改。

## 2026-09-28 输入计量来源与离线复现

[主线报告](reports/2026-09-28-input-meter-sources.md)对应[241 成员归档](input-meter-research-2026-09-28.tar.gz)，1,461,523 字节，SHA256 `59864709a9f3d48e0de38733443d0c2995cc23e8f237740536f5b812146e688a`。内含 `SHA256-manifest.json` 及 240 个逐字摘要工件；主线读回全部匹配。`anthropic/`、`closed/`、`open/` 为三路原交付，`root/` 为主线独立复现和七个关键原文重新 GET 的收据。原报告是作者输出，不因归档或摘要通过成为独立证据。

主线亲核范围：Anthropic 官方 token-counting 页和固定 ctok README 的能力／已知差异；pi 与 OpenCode 固定估算函数；OpenAI input-token count、Google Developer countTokens、Cloud 3.7/3.8 支持列表和 xAI TokenizeText 页；DeepSeek 两版 encoder、Flash image processor／配置、Qwen 2.4T 商业差异说明、Moonshot estimate API 和 ZAI tokenizer schema。前述七项原文重新下载的字节与作者一致，URL、时间、摘要见 `root/source-refetch.json`。tiktoken／Google loader 和公开模板还通过实际离线抽取执行核验具体分支。

主线独立环境重跑结果见 `root/*-result.json`：Claude 历史 66 项及五条合成文本一致；OpenAI／Google 映射及 JSON 数值、开放模型模板／图片数学探针解析后完全一致。首次 Claude 核验缺少 JS 第二步导致字段不齐，补完整复现步骤后通过；未修改期望数值。66 项期望是上游作者历史采集，**本轮没有独立取得的 API 真值**。图像探针不解码图片；模板探针记录字节而非 token。复现方法见 `anthropic/evidence/REPRODUCE.md`、`closed/README.md`、`open/report.md`；大的 ctok／o200k 词表按固定清单重新下载，不将缓存或 venv 归档。

主线逐字核对来源 manifest 的 38 个 Anthropic 工件、123 个开放模型工件，以及 41 个 closed 工件的压缩前后摘要；这是完整性核验。原稿中的其他社区 issue、DSH／omne-next 扩展调用链、各模型许可具体适用判断，以及未列入前述亲核范围的叙述仍为**仅转述，未核原文**。公开仓列表由固定下载资料定位，不把词表上游元数据摘要称为已下载验证。官方页是厂商声明，社区样本是作者记录，两者均没有当前 OR route 等值保证。

查重与差异处理：三路重复读取的 OpenRouter overview／公开索引只算一项“此次未找到统一预发计数端点”的观察；403 原始下载与浏览工具读到文本不冲突，浏览摘取不提供 HTTP 原件摘要。Google Cloud 明确覆盖与本地 loader 拒绝也不冲突，二者是不同接口。三个报告没有发现需择一采信的计数结果冲突。closed 原稿的“另行授权”指作者任务未获在线请求权限；它不撤销主线已有授权，也不构成本项目新增审批条件。本轮零厂商计量／推理请求，不更新付费账本，不改变 37 模型认证数。

## 2026-09-27 首两个 OpenAI 固定 route 的窄复核

[本轮读数](reports/2026-09-27-first-two-openai-routes.md)只复核 Sol/Luna 两个固定 openai route，不重查其余35项。[63成员原件归档](first-two-openai-routes-2026-09-27.tar.gz)为463186字节，SHA256 `f7f4509648450cb30db1f0079e9ba8110afe961ea47724d65725bef5fdfa038d`；原62工件manifest SHA `41e2e353117c07fb30948dcb315ec1d542e24aa9b4c2ad8cab91c922727879a5`，主线全部成员逐字读回。官方MCP Markdown与真实HTTP body分别标明取得方式；型号页的首次精确时间未记录，不能补造。

两个新的免费endpoint GET均HTTP200，无凭据访问或模型请求。逐图限制、部分参数条件、native TTL与bridge配置的差别及版本复核信号保持原观察范围；未知不改成空约束或drop。本run没有缓存命中、流式公开制品、输入边界或official认证证据；不重置原付费ledger。包内作者REPORT及首次工具失败原样保留，后续方案选择不在研究中接受。

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
