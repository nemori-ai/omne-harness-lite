# Qwen 商业叶：社区 harness 的推理历史回放、输入计量与缓存（2026-09-30）

- 对象：经 OpenRouter `alibaba` 固定路由或阿里云百炼／DashScope 直连的六个闭源商业叶 `qwen3.8-max-0902`、`qwen3.8-max-prime`、`qwen3.8-flash`、`qwen3.7-max`、`qwen3.7-plus`、`qwen3.7-flash`。
- 问题：主流 harness／SDK 在多轮里怎样回放 Qwen 的推理内容（`reasoning_content`／`reasoning`／`reasoning_details`），怎样估算或取得输入 token，怎样处理显式缓存；阿里与 OpenRouter 的官方说法是什么。
- 方法：零付费请求、零密钥。官方页面用 `curl` 取原始 HTML／Markdown 后抽文本逐字核对（一手）；harness 一律读发布包或固定提交的源码（一手），不采信搜索摘要；另外只读 HUB 私有目录的 batch8 三轮观察做了一次离线复算（见[下文](#本仓库-batch8-的离线复算推断级)）。
- 本页不改任何设计正文、契约、源码或此前研究页的结论；此前各页照旧成立于它们自己的范围。

## 结论先行

1. **阿里一手文档写明回放语义按型号不同。** 百炼 Chat Completions 参数参考：`preserve_thinking` 默认 `false`，但 `qwen3.8-max`／`qwen3.8-max-0902`／`qwen3.8-flash` 默认 `true`，且「必须将历史对话中所有的 `reasoning_content` 完整回传」、不得拼进 `content`；开启后历史 `reasoning_content`「计入输入 Token 数量并计费」。`qwen3.7-max`／`-plus`／`-flash` 支持该参数但默认关闭。阿里其他页面对同一件事有互相矛盾的说法（见[不一致](#阿里文档之间的不一致)）。
2. **离线复算（推断级）**：把 batch8 六叶三轮共 18 个真实请求，按固定的公开 Qwen3.8 模板与固定 tokenizer 渲染——3.8 三叶走「全部历史推理进 `<think>`、带 xhigh 说明」分支，3.7 三叶走模板里 `preserve_thinking=false` 分支（最后一条 user 之前的 assistant 不带 think 块）且去掉 effort 说明——18 个预测都恰好比上游 `prompt_tokens` 多 1，12 个轮间增量残差全为 0。当前的「可见 JSON 替身」在同一批请求上残差为 −186 到 +609。
3. **没有一家社区 harness 对 Qwen 商业叶做与型号匹配的本地分词。** pi、LangChain、Qwen Code 都是「上一轮上游 usage 作锚点＋字符比例近似新增部分」或 tiktoken／GPT-2 近似；DashScope SDK 与 Qwen-Agent 自带的是旧 `qwen.tiktoken`（151,643 个 rank），与 Qwen3.8 公开 tokenizer（248,044 词表）不是同一词表。OpenRouter 文档索引里没有预发计数端点。
4. **回放策略按端点分，不按开源／商业分。** 阿里自家的 Qwen Code 与 Vercel `@ai-sdk/alibaba` 在 DashScope 上显式发 `preserve_thinking: true` 并回传 `reasoning_content`；OpenRouter 侧 `langchain-openrouter`（Python）与 `@openrouter/ai-sdk-provider` 同时回传 `reasoning` 与 `reasoning_details`，pi 只回传 `reasoning_details`，Agents SDK 在同模型时只回传 `reasoning` 字符串，`ChatOpenAI`、`ChatTongyi`、`ChatQwen`、`@langchain/openrouter`（JS）丢弃推理。唯一带型号名单的是 `@ai-sdk/alibaba` 的 preserve 名单，它只列商业 ID。
5. **缓存断点只有阿里自家 harness 自动维护。** Qwen Code 默认在 system、最后一条消息的最后一个稳定块、最后一个工具上打 `cache_control`；其余要么交给调用方，要么对 OpenRouter 上的 Qwen 直接剥掉（LiteLLM）或不发（pi）。OpenRouter 缓存文档列出的 Alibaba 显式缓存型号不含 3.7／3.8，但 batch8 已观察到其中三叶的显式写入。

## 阿里云百炼／DashScope 的官方说法

取得方式：2026-09-30 13:07–13:18Z `curl -sL` 取原始页面，本地剥标签后逐字比对；下列 SHA-256 只标识本次取得的字节，页面是动态渲染的，原件未入库。

- [百炼 Chat Completions 参数参考（英文）](https://help.aliyun.com/en/model-studio/qwen-api-via-openai-chat-completions)（`ec6cb8c3…ad294`）：「`preserve_thinking` boolean (Optional) Default value: false ( Default value for qwen3.8-max/qwen3.8-flash: true )」；支持名单为 `qwen3.7-max`、`qwen3.7-plus`、`qwen3.7-flash`（及快照）、`qwen3.6-*`、`qwen3.8-max (enabled by default)`、`qwen3.8-max-0902 (enabled by default)`、`qwen3.8-flash (enabled by default)` 等；「When using qwen3.8-max/qwen3.8-flash, preserve_thinking defaults to true. You must send back all historical reasoning_content in the reasoning_content field. Do NOT concatenate reasoning_content into the content field.」；「When enabled, the reasoning_content from the historical conversation is included in the input token count and is billed.」
- [同页中文](https://help.aliyun.com/zh/model-studio/qwen-api-via-openai-chat-completions)（`fd417e24…b71`）：同义，「开启后，历史对话中的 reasoning_content 会计入输入 Token 数量并计费」。
- `qwen3.8-max-prime` 不在阿里任何一份所读名单里；它在 OpenRouter 上是独立 SKU，默认值只能靠观察推断。
- [深度思考（英文）](https://www.alibabacloud.com/help/en/model-studio/deep-thinking)（`c44357bc…1684`）与[中文](https://help.aliyun.com/zh/model-studio/deep-thinking)（`e4747ef1…e3bd`）：「preserve_thinking controls whether the Model reads historical assistant message reasoning_content … The Default Value of each model is based on Chat Completions Parameter Description」，并称思考内容按输出 token 计费。
- [QwenCloud Thinking](https://docs.qwencloud.com/developer-guides/text-generation/thinking)（`9755affc…342a`，Next.js RSC 负载中抽文本）：「By default, models do not read `reasoning_content` from the `messages` array in multi-turn conversations」；带工具时「include the assistant's `reasoning_content` when sending tool results back. Omitting it degrades accuracy」；`qwen3.8-max` 不允许同时设 `reasoning_effort` 与 `thinking_budget`。
- 固定公开模型卡 [Qwen3.8-2.4T-A95B@207bd685](https://huggingface.co/Qwen/Qwen3.8-2.4T-A95B/blob/207bd685a7e3696cfaff12ded7c6a7ea0f88c996/README.md)（`7690c680…f331`）：Qwen3.8-Max 是「based on Qwen3.8-2.4T-A95B with more features」的官方版本；「`preserve_thinking` is enabled by default for all workloads」；Qwen Cloud 用法是 `extra_body={"enable_thinking": True, "preserve_thinking": True}`。
- 固定公开模板（本仓库 `packages/model/pi-ai-transport/tokenizers/qwen-38-24t/chat_template.jinja`，SHA-256 `40ce34a5…5e4e`，第 25–30、65–72、88–96 行）：`reasoning_effort` 缺省为 `xhigh` 并在 system 前加一句 effort 说明；assistant 在 `preserve_thinking` 未定义或为真、或位于最后一条 user 之后时渲染 `<think>\n…\n</think>\n\n`，否则只渲染 `content`，**连空 think 块也不留**。

### 阿里文档之间的不一致

- 深度思考页与 QwenCloud 页的名单只把 `qwen3.8-omni-flash` 标为默认开启，没标 `qwen3.8-max`／`-0902`／`-flash`；参数参考则标了。batch8 的计数与参数参考一致（见下文），与前两页不一致。
- [多轮对话（英文）](https://www.alibabacloud.com/help/en/model-studio/multi-round-conversation)（`b1d12bcf…d7a`）与[中文](https://help.aliyun.com/zh/model-studio/multi-round-conversation)（`38167337…ee55`）仍写「更新 messages 数组时，仅保留 content 字段，忽略 reasoning_content 字段」「添加上下文时请勿添加reasoning_content字段」，与参数参考对 3.8 的「必须完整回传」直接冲突。
- [文本生成 FAQ（中文）](https://help.aliyun.com/zh/model-studio/text-generation)（`1b441663…7ff23`）：向 `qwen3.8-max` 发 `你好` 时实际输入是 `<|im_start|>user\n你好<|im_end|>\n<|im_start|>assistant\n<think>`、共 11 token——**没有**公开模板缺省会加的 xhigh system 说明。经 OpenRouter 的单 user 请求却比这个包装多 51（[六例观察](2026-09-28-fixed-route-six-observations.md)）。二者差在哪里，文档没有说。

### 计数与缓存接口

- DashScope Python SDK 1.27.7（PyPI wheel SHA-256 `e034664f…6bf9`）：`dashscope/tokenizers/tokenizer.py:12-40` 的 `get_tokenizer` 对任何 `qwen*` 型号都返回同一个 `resources/qwen.tiktoken`（151,643 行，SHA-256 `b2b1b8df…3186`）；`tokenization.py:24-41` 的服务端 `Tokenization` API 只枚举 `qwen-turbo`、`qwen-plus`、`qwen-7b/14b/72b-chat` 等旧型号。[阿里博客《How Alibaba Cloud Calculates and Manages LLM Tokens》](https://www.alibabacloud.com/blog/how-alibaba-cloud-calculates-and-manages-llm-tokens_602565)（`5d465b4b…8283`）也只示范 `get_tokenizer('qwen-turbo')`。所读文档中没有找到覆盖 3.7／3.8 商业叶的计数接口；这是「该读的地方读过没找到」，不是反例证明。
- [百炼上下文缓存](https://help.aliyun.com/en/model-studio/context-cache)（`b844036e…fa88`）：显式缓存用 `cache_control: {"type": "ephemeral"}`，每请求最多 4 个标记，每个标记向前最多看 20 个内容块，最少 1024 token，5 分钟有效且命中即重置，创建按 125%、命中按 10% 计价；显式与隐式缓存的支持名单都含 3.7／3.8 的 max、plus、flash。参数参考把 `cache_control` 写在 user 消息内容块上。

## OpenRouter 的官方说法

- [Reasoning Tokens](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens.md)，本仓库已有 2026-09-30 快照 [openrouter-reasoning-tokens.txt](../xai/closeout-2026-09-30/openrouter-reasoning-tokens.txt)（`a80ca4bc…bc7`）：「Preserving Reasoning」允许用 `message.reasoning` 字符串或 `message.reasoning_details` 数组回传，`reasoning_content` 是 `reasoning` 的别名；「Some Alibaba Qwen thinking models」的 `reasoning.max_tokens` 映射到 `thinking_budget`，「support varies by model」。没有写 `reasoning_details` 怎样转成 Alibaba 的 `reasoning_content`，也没有提 `preserve_thinking` 是否透传。
- [Prompt Caching](https://openrouter.ai/docs/guides/best-practices/prompt-caching.md)（`2b7e3160…9b7179`）：Alibaba 需要显式断点，写 1.25×、读 0.1×，5 分钟 TTL；列出的型号是 `deepseek/deepseek-v3.2`、`qwen/qwen3-max`、`qwen/qwen-plus`、`qwen/qwen3.6-plus`、`qwen/qwen3-coder-plus`、`qwen/qwen3-coder-flash`，**不含** 3.7／3.8。
- [Usage Accounting](https://openrouter.ai/docs/cookbook/administration/usage-accounting.md)（`62e93397…f7e2`）：返回的 token 数「using the model's native tokenizer」。[文档索引 llms.txt](https://openrouter.ai/docs/llms.txt)（`ce8ab0f7…17fc`）里没有预发 token 计数端点；这同样是读数缺口，不是反例证明。

## 逐对象

### LangChain（Python）

版本：`langchain-openai` 1.6.6（2026-09-24）、`langchain-openrouter` 0.2.9（2026-09-22）、`langchain-community` 0.4.2（2026-05-22）、`langchain-qwq` 0.3.5（2026-05-20）、`langchain-core` 1.6.6（2026-09-29），均为 PyPI wheel，SHA-256 见[引用清单](#引用清单)。

- **`ChatOpenAI`**：模块文档 `chat_models/base.py:1-12` 写明第三方非标准字段（`reasoning_content`、`reasoning_details`）「are **not** extracted or preserved」；出站 `_convert_message_to_dict`（`:472` 起）不带任何推理字段。计数：`_get_encoding_model`（`:2366-2379`）对未知型号回退 `cl100k_base`；`get_num_tokens_from_messages`（`:2392` 起）对非 gpt／o 系型号名抛 `NotImplementedError`。
- **`ChatOpenRouter`**：入站把 `reasoning` 放进 `additional_kwargs.reasoning_content`、`reasoning_details` 原样保存（`chat_models.py:1368-1371`、`:1455-1458`）；出站**两者都回传**——`reasoning` ← `reasoning_content`，`reasoning_details` 先按 `(type, index)` 合并流式碎片、剥掉 `rs_` 开头的 id（`:1197-1265`、`:1322-1331`）。不区分型号。没有覆写计数，沿用 `langchain-core` 默认的 GPT-2 tokenizer（`language_models/base.py:72-130`）。缓存：未见 `cache_control` 处理。
- **`ChatTongyi`**（DashScope 原生 SDK）：`convert_dict_to_message`（`chat_models/tongyi.py:85-131`）只有在**没有** `tool_calls` 时才把 `reasoning_content` 放进 `additional_kwargs`；`convert_message_to_dict`（`:203-217`）不回传推理。无计数覆写，无缓存处理。
- **`ChatQwen`**（`langchain-qwq`）：继承 `BaseChatOpenAI`（`base.py:36`），入站读 `reasoning_content`（`base.py:114-124`、`chat_models.py:159-167`），出站沿用父类转换，因此同样**丢弃**；`enable_thinking`／`thinking_budget` 走 `extra_body`（`chat_models.py:812-840`）。`middleware/context_cache.py` 的 `DashScopeContextCacheMiddleware` 只给最后一条消息加 `cache_control: ephemeral`。
- **通用计数**：`langchain_core/messages/utils.py:2257` 起的 `count_tokens_approximately` 按字符数 ÷4、每消息 +3，只数 `content`、工具调用与 role，**不数** `additional_kwargs` 里的推理；可选用最近一条 AI 消息的 `usage_metadata.total_tokens` 等比缩放。

### LangChain（JS）

版本：`@langchain/openrouter` 0.4.15、`@langchain/openai` 1.6.0、`@langchain/community` 1.1.29（npm tarball）。

- `@langchain/openrouter`：入站把 `reasoning`／`reasoning_details` 复制到 `additional_kwargs`（`dist/converters/messages.js:38-39`、`:69-70`；CHANGELOG 0.3.0 的 #10666 说这是为了显示推理）；出站 `convertMessagesToOpenRouterParams` 直接委托给 `@langchain/openai` 的 `convertMessagesToCompletionsMessageParams`（`:11-16`），后者（`dist/converters/completions.js:572-600`）不输出任何推理字段，并在 `:580` 滤掉 `reasoning`／`thinking` 块。结果是 **Python 版回传、JS 版丢弃**。
- `ChatAlibabaTongyi`（`dist/chat_models/alibaba_tongyi.js`）：没有任何推理字段处理。

### pi（earendil-works/pi）

版本：当前 `v0.99.1`，提交 `d86654abb8862e201933517d6f1fce9f88dd117f`（GitHub tarball SHA-256 `48941ee9…91be`）；本仓库 fork 基线 0.86.1、`3390bd93`（[快照](../../evidence/2026-09-29-openai-closeout/sources/pi/packages/ai/src/api/openai-completions.ts)）。两版在下列推理、Qwen、缓存相关行上没有差异，行号按 0.99.1。

- **回放**：流式读取第一个非空的 `reasoning_content`／`reasoning`／`reasoning_text` 作 thinking（`packages/ai/src/api/openai-completions.ts:606` 起），同时累积 `delta.reasoning_details` 并序列化进 `thinkingSignature`（`:331`、`:665-676`）。出站时有 details 就**只发 `reasoning_details`**，不发并行字符串（`:1304-1311`、`:1332-1341`、`:1375-1377`）；没有 details 时按原字段名回写（DashScope 就是 `reasoning_content`）。跨型号时 thinking 转成普通文本或丢弃（`transform-messages.ts:95-115`）。开源／商业没有区分。
- **Qwen 专用**：Qwen Token Plan（百炼订阅端点）用 `thinkingFormat: "qwen"`，只发顶层 `enable_thinking` 与 `reasoning_effort`（`:888-894`；`scripts/generate-models.ts:2594-2599`），**不发 `preserve_thinking`**；自托管模板用的 `qwen-chat-template` 才发 `chat_template_kwargs.preserve_thinking: true`（`:895-900`）。CHANGELOG #3325 记录的原因是不保留前轮思考时，多轮工具调用参数会退化成空 `{}`；#10047 修的是 OpenCode 上 `qwen3.8-flash` 的思考在后续轮被当纯文本回放。
- **计数**：没有 Qwen tokenizer。`coding-agent` 的 `estimateContextTokens`（`packages/coding-agent/src/core/compaction/compaction.ts:196-225`）＝最后一条有效 assistant 的 `input+output+cacheRead+cacheWrite`（`:140-142`）＋其后消息按字符 ÷4（`:298-344`）；thinking 文字也按 ÷4 计。
- **缓存**：OpenRouter 上只有 `anthropic/*` 有 `cacheControlFormat`（`openai-completions.ts:1634`），`qwen/*` 与 Qwen Token Plan 都不发 `cache_control`；只有 OpenCode 目录里 npm 为 `@ai-sdk/alibaba` 的条目会被设为 Anthropic 式断点（`generate-models.ts:2261-2264`：system、最后一个工具、最后一条消息）。

### 阿里自家：Qwen Code 与 Qwen-Agent

- **Qwen Code** `v0.24.7`，提交 `b12edec1401a28fc53cd9e714d5928b285071fc8`（tarball SHA-256 `fde3b250…d6bc8f`）：
  - DashScope provider 对所有请求加 `preserve_thinking: true`（`packages/core/src/core/openaiContentGenerator/provider/dashscope.ts:472-476`，视觉型号 `:442-447`），assistant 历史回传 `reasoning_content`（`converter.ts:837-852`）。
  - OpenRouter 走通用 provider：型号名含 `qwen3` 时把 `reasoning_content` 镜像一份到 `reasoning`（`provider/default.ts:47-70`、`:230-235`），不发 `reasoning_details`。
  - 缓存默认开：流式请求在 system、最后一条消息的最后一个「稳定块」（跳过尾部重附的图片，issue #11627）和最后一个工具上打 `cache_control: ephemeral`，非流式只打 system（`dashscope.ts:380-392`、`:790-850`）。
  - 计数：`services/tokenEstimation.ts:101-127` 用「上一轮 prompt tokens＋上一轮 output tokens（含推理）＋新内容字符估算」，首轮没有 API 数据时明说会漏掉约 15–20K 的 system 与工具定义；字符估算为 ASCII ÷4、非 ASCII ×1.1（`utils/request-tokenizer/textTokenizer.ts`）。
- **Qwen-Agent** 0.0.34（2026-02-16，PyPI SHA-256 `195264f9…59b7`，比 3.7／3.8 早）：`qwen_agent/llm/base.py:422-431` 把 `reasoning_content` 原样回传到 OpenAI 兼容端点；上下文截断用自带的 `utils/qwen.tiktoken`（与 DashScope SDK 同一文件，SHA-256 `b2b1b8df…3186`）计数（`llm/base.py:627-630`、`:772-774`）。

### Vercel AI SDK

- **`@ai-sdk/alibaba` 2.0.59**（`dist/index.js`，tarball SHA-256 `667746d8…c6a1`）：选项 `preserveThinking`（`:17-25`）在名单型号上默认 `true`，并显式发 `preserve_thinking`（`:374`、`:408`）；名单（`:307-324`）是 `qwen3.6-*`、`qwen3.7-flash/max/plus`（含快照）、`qwen3.8-flash`、`qwen3.8-max`、`qwen3.8-max-0902` 与 `kimi-k2.7-code`，注释引 QwenCloud Thinking 页；**不含**开源 `qwen3.8-2.4t-a95b`、`qwen3.8-27b`。不开 preserve 时，只有位于最后一条 user 之后的 assistant 推理才回传（`:195`，与公开模板的 `last_query_index` 规则同形）。缓存由调用方在 `providerOptions.alibaba.cacheControl` 按消息／内容块指定，超过 4 个只告警（`:250-268`）；usage 读 `cached_tokens` 与 `cache_creation_input_tokens`（`:99-100`）。CHANGELOG 2.0.49（`7f803af`）起默认保留推理。没有本地分词。
- **`@openrouter/ai-sdk-provider` 3.1.0**（`dist/index.js`，SHA-256 `2db5cfe6…bc3a`）：assistant 出站**同时**带 `reasoning` 字符串（仅当 details 非空）与去重后的 `reasoning_details`（`:3813-3888`）；只对 `anthropic-claude-v1`／`google-gemini-v1` 格式的无签名 text detail 过滤，Qwen 的 `format: "unknown"` 原样保留。`cache_control` 由调用方给（`:3683-3801`）。
- `@ai-sdk/openai-compatible` 3.0.60：凡有推理部分的 assistant 都回传 `reasoning_content`（`dist/index.js:171-193`），不看最后一条 user。

### OpenAI Agents SDK

`openai-agents` 0.22.3（PyPI SHA-256 `41dec9e2…ee9d`）：Chat Completions 转换器把 `reasoning_content` 记为 summary、把 OpenRouter 式 `reasoning` 记为 `reasoning_text`（`agents/models/chatcmpl_converter.py:143-178`）。回放时：`reasoning` 来源且同型号时回传 `reasoning` 字符串（`:926-936`、`:650-660`）；`reasoning_content` 要经 `should_replay_reasoning_content` 钩子，缺省实现只对型号名含 `deepseek` 的返回真（`agents/models/reasoning_content_replay.py:41-60`），所以 DashScope 直连的 Qwen 缺省**不回传**。`reasoning_details` 不处理。

### LiteLLM

`litellm` 1.103.1（2026-09-29，PyPI wheel SHA-256 `78d92d1e…5155`，平台相关 wheel，只读 Python 源）：

- DashScope：`llms/dashscope/chat/transformation.py:15-30` 只额外支持 `reasoning_effort` 并**保留**调用方的 `cache_control`；消息原样透传，调用方给了 `reasoning_content` 就发出去。把 `thinking` 映射成 `enable_thinking`／`thinking_budget` 的 PR [#40720](https://github.com/BerriAI/litellm/pull/40720) 已关闭未合并，[#40959](https://github.com/BerriAI/litellm/pull/40959) 仍开着（GitHub API 2026-09-30 读数）。
- OpenRouter：响应里的 `reasoning` 被改名为 `reasoning_content`（`llms/openrouter/chat/transformation.py:276`）；`reasoning_details` 在整个 Python 源里没有出现；`cache_control` 只对型号名含 claude／gemini／minimax／glm／z-ai 的保留，Qwen 会被**剥掉**（`:31-38`、`:84-103`）。
- 计数：`token_counter` 对 Qwen 走 tiktoken `cl100k_base`（`utils.py:2261-2296`、`litellm_core_utils/default_encoding.py:59`），逐条消息把每个字符串字段都计入（`token_counter.py:499-525`），所以消息上的 `reasoning_content` 会被算进去。

## 对比表

| 对象（版本） | 端点 | 推理历史怎样回传 | 区分商业／开源叶 | 输入 token 估算 | 显式缓存断点 |
| --- | --- | --- | --- | --- | --- |
| DashScope 官方参数参考 | 直连 | 3.8 max／0902／flash 默认 `preserve_thinking=true`，须完整回传 `reasoning_content`；3.7 默认 false；开启时历史推理计入输入并计费 | 按型号名单；`max-prime` 不在名单 | 无覆盖 3.7／3.8 的计数接口；SDK 只带旧 `qwen.tiktoken` | 调用方给 `cache_control`，≤4 个，回看 20 块 |
| OpenRouter 官方文档 | OpenRouter | `reasoning`／`reasoning_content`／`reasoning_details` 均可回传；到 Alibaba 的转换未写 | 无 | 无预发计数端点；响应 usage 用原生 tokenizer | Alibaba 需显式断点；型号名单不含 3.7／3.8 |
| `ChatOpenAI` 1.6.6 | 任意兼容 | 丢弃 | 无 | tiktoken `cl100k_base`；按消息计数对 Qwen 抛错 | 无 |
| `ChatOpenRouter`（Py）0.2.9 | OpenRouter | `reasoning`＋合并后的 `reasoning_details` | 无 | 默认 GPT-2 tokenizer | 无 |
| `@langchain/openrouter`（JS）0.4.15 | OpenRouter | 入站保存、出站丢弃 | 无 | 未见 | 无 |
| `ChatTongyi` 0.4.2 | DashScope 原生 | 丢弃；带工具时入站也不保存 | 无 | 默认 GPT-2 | 无 |
| `ChatQwen`（langchain-qwq）0.3.5 | DashScope 兼容 | 入站保存、出站丢弃 | 无 | 同 `ChatOpenAI` | 中间件只标最后一条消息 |
| pi 0.99.1（=fork 基线的相关行） | OpenRouter | 只发 `reasoning_details` | 无 | 上轮 usage＋字符 ÷4 | 不发 |
| pi 0.99.1 | Qwen Token Plan | 回写 `reasoning_content`；不发 `preserve_thinking` | 无 | 同上 | 不发 |
| Qwen Code 0.24.7 | DashScope | 恒发 `preserve_thinking: true`＋`reasoning_content` | 无 | 上轮 prompt＋上轮 output＋字符估算 | system＋最后稳定块＋最后工具，默认开 |
| Qwen Code 0.24.7 | OpenRouter | `reasoning_content` 与镜像 `reasoning` | 无（按名含 `qwen3`） | 同上 | 不发 |
| Qwen-Agent 0.0.34 | DashScope 兼容 | 原样回传 `reasoning_content` | 无 | 旧 `qwen.tiktoken` | 未见 |
| `@ai-sdk/alibaba` 2.0.59 | DashScope | 名单型号默认发 `preserve_thinking: true` 并回传全部；否则只回传最后一条 user 之后的 | 名单只含商业 ID | 无本地分词 | 调用方指定，>4 告警 |
| `@openrouter/ai-sdk-provider` 3.1.0 | OpenRouter | `reasoning`＋`reasoning_details` | 无 | 无 | 调用方指定 |
| Agents SDK 0.22.3 | 兼容／OpenRouter | OpenRouter 式同型号回传 `reasoning`；`reasoning_content` 缺省只对 DeepSeek 回传 | 无 | 未见 | 未见 |
| LiteLLM 1.103.1 | DashScope | 透传调用方字段 | 无 | tiktoken `cl100k_base`，字符串字段全计 | 保留调用方 `cache_control` |
| LiteLLM 1.103.1 | OpenRouter | 透传；`reasoning_details` 不处理 | 无 | 同上 | 对 Qwen 剥掉 |

## 本仓库 batch8 的离线复算（推断级）

**输入**（只读，均在 HUB 忽略目录 `tmp/model-request-runtime/`，不是入库归档）：

- 六叶三轮汇总 `private/paid-out/batch8-f8e55130/qwenc-<model>/summary.json`，SHA-256：3.7-flash `a4478229…cae`、3.7-max `1e14a714…350`、3.7-plus `2afc7a62…1f3`、3.8-flash `c4541b46…5a5`、3.8-max-0902 `a052def2…011`、3.8-max-prime `4c5b769e…3ac`。各轮原始 SSE 的 SHA-256 记在这些文件的 `rawResponse.sha256` 里。
- 场景 `current-certification/scenarios/r6-families/qwen/<model>-three-turn.json`：同一 system（约千 token 的稳定前缀）＋一个 `lookup_code` 工具，第 2、3 轮各追加一条新 user；effort 均为 `high`；3.7-max、3.7-plus、3.8-max-0902、3.8-max-prime 在 system 上打 5 分钟显式断点，两个 flash 走自动缓存。

**做法**：从原始 SSE 取出每轮的 `delta.reasoning` 拼接串（18 轮都与 `reasoning_details` 的 text 逐字相同）与工具调用，按场景重建第 2、3 轮消息序列，再用 f8e55130 的 `renderQwenPrompt`（`src/input-meters/qwen.ts`，SHA-256 `753ec40a…1ad7`，HUB 于 11:29:42 构建的 dist）加固定 tokenizer（`0997f410…9b9f3`）计数。重建体与实际发出字节不相同（工具调用 id、`content` 为 null、details 与字符串的形式不同），这些不进模板渲染。上游数取 SSE 里的 `usage.prompt_tokens`（已含缓存读写）。

**两条规则**：3.8 三叶按公开模板默认分支——全部历史推理进 `<think>` 块，system 前带 xhigh effort 说明（阿里文档写明 high 映射到 xhigh）。3.7 三叶去掉 effort 说明，并走模板的 `preserve_thinking=false` 分支——最后一条 user 之前的 assistant 只渲染 content。

| 型号 | 轮 | 上游 `prompt_tokens` | 现行可见 JSON 替身预测（残差） | 模板规则预测（残差） |
| --- | ---: | ---: | ---: | ---: |
| qwen3.7-flash | 1／2／3 | 1147／1218／1283 | 999（−148）／1559（+341）／1892（+609） | 1148／1219／1284（均 +1） |
| qwen3.7-max | 1／2／3 | 1147／1218／1283 | 1013（−134）／1193（−25）／1382（+99） | 1148／1219／1284（均 +1） |
| qwen3.7-plus | 1／2／3 | 1144／1215／1280 | 1010（−134）／1190（−25）／1634（+354） | 1145／1216／1281（均 +1） |
| qwen3.8-flash | 1／2／3 | 1185／1283／1367 | 999（−186）／1172（−111）／1331（−36） | 1186／1284／1368（均 +1） |
| qwen3.8-max-0902 | 1／2／3 | 1188／1366／1528 | 1029（−159）／1289（−77）／1528（0） | 1189／1367／1529（均 +1） |
| qwen3.8-max-prime | 1／2／3 | 1186／1284／1383 | 1016（−170）／1192（−92）／1366（−17） | 1187／1285／1384（均 +1） |

**能读出的**：

- 第 1 轮约 150 的低估，差额与模板里固定的工具说明段（前后缀合计 196 token，不含 schema）和 3.8 的 effort 说明同量级；可见 JSON 替身数的是 JSON 标点和控制字段，数不到这些文字。用同一个 tokenizer，第 1 轮六叶残差全部收敛到 +1，所以这批样本**不需要**「商业叶 tokenizer 与开源叶不同」这条假设来解释低估。
- 3.7 各叶的轮间增量（71、65）与各自的推理长度（27 到 381 个 reasoning token）无关；3.8 各叶的增量恰为「3.7 的增量＋上一轮 reasoning tokens＋5」（5 个 token 正是 `<think>\n`…`\n</think>\n\n` 的包装）。可见 JSON 替身把推理全算进去，所以在 3.7 上随推理变长而越估越高——3.7-flash 第 3 轮 +609（+47%）的输入里有两轮共 561 个 reasoning token（381＋180）的历史推理，上游一个也没有计入；其余差额是替身自身的 JSON 开销与第 1 轮就有的低估。
- 这与参数参考写的默认值一致（3.8 max／0902／flash 默认 true，3.7 默认 false）。`max-prime` 不在任何名单里，它的行为与 3.8-max 一致是这批观察给出的，没有文档依据。

**反例与边界**：

- 常数不是全局的。同一套渲染对 [3.8-flash 的四个单 user 请求](2026-09-28-flash-final-wire-input-meter.md)（无 system、无工具）是 −9，对 [3.7-flash 的四个](2026-09-28-flash37-final-wire-input-meter.md)是 0，batch8 则是 +1。常数随请求形状变，来源未知。
- 只有一种场景：一个工具、英文 ASCII 内容、每轮都有新 user。「同一 user 回合内的工具循环」（assistant 调工具 → tool 结果 → 不带新 user 的下一请求）没有覆盖。照公开模板与 `@ai-sdk/alibaba` 的规则推，这种情况下 3.7 会保留本回合推理；这一点未测。
- 3.7 规则只证明「删掉历史推理、不加 effort 说明」在数上吻合，不证明 OpenRouter 真的把推理送到了阿里，也不证明 3.7 的私有模板或 tokenizer 与 Qwen3.8 公开件相同；ASCII 以外的内容没有样本。
- 这是作者一次性的离线计算，没有入库的脚本，也没有独立复核。

## 对本仓库方向的启示（依据与反证，不含决定）

所评估的方向：按[开源两叶的做法](../../../../design/realization/packages/model/pi-ai-transport/qwen-open-visible-reasoning-estimate-design.md)（可见 `reasoning.text` 投到公开模板的 `reasoning_content` 槽位，full-only 估算）给商业六叶补候选。

**支持这个方向的依据**

1. 18 个真实请求都能被公开 Qwen3.8 模板＋固定 tokenizer 复算到常数 +1，12 个历史增量残差为 0；同批请求上可见 JSON 替身的残差是 −186 到 +609。第 1 轮的低估可以由模板的固定文字解释，不需要另设 tokenizer 差异。
2. 阿里参数参考把「历史推理是否进入输入」定义成按型号默认的 `preserve_thinking`，并明说开启时计入输入 token；公开模板里对应的是同一个开关与 `last_query_index` 规则。计量上需要的正是这个开关，而它有一手出处。
3. 社区在回放投影上不区分开源和商业叶：没有一家 harness 为商业叶另写一套推理投影，差别只在端点和 `preserve_thinking` 名单。唯一带名单的 `@ai-sdk/alibaba` 名单只含商业 ID，其非名单规则也是 `last_query_index`。
4. 公开模型卡把 Qwen3.8-Max 写成「based on」2.4T 的官方版本，并说 `preserve_thinking` 对所有工作负载默认开启——这是血缘依据，不是字节相同的证明。

**反证与限制**

1. 「同法」不能照搬开源页：3.7 三叶需要 `preserve_thinking=false` 分支且没有 effort 说明，3.8 三叶需要默认分支加 xhigh 说明。开源页的计量映射只覆盖默认分支，商业叶需要按叶设定这两个量，而 3.7 的这两个量只有这批计数作依据。
2. 常数随形状变化（单 user −9 或 0，三轮带工具 +1），来源不明；没有误差界，也没有证据说它有界。
3. OpenRouter 怎样把 `reasoning_details` 转成阿里的 `reasoning_content`、是否转发或设置 `preserve_thinking`，一手文档都没写；只能从计数反推。OpenRouter 哪天改转换方式或默认值，这条关联会静默失效。
4. 阿里自己的文档互相矛盾（深度思考页、QwenCloud 页、多轮对话页与参数参考不一致）；`max-prime` 不在阿里任何名单里。能写成依据的只有参数参考加本批观察。
5. 同一 user 回合内的工具循环、非 ASCII 内容、图片、`medium`／`low` effort、`none` 都没有样本。其中回合内工具循环正是 3.7 在两条规则之间可能分叉的地方。
6. 社区里没有现成的商业叶本地计数依据：官方 SDK 与 Qwen-Agent 带的是旧 151,643 词表，与 Qwen3.8 公开 tokenizer 不同；其余 harness 都用 usage 锚定加近似。这说明本仓库的固定公开 tokenizer 是唯一的候选，而它与商业叶的一致性只到「这批样本计数相同」。
7. 社区常见的「上一轮 usage 锚定」（pi、Qwen Code）把上一轮输出（含推理）也算进下一轮；按参数参考，3.7 默认不把历史推理放进输入，这种锚定在 3.7 上会系统性高估。这是推断，没有针对这些 harness 的测量。

**缓存方面的事实约束**

- 阿里显式缓存最多 4 个标记、每个只回看 20 个内容块、最少 1024 token。社区里唯一自动维护多轮断点的是 Qwen Code（system、最后稳定块、最后工具）；其余交给调用方，或者对 OpenRouter 上的 Qwen 不发、剥掉。
- OpenRouter 缓存文档的 Alibaba 名单不含 3.7／3.8；batch8 中 3.7-max、3.7-plus、3.8-max-0902 的第 1 轮都有显式写入（1131、1128、1172），`max-prime` 第 1 轮报告写入 0、第 2 轮却读到 1170。文档与观察不一致，`max-prime` 的写入计数方式未知。

## 已知、推断、未知

**已核实的事实（附出处）**

- 百炼参数参考中 `preserve_thinking` 的型号默认值、「必须完整回传」和「开启即计入输入」的原话；深度思考页、QwenCloud 页、多轮对话页的相反或缺失说法。
- 固定公开模板里 `preserve_thinking`／`last_query_index`／xhigh 说明的渲染规则。
- 各 harness 在所列版本和行号上的回放、计数、缓存行为（逐行读源码；没有运行它们）。
- DashScope SDK 与 Qwen-Agent 自带的 `qwen.tiktoken` 有 151,643 个 rank，本仓库固定的 Qwen3.8 `tokenizer.json` 词表为 248,044。
- OpenRouter 文档索引中没有预发计数端点，缓存文档的 Alibaba 名单不含 3.7／3.8（均为读数缺口，不是反例证明）。
- batch8 18 轮的上游 `prompt_tokens`、缓存读写和现行预测值（来自私有汇总与 SSE）。

**推断**

- 3.8 三叶（含 `max-prime`）按 `preserve_thinking=true` 把历史推理计入输入，3.7 三叶按默认 false 丢弃上一 user 之前的推理：由离线复算与参数参考共同支持。
- 第 1 轮约 150 的低估来自模板固定文字未被可见 JSON 替身计入，而不是 tokenizer 差异：由离线复算支持。
- pi、Qwen Code 式的 usage 锚定在 3.7 上会高估。

**未知**

- OpenRouter 对 Alibaba 的推理字段转换，以及是否设置 `preserve_thinking`。
- 常数 +1、−9、0 各自的来源。
- 3.7 在同一 user 回合内工具循环里的行为；非 ASCII、图片、其他 effort 档位下的计数。
- 3.7 与商业 3.8 的私有 tokenizer 和模板是否与公开件相同。
- `max-prime` 的缓存写入计数方式；DashScope 服务端 `Tokenization` API 是否接受 3.7／3.8 型号（SDK 没列，未调用）。

## 引用清单

官方文档（本次 `curl` 取得，SHA-256 只标识本次字节）：

- 百炼 Chat Completions 参数参考：[英文](https://help.aliyun.com/en/model-studio/qwen-api-via-openai-chat-completions) `ec6cb8c3cf6aad8d69dee7ef3d565e626b72be259437cf94c6d569a6b69ad294`；[中文](https://help.aliyun.com/zh/model-studio/qwen-api-via-openai-chat-completions) `fd417e248246052da62c4a5b95ff2bc1559448cd5cac7b01b16dde84bcef2b71`
- 深度思考：[英文](https://www.alibabacloud.com/help/en/model-studio/deep-thinking) `c44357bc1a50f07ba194c0724c65a55a26f814a5cb3378d71cd96ec3063d1684`；[中文](https://help.aliyun.com/zh/model-studio/deep-thinking) `e4747ef1943291ce35087a050a6a298cf1d654de0b2fad149db58626a254e3bd`
- 多轮对话：[英文](https://www.alibabacloud.com/help/en/model-studio/multi-round-conversation) `b1d12bcf7882d675e49a77c5788527e1e827474c56455163d084e61b56dced7a`；[中文](https://help.aliyun.com/zh/model-studio/multi-round-conversation) `38167337658171e0470b7982b60d56e5106d421998a9eaa8c925177c004dee55`
- [QwenCloud Thinking](https://docs.qwencloud.com/developer-guides/text-generation/thinking) `9755affca27a849f01d586cb418b24f8c6fc3e68602c98bddac16243a5fa342a`
- [百炼上下文缓存（英文）](https://help.aliyun.com/en/model-studio/context-cache) `b844036e5f8d9dd4cb87d8776ddffd116efd382982462035dcc6b098f754fa88`
- [文本生成 FAQ（中文）](https://help.aliyun.com/zh/model-studio/text-generation) `1b4416635e5e508788b65b29672c593f2a709511b90c3fca6eff1b6c19f67ff7`
- [阿里云博客：LLM token 计算](https://www.alibabacloud.com/blog/how-alibaba-cloud-calculates-and-manages-llm-tokens_602565) `5d465b4b8eec16c8cd6647b065bf239c2b20d61ccf90a91f01ae0c1e93e58283`
- [Qwen3.8-2.4T-A95B 模型卡@207bd685](https://huggingface.co/Qwen/Qwen3.8-2.4T-A95B/blob/207bd685a7e3696cfaff12ded7c6a7ea0f88c996/README.md) `7690c680c2d6eb284179ef5dd4db63260d248531cae9087b09b2c2200230f331`
- OpenRouter：[Reasoning Tokens 快照](../xai/closeout-2026-09-30/openrouter-reasoning-tokens.txt) `a80ca4bcee4915cc1d1697fd620743bfbbc97f45f5a25213fcc149bad5681bc7`；[Prompt Caching](https://openrouter.ai/docs/guides/best-practices/prompt-caching.md) `2b7e31601396250823a91c1a10705b57e5eaf62b9a299cb780c826a8ef9b7179`；[Usage Accounting](https://openrouter.ai/docs/cookbook/administration/usage-accounting.md) `62e9339731737dff7e35c84ffac84607be44e415a236a5458852328dd21f7cf2`；[llms.txt](https://openrouter.ai/docs/llms.txt) `ce8ab0f72922df84b1962c16558fcc207f49ac7771b96c65f151f00f03b317fc`

源码包（本次下载，SHA-256 为包文件）：

- PyPI：`dashscope-1.27.7-py3-none-any.whl` `e034664fc78d487bd949753807abc2640c154cfcecff7a59b8b2a4b6ec156bf9`；`langchain_openai-1.6.6` `60dcaa443ddfdf1559feaf1d25916f394c7dda809aebe22a769fc39f02705be7`；`langchain_openrouter-0.2.9` `375a79a4a849069d2254627185210b2f2b9fe84c69326e10d71c3d48f8b41f06`；`langchain_community-0.4.2` `84dd8c5122532394d5b6849a5fc9995ef28e4f77227daeb09f24b3d942e9e466`；`langchain_qwq-0.3.5` `3681e7a9c2b93ade2dfc5fcf0e5dbbc342a133f71b4217eb52354b31e4d4cada`；`langchain_core-1.6.6` `d9a71e312ab7443701238750e04a57aefc037c4f1ec82837c8a1609d9a14a9b1`；`openai_agents-0.22.3` `41dec9e2e703db32a627bf0290f3721a6ca37405603a8cb654213356dbb8ee9d`；`litellm-1.103.1`（macOS wheel，只读 Python 源）`78d92d1e268fa23410a612fabe3970863b78efb9582c24a503a19d84aeed5155`；`qwen_agent-0.0.34` `195264f9c1880f60f23781805d69bb3ffadfe944b7b70358f7115a0dd4bc59b7`
- npm：`@langchain/openrouter@0.4.15` `b69b048ce68ccf439404fbd56adeeebf9f0474ed71f7aeaf102186daeebbfd11`；`@langchain/openai@1.6.0` `b086af99656e597b74f5529d2059dbf067136590458d5508cc67c54b99db0262`；`@langchain/community@1.1.29` `5309607ee27fc2cb0d479f9a504f4b1e38b0ff44b74fa4d5024e782b3c6b58da`；`@ai-sdk/alibaba@2.0.59` `667746d82e6ae79ea2c2b3845d8263d5522652be05fe62b7928fb01c8461c6a1`；`@openrouter/ai-sdk-provider@3.1.0` `2db5cfe6bd6d625fbede2e0563a8161f53ac7730b41a5422098d82acaf0bdc3a`；`@ai-sdk/openai-compatible@3.0.60` `19529966aa8cb3b7b328dbbd540eaa93c28020251d1c131df0727600597bfa41`
- GitHub tarball：`earendil-works/pi@d86654abb8862e201933517d6f1fce9f88dd117f`（v0.99.1）`48941ee95f08ca84972f36cd1f55bbbc85a2345cbcaffc6205fad8f8e3c091be`；`QwenLM/qwen-code@b12edec1401a28fc53cd9e714d5928b285071fc8`（v0.24.7）`fde3b250ad61d250c944889b523804e672129544581ebf93e0a6b6e079d6bc8f`；本仓库 pi fork 基线 `3390bd93`（0.86.1）见 `tmp/sources/pi-3390bd9.tar.gz` 与上文快照链接。

本仓库此前的 Qwen 页：[六例观察](2026-09-28-fixed-route-six-observations.md)、[3.8-Flash 单 user](2026-09-28-flash-final-wire-input-meter.md)、[3.7-Flash 单 user](2026-09-28-flash37-final-wire-input-meter.md)、[Hosted Max 例](2026-09-28-hosted-max-example.md)、[公开模板缺口](2026-09-28-public-template-gaps.md)、[可见完整代理](2026-09-29-visible-full-surrogate.md)。

## QC-V0 独立复算（2026-09-30）

事件词：补充。上文正文不改。第二执行者没有读作者的计算，也没有调用包内 `renderQwenPrompt`，而是按[上文方法](#本仓库-batch8-的离线复算推断级)独立重写：先由已批准场景和原始 SSE 重建 18 个请求，再用 Jinja2 3.1.6 直接渲染固定模板，最后用 HuggingFace `tokenizers` 0.23.2 读固定 `tokenizer.json` 计数。脚本、六份汇总副本、哈希与逐行结果见 [batch8-20260930/](batch8-20260930/README.md)。

- **一致的项**：18 个上游 `prompt_tokens`、18 个现行 JSON 替身预测（残差 −186～+609）、12 个轮间增量残差全为 0、3.7 三叶增量 71／65、3.8 六个增量减去 3.7 增量和上一轮 reasoning tokens 后余数全为 5、18 轮 `delta.reasoning` 与 details text 逐字相同，以及六份汇总的 SHA-256，都与上文一致。18 轮重建体的 SHA-256 全部等于 run 记录的 `plannedWireSha256`，所以复算用的输入与规划体逐字节相同。
- **与模板规则预测列的关系**：模板用 `tool | tojson` 渲染工具定义。按 Jinja2 内置 `tojson`（键按字母排序，包内渲染器也这样做）渲染时，18 个预测与上文逐值相同，残差全为 +1。按 HF transformers／vLLM 的 `tojson`（保持 wire 键序）渲染时，18 个残差全为 0。两种渲染只差工具定义那一行，排序版在那一行多 1 个 token。所以在这一个形状里，上文记作「来源未知」的 +1 可以完全由这个渲染选择解释。阿里私有渲染用哪种键序仍然未知：零残差与插入序相容，但本批数据不能排除别的解释。单 user 形状的 −9／0 不含工具，本次没有复算。
- **输入字符范围**：上文说「英文 ASCII 内容」，这对场景文字成立；但 0902 第 2、3 轮回放的历史推理里有 `—`、`→` 两个非 ASCII 字符。

资源归位附注（2026-10-06）：本页记录的包内 tokenizer 资源现位于 `packages/model/pi-ai-transport/resources/tokenizers/`。原输入字节、散列、上游出处和历史检出坐标保持；这是物理路径迁移，不修订本页研究结论。
