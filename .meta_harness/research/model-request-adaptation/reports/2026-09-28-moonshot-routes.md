# Moonshot 两条固定路由复核：2026-09-28

调查对象是已确认交付清单中的 `moonshotai/kimi-k3` 与 `moonshotai/kimi-k2.7-code`，经 OpenRouter Chat Completions 的 Moonshot AI 固定 endpoint。本文记录公开上游事实及其边界，不将路由观察、离线规划或已有付费短探针写成正式模型认证。

## 取得方式与逐型号事实

2026-09-28 UTC 对 OpenRouter 公开 [K3 endpoints JSON](https://openrouter.ai/api/v1/models/moonshotai/kimi-k3/endpoints) 与 [K2.7 Code endpoints JSON](https://openrouter.ai/api/v1/models/moonshotai/kimi-k2.7-code/endpoints) 执行未认证 GET；从 `data.endpoints[]` 精确筛 `tag`，没有改用同名其它 provider。对照 Moonshot [模型参数表](https://platform.kimi.ai/docs/api/models-overview.md)、[K3 指南](https://platform.kimi.ai/docs/guide/kimi-k3-quickstart.md)、[K2.7 Code 指南](https://platform.kimi.ai/docs/guide/kimi-k2-7-code-quickstart.md)及[视觉输入](https://platform.kimi.ai/docs/guide/use-kimi-vision-model.md)。这些页面无固定版本号，复核日期是观察坐标，不是永久保证。

| 字段 | K3 | K2.7 Code | 证据边界 |
| --- | --- | --- | --- |
| 精确模型与 route | `moonshotai/kimi-k3` → `moonshotai/mxfp4` | `moonshotai/kimi-k2.7-code` → `moonshotai/int4` | 两份 endpoints JSON 的同一 endpoint 项；当前都存在、`status=0`。固定 tag 是供给选择，不是 native 型号名。 |
| Endpoint 输入／输出模态 | `text,image,video` → `text` | `text,image` → `text` | OpenRouter `data.architecture`；Moonshot native 视觉指南也说 K2.7 可理解视频，但不能把它直接推成**所选 OpenRouter endpoint** 的视频输入声明。 |
| Context／completion 字段 | `1048576`／`943718` | `262144`／`235929` | Endpoint 字段；两条 `max_prompt_tokens=null`，**不是零，也不是可直接填入 profile 的只计输入上界**。必须另选项目输出上限并核对共同窗口换算。 |
| Endpoint 参数名 | `reasoning`、`reasoning_effort`、`max_tokens`、`stop`、`frequency_penalty`、`presence_penalty`、tools/tool_choice | `reasoning`、`max_tokens`、`stop`、`frequency_penalty`、`presence_penalty`、tools/tool_choice | `supported_parameters` 只证明网关列名，不能推出各值域和组合条件。两条均不列 temperature、top_p、seed。 |
| Native 推理／采样 | K3 effort `low/high/max`，默认 max；temperature 固定 1、top_p 固定 0.95、两 penalty 固定 0 | K2.7 始终 thinking；`reasoning_effort` 不支持，若显式 `thinking` 仅 `{type:enabled,keep:all}`；相同固定采样值 | Moonshot 模型参数表；实际经 OpenRouter `reasoning.effort` 逐值发送尚未验证。 |
| 提醒角色 | 未发现 Moonshot 专用的 reminder 消息角色；保留标识后用 user | 同左 | Moonshot Chat 消息及指南和 OpenRouter Chat 公开角色查阅范围内的**未发现**，不是已构造反例证明永不存在。 |
| Prefix cache | OpenRouter 的 [Moonshot 缓存说明](https://openrouter.ai/docs/guides/best-practices/prompt-caching)称自动、无手工控制；既有同 tag 短探针 K3 `cache_read_tokens=5888`，K2.7 `5632` | 同左 | 既有读数为有限暖读；本轮未付费。公开 endpoints JSON 的 `supports_implicit_caching=false` **与文档及已观察到的 read tokens 不一致**，其语义未查清，不能以该 flag 单独声称不缓存。 |

Moonshot 的[缓存说明](https://platform.kimi.ai/docs/guide/context-caching.md)给 native Chat `prompt_cache_options` 可选 5m／1h TTL，缺席时 5m。OpenRouter 固定路由的公开文档只承诺自动缓存，未证明 native TTL 字段可由网关转发，因此 OpenRouter 适配不能自行补一个 TTL，也不能以配置字段存在证明命中。缓存命中应比较相同前缀的冷暖请求、实际同 tag 响应及 `usage.cache_read_tokens`，TTL 留存期还需到期对照。

Moonshot [视觉输入文档](https://platform.kimi.ai/docs/guide/use-kimi-vision-model.md)列出图像格式和总请求体不得超过 100M，但没有逐图字节上限。总请求体界限不能充作 `inputConstraints.maxImageBytes`，也不能将该成员留空冒充“上游无限制”。K3 原生视频示例使用 `video_url` 与 `ms://` 文件路径；目前固定 OpenRouter 路由的文件接收、视频字节编码与传输读回没有实际验证。K2.7 的 native 视频声明与所选 OpenRouter endpoint 模态不同，须按路由事实另查。

## 有限实现与剩余门

本轮 `official-models/moonshot.ts` 仅落实两条路由可表达的纯规则：标识后的 user reminder、自动缓存（无人工 TTL／断点）、K3 只透传三种已列 effort、K2.7 effort 明确 drop 留痕，固定采样项及未经完整域核实的参数明确 drop，`maxOutputTokens` 按既有 G-22 pass。这个“提供的参数子集”不声称上游本身不支持被 drop 的所有参数。`tests/official-moonshot-routes.spec.ts` 用**虚构 text-only、虚构容量的离线定义**核对公开读取、配置解释和 plan wire；该 fixture 不代表任一真实型号的能力，也不进入官方清单。

两份完整 official `ModelDefinition`／配置／profile **均未发布**。阻断字段是图片上游逐图限制未知而现行 `data.model-profile/v3#S-9` 将缺席解释为“无限制”，且项目自有输入上限虽获产品方向允许，尚无本次可采用的精确规格／提供者投影；K3 的视频路径和两型号的图像真实 OpenRouter 承载及大小边界未认证；`maxInputTokens` 的输出保留取值未定；K3 `reasoning.effort` 网关翻译、两条工具／推理回放与实际缓存 TTL 仍只有有限证据。不能为凑可用值把图像或 K3 视频删掉，或把空 `{}` 当未知。完整档案及根公开出口、正式配置来源与双语包 README 示例由主线在上述门闭合并集成时更新。

复核触发：精确 endpoint tag、`supported_parameters`／模态／窗口字段变化，Moonshot 或 OpenRouter 对缓存、推理映射、视觉限制的文档变化，或产品与规格正式接受“上游未知＋项目上限”的表示。
