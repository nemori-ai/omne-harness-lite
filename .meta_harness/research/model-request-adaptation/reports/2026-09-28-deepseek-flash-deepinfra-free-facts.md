# DeepSeek V4.1 Flash／DeepInfra 免费字段复核：2026-09-28

本次只读取公开资料与 OpenRouter 的无凭据 GET；没有发送模型请求，也没有缓存命中或媒体字节测试。调查对象为用户确认的 `deepseek/deepseek-v4.1-flash`，固定所选端点 `deepinfra/fp8`；`deepseek/deepseek-v4-pro-0813` 同端点只用于已有定义的元数据回归。取得原文的 URL、UTC 日期及原件 SHA256 列在下方，原 JSON 保存在执行工作树的忽略目录 `tmp/model-request-runtime/deepseek-free-facts/`，未入库。

| 字段／观察 | Flash／DeepInfra `deepinfra/fp8` | Pro／DeepInfra `deepinfra/fp8` | 证据范围 |
| --- | --- | --- | --- |
| 精确 ID 与端点 | `deepseek/deepseek-v4.1-flash`；`DeepInfra \| deepseek/deepseek-v4.1-flash-20260910` | `deepseek/deepseek-v4-pro-0813`；`DeepInfra \| deepseek/deepseek-v4-pro-20260813` | 两份 endpoints JSON 的 `data.id` 与 `data.endpoints[?(@.tag=="deepinfra/fp8")]` |
| 模态 | 模型级 `text,image → text` | 模型级 `text → text` | `data.architecture`；不证明选中端点的逐字节媒体承载 |
| 窗口与输出 | `context_length=1048576`；`max_completion_tokens=131072`；`max_prompt_tokens=null` | `1048576`；`16384`；`null` | 选中端点；`null` 是未报告独立输入上限，不能当作 0 或直接将共享窗口填入只计输入上限 |
| 列出的参数 | `reasoning`, `include_reasoning`, `max_tokens`, `temperature`, `top_p`, `stop`, `frequency_penalty`, `presence_penalty`, `repetition_penalty`, `top_k`, `seed`, `min_p`, `logit_bias`, `structured_outputs`, `tools`, `tool_choice`, `response_format`, `reasoning_effort` | 与 Flash 相同的参数名集合，数组次序不同；实际原数组见 JSON | 只证实参数名被公开列出，不证实值域、组合条件或全域透传 |
| 工具 | `supports_tool_choice` 的 `none/auto/required/function` 均 `true` | 四项均 `true` | 元数据标志；没有本轮实际工具请求 |
| 缓存元数据 | `pricing.input_cache_read=0.0000000042`；`supports_implicit_caching=false` | `0.0000001`；`false` | 同一端点的原字段；缓存读价格与 `false` 并存，不推断哪一方代表真实命中行为 |

[OpenRouter Flash endpoints](https://openrouter.ai/api/v1/models/deepseek/deepseek-v4.1-flash/endpoints) 的本轮 JSON SHA256 为 `1b20bc7df30371324602d7a9106558ac00aeebbc347721235869dfd851ef4c92`；[Pro endpoints](https://openrouter.ai/api/v1/models/deepseek/deepseek-v4-pro-0813/endpoints) 为 `750df6bf08c4d415cc622b597f7c04d37154db9e170b3e02ae5707b0c2f59ac0`。URL 是可再取入口，远端内容会变；哈希仅识别本次原件。取得方式为 `curl -fsSL`、无凭据、2026-09-28 UTC，Node JSON 解析后按 `tag` 精确筛选，并未使用聚合模型卡的输出上限替代端点值。

[OpenRouter 模型页](https://openrouter.ai/deepseek/deepseek-v4.1-flash/providers) 明列图文输入、文本输出、DeepInfra 提供者和图片请求示例。[DeepSeek 官方 Vision 指南](https://api-docs.deepseek.com/guides/vision/) 对其**直连 API**声明单图 base64／外部 URL 为 32 MiB、请求体 48 MiB、无 `file_id` 时全部图片 64 MiB。这不是经 OpenRouter 固定 `deepinfra/fp8` 路由的逐图限制；本轮在该路由的 OpenRouter 元数据、模型页及该指南中均未取得逐图字节上限。没有上限读数不证明该路由无上限。

[OpenRouter 缓存文档](https://openrouter.ai/docs/guides/best-practices/prompt-caching) 的 DeepSeek 段称缓存自动启用，无需手工控制；同页说明 `usage.prompt_tokens_details.cached_tokens > 0` 是命中读数。此为平台的一般声明，与本轮两端点 `supports_implicit_caching=false` 构成待解释的范围差异。模型页显示的历史 cache hit rate 与价格不是本账户、固定路由、相同前缀的实际命中证据；本轮不能据它们确认 Flash 或 Pro 的缓存命中、写入或 TTL。

`max_prompt_tokens=null` 不提供独立输入上界；若按共享窗口预留完整 `max_completion_tokens`，可计算保守输入预算 `1048576−131072=917504`，但这个算术不证明端点没有更窄的独立输入限制。图像上限缺失留下模型级能力与所选端点的输入限制问题；列出的参数名没有给出逐项完整值域和跨项条件。端点元数据、平台一般文档和供应商直连文档各自的适用范围不能互相代替。复核触发条件是模型 ID、所选 `tag`、端点元数据、图像处理路径或缓存文档更新。
