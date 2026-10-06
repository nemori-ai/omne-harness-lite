# Anthropic 四条固定路由：2026-09-28

本次只调查确认交付清单中的 `anthropic/claude-opus-5.5`、`anthropic/claude-opus-5`、`anthropic/claude-sonnet-5`、`anthropic/claude-fable-5.1` 经 OpenRouter Chat Completions 固定 `anthropic` endpoint 的可表达规则。未使用凭据、未发付费请求；研究观察、离线 fixture 和正式档案认证分开。

## 公开事实与证据

2026-09-28 UTC 对以下四个 OpenRouter 未认证 endpoint JSON 分别 GET，并只取 `data.endpoints[]` 中 `tag=anthropic` 的同一行：

- [Opus 5.5](https://openrouter.ai/api/v1/models/anthropic/claude-opus-5.5/endpoints)
- [Opus 5](https://openrouter.ai/api/v1/models/anthropic/claude-opus-5/endpoints)
- [Sonnet 5](https://openrouter.ai/api/v1/models/anthropic/claude-sonnet-5/endpoints)
- [Fable 5.1](https://openrouter.ai/api/v1/models/anthropic/claude-fable-5.1/endpoints)

四条固定 endpoint 都是 `status=0`、`context_length=1000000`、`max_completion_tokens=128000`、`max_prompt_tokens=null`。四条都列 `max_tokens`、`stop`、`reasoning`、`reasoning_effort`、`tools`、`tool_choice`，均**不列** temperature、top_p、seed 或 penalties；这比四个模型的聚合目录条目更窄。因此本轮只用固定 endpoint 的参数存在性，不拿模型聚合条目给这条固定路由扩权。`max_prompt_tokens=null` 不是零，也不是可直接登记的纯输入容量。

[Anthropic effort 文档](https://platform.claude.com/docs/en/build-with-claude/effort)为四款模型说明 `low`、`medium`、`high`、`xhigh`、`max`；当前已接受 `data.model-profile/v3#S-16` 的统一域只有 `none`、`low`、`medium`、`high`、`max`。所以实际可共用子集是四档 `low`／`medium`／`high`／`max`；`none` 本轮明确 drop 留痕，不能偷译为省略推理或另一个值。`xhigh` 在当前统一域外，不从 provider 文档扩写契约。Opus 5.5 native 默认 medium、其余通常 high 的事实也没有变成隐式请求设置；缺席的 effort 仍缺席。

[OpenRouter Chat 缓存文档](https://openrouter.ai/docs/guides/best-practices/prompt-caching)明确 Anthropic 的逐块 `cache_control`、user 文本块及 `ttl:"1h"` 示例；本项目选取显式 `last_message` 这一已举例的布局，调用者必须给 `ttl` 和完整布局，wire 原样带 1h，不装默认。相同文档的 5 分钟例子省略 `ttl`，而当前公共计划器总是带配置的 literal `ttl`。[OpenRouter 官方 SDK 的顶层设置类型](https://raw.githubusercontent.com/OpenRouterTeam/ai-sdk-provider/1b22b05352cb0f9243a6c3fdd326038dd3705544/src/types/openrouter-chat-settings.ts)允许 literal `5m`／`1h`，但[该版本的消息块类型](https://raw.githubusercontent.com/OpenRouterTeam/ai-sdk-provider/1b22b05352cb0f9243a6c3fdd326038dd3705544/src/types/openrouter-chat-completions-input.ts)只声明 `{type:'ephemeral'}`，没有块级 5m 的类型依据；其[1h 块级 E2E](https://raw.githubusercontent.com/OpenRouterTeam/ai-sdk-provider/1b22b05352cb0f9243a6c3fdd326038dd3705544/e2e/issues/issue-196-anthropic-1h-cache-ttl.test.ts)进一步支持本轮 1h 子集。不能从顶层类型直接推出本项目块级 literal 5m 已证；若要纳入，需网关逐块取值证据或共享线形映射裁定。没有到期实验，不能声称缓存保持 1 小时；旧暖读摘要四项仅在发送显式控制时见 `cacheReadTokens>0`，不是本轮生产实现认证。

[OpenRouter 模型目录](https://openrouter.ai/api/v1/models)四项聚合模型的 `architecture.input_modalities` 均为 `text,image,file`，输出 `text`；固定 endpoint JSON 的 `architecture` 为 null。现行 transport 的已兑现输入只包括 text/image，file 不能只凭模型目录自动承载。上游图像逐图约束、文件路径/字节承载与项目选定的纯输入上限尚未完成此四路验证；`data.model-profile/v3#S-9` 的空 `inputConstraints` 意味着无限制，不能把未知填成 `{}`。PF-013 rev14 的未知＋有限项目上限方向已有决定，继任 Schema 尚未正式接受。故四份完整正式 `ModelDefinition`／配置／profile 均未发布，不能靠删掉已知 image/file 模态让 fixture 变成 official。

[既有 Anthropic 付费研究](2026-09-27-first-party-and-joint.md#anthropic历史提醒与签名回放)只对 Opus 5.5 和 Fable 5.1 给出非流式、高 effort、工具与签名回放的有限观察；它没有覆盖另两款、生产流、损坏签名负控或上游账号条件。公开 [Opus 5.5 迁移文档](https://platform.claude.com/docs/en/models/opus-5-5/migration-guide)要求思考块原样回放且签名绑定模型和历史；项目当前公共计划器的同 route opaque 原样回放只被本轮 synthetic fixture 核对，不能替代付费校验。

## 本轮可兑现范围

`official-models/anthropic.ts` 给四个精确身份各交一个 route 导出；当前固定 endpoint 在已验证参数子集内未发现型号间不同规则，所以共用同一不可变规则值，不虚构“窄差异”。规则是带原标识的 user reminder、仅 `low/medium/high/max` effort、原值 `maxOutputTokens`、`stopSequences`、显式 1h＋`last_message` 缓存，其他统一参数 drop 并保留丢弃留痕。`maxOutputTokens` 原值直送是 D-082/G-22 的当前公共处理，不是已核实上游任何超限值会成功；完整档案未来必须依据模型和项目容量选择上限。

离线测试用**虚构 text-only、虚构容量**的临时定义，穿过公开 definition／配置解释／profile 构造／plan、真实本机 TLS send 与 SSE read。它覆盖四项身份与规则、提醒、显式 TTL、拒绝缺值／未列布局／错误路由、参数 drop、两款签名 opaque 同路回放与跨路不回放，以及一款代表性本机线形。没有外部模型或真实凭据；不建立 official profile 或认证；四款逐项的公开路径＋服务路径及缓存冷暖、到期、图像/文件和完整 T/SC/G 仍归主线后续验收。

复核触发：endpoint `tag`／参数/容量变化，OpenRouter 块级 TTL 证据变化，继任容量与未知约束 Schema 正式接受，或者公共 transport 对 file/图像限制的兑现变化。
