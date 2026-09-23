# OpenAI 模型提示指导的选择

以下条目先经 Codex 可见模型目录确认（GPT-6 Sol/Luna 为 2026-09-23 的 0.156.1，其余为 2026-09-12 的 0.154.0），再核对官方提示指导。
完整已确认范围和证据见[宿主支持记录](model-support.json)。目标不在记录中时先
确认宿主支持，再查精确模型指导；不能选“最接近”的条目冒充支持或适配。

## 已核对的指导与适配假设

| 官方指导的范围 | 官方建议摘要 | 本技能如何据此提出候选调整 |
|---|---|---|
| [GPT-6 Astra](https://developers.openai.com/api/docs/guides/latest-model/gpt-6-astra.md#prompting-best-practices) | 可能更主动澄清，更敏感于 skills 等指令，验证也可能超过小任务所需 | 将关键歧义与例行选择分开；解释暂停依据；保留必要验收而避免无条件反复自检 |
| GPT-6 Sol / Luna（无独立指南，按 [GPT-6 Astra 指南](https://developers.openai.com/api/docs/guides/latest-model/gpt-6-astra.md#prompting-best-practices)的家族级内容） | 2026-09-23 未查到 Sol、Luna 的专属提示指南；Astra 指南把二者列为同家族，并注明二者支持 `none` 推理档而 Astra 不支持 | 只用家族级指导，不写 Sol／Luna 专属适配段；它们与 Astra 的行为差异待本项目实测 |
| [GPT-5.6 家族](https://developers.openai.com/api/docs/guides/latest-model/gpt-5.6#prompting-best-practices) | 建议精简重复提示和工具描述，明确自治边界，并用任务评估验证精简效果 | 每项角色边界只设一个权威位置；表达简短仍保留必需材料、未知和停止条件；Sol/Terra/Luna 等精确目标另核对 |
| [GPT-5.5](https://developers.openai.com/api/docs/guides/latest-model/gpt-5.5#prompting-best-practices) | 以结果、成功条件和停止条件为中心，减少旧提示中的过程脚手架 | 明确哪些缺口必须澄清，允许范围内自主选择方法；保留真实不变量，避免把偏好全写成硬性流程 |

最后一列是技能设计假设，需要实际验证，不是厂商保证。上表不承诺某个模型天生
不会越界，也不授权自动提高 effort、增加并行 agent 或降低验收要求。

## 可维护的使用方式

目录中有、但没有专属提示指南的模型（如 GPT-6 Sol／Luna）不提供专属适配模板；
使用前先查其官方指导，无法确认则保留中性基线及未知。

精确目标已给定时读对应页；“最新模型”尚未确定时，先从目标宿主目录选出支持对象，
再从官方模型指导定位对应页，不能直接以 API 的 latest 替换宿主候选。
核对正文标题与适用模型，旧指南里的“newest”只代表其写作时点。

使用 [OpenAI Docs](https://developers.openai.com/api/docs/guides/prompt-engineering)及其
官方文档搜索能力获取指南。不要把网站示例中的函数工具、API `text.verbosity`、
reasoning 配置或 compaction 操作直接抄成 Codex agent 文件字段。

将角色共同正文与模型适配分开记录。若某代模型已经稳定做到一种行为，可以试验
删除重复提醒，但用户要求的职责、写范围、规格/计划前置条件和停止义务仍须明确。
实际迁移需要[适配记录](../assets/templates/model-adaptation.md)和
[验证证据](validation.md)，不能以更新模型名代替验证。
