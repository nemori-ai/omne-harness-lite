# xAI 两条 Grok 路由事实复核：2026-09-28

调查对象仅为交付清单中的 `x-ai/grok-4.7`、`x-ai/grok-4.6` 经 OpenRouter Chat Completions 固定 `xai` endpoint。2026-09-28 UTC 未认证 GET [4.7 endpoints JSON](https://openrouter.ai/api/v1/models/x-ai/grok-4.7/endpoints) 与 [4.6 endpoints JSON](https://openrouter.ai/api/v1/models/x-ai/grok-4.6/endpoints)，逐条查看 `data.architecture` 和 `data.endpoints[]`；并核对 [OpenRouter 缓存说明](https://openrouter.ai/docs/guides/best-practices/prompt-caching)、[xAI 推理说明](https://docs.x.ai/developers/model-capabilities/text/reasoning)、[xAI 图像说明](https://docs.x.ai/developers/model-capabilities/images/understanding)、[xAI 版本说明](https://docs.x.ai/developers/release-notes)。这些网页不是不可变版本，以下只是在该日期的公开读数。

| 项 | 4.7 | 4.6 | 读数边界 |
| --- | --- | --- | --- |
| 精确 route | `xai`，另有 `xai/zdr` 等变体 | `xai`，另有 `xai/zdr` 及 Amazon Bedrock | 两份 OpenRouter endpoint JSON；不能把别的 tag 的事实并入固定 `xai`。 |
| OpenRouter 模态 | `text,image,file` → `text` | 同左 | `architecture` 是网关模型声明；项目现行 `Modality` 没有 `file`，不能把它伪装成图像或文本。xAI 原生版本说明只列 text/image。 |
| Context、completion、prompt 字段 | `500000`、`450000`、`null` | 同左 | 当前 `xai` endpoint 的 `context_length`、`max_completion_tokens`、`max_prompt_tokens`。`null` 不表示零或无限；也没有现成的只计输入的档案上限。xAI 原生版本说明称无文本输出限制，和网关 endpoint 字段属于不同边界。 |
| 列出的请求参数名 | `reasoning`、`reasoning_effort`、`max_tokens`、`temperature`、`top_p`、`seed`、`tools`、`tool_choice` 等 | 同左 | `supported_parameters` 只给名称，不给这些值在 OpenRouter → xAI 路径上的完整取值域或组合条件。`stop`、`frequency_penalty`、`presence_penalty` 未列。 |
| 原生推理档 | `low,medium,high,xhigh`，缺席默认 high；不可关闭 | 同左 | xAI 推理说明；项目已接受统一域没有 `xhigh`，其中 `max` 不能据此等同 `xhigh`。原生页面不证明 OpenRouter 每个值都转译到固定路由。 |
| 图像限制 | 20 MiB/张，JPEG/PNG | 同一份通用图像说明 | 这是 xAI 原生 API 的一般限制；固定 OpenRouter endpoint 的实际字节接收及图片转换尚未用本项目请求核对。 |
| 自动缓存 | 公开文档写 Grok 自动缓存、无手工配置 | 同左 | 既有[受控探针读数](../../../design/record/evidence/2026-09-27-probe-model-request-runtime/model-evidence-summary.json)中，两款 `xai` route 均有 `automatic_no_control` 且 `cacheReadTokens > 0` 的请求。endpoint JSON 同时给 `supports_implicit_caching=false`，与文档和暖读观察不一致；该 flag 的意义未查清。暖读不证明新代码命中、TTL 或无控制时每次必定命中。 |

原生 [xAI function calling](https://docs.x.ai/developers/tools/function-calling) 和两份 endpoint JSON 均列工具能力；本轮没有付费调用、没有观察新适配器的工具响应或推理流。固定 OpenRouter route 的提醒专用角色未在上述 Chat 文档中查到；这是检索范围内的未发现，不是已构造负控证明不存在。适配器的离线 planner 可以验证本地消息投影和重放字节，却不能证明上游接收、解释或计费。

复核触发：固定 `xai` endpoint 的 tag、模态、窗口、参数集合变动；xAI/OpenRouter 对推理、图像或缓存文档的变动；正式档案需要的输入上限、限制与传输投影有新接受依据。
