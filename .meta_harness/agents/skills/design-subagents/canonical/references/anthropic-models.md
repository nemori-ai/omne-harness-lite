# Anthropic 模型提示指导的选择

以下条目先按 Claude Code 官方支持说明及本地 2.1.280 版本确认，再核对精确模型
指导。支持范围、提供方条件和账户未验证项见[宿主支持记录](model-support.json)。
先确认目标仍受当前宿主支持，再按精确模型查官方独立指南；没有独立指南时读
[通用提示入口](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices)，
并明确所用内容是家族级指导。较早模型不能仅因旧链接重定向就采用新代际结论。

## 已核对的指导与适配假设

| 官方指导的范围 | 官方建议摘要 | 本技能如何据此提出候选调整 |
|---|---|---|
| [Claude Opus 5.5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5-5) | 思考恒开，effort 是唯一的思考控制，默认 `medium`；同档位比 Opus 5 想得更多，`xhigh`/`max` 留给测得出收益的工作；无人值守时可能以进展汇报收尾，官方建议点名不想要的几种提前收尾 | 派发档位显式给出，先只换模型、再扫档；无人值守角色写明「以纯文字结束就是交回」与不该停的几种形态，同时保留角色自己的停止条件 |
| [Claude Fable 5.1](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5-1) | 关注长任务沟通、压缩保留信息、任务范围，以及低 effort 时检索触发；effort 应重新评估 | 明确恢复时必须保留的约束、决定和未知；进展说明与检索触发仅在相关工作需要时补充 |
| [Claude Opus 5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5) | 默认会自检，反复要求验证可能造成额外成本；建议控制叙述与无谓委派 | 将必需验收与重复自检区分；写出结果需要保留的信息，不机械添加“再找 agent 检查一次” |
| [Claude Sonnet 5.5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-sonnet-5-5) | 档位重新校准，不沿用 Sonnet 5 的设置；智能体编码上规格明确的任务从 `medium` 起、更难更长的用 `high`，`xhigh`/`max` 留给测得出收益的工作；`low`/`medium` 下长任务更容易中途停下确认；各档位都倾向顺手补测试与文档；官方说最难的长程工作用 Opus 更合适 | 只派给规格、验收清单齐全的角色，档位取 `medium` 或 `high`；无人值守角色保留「做完并核对后才交回」与不该停的几种形态；要求改动限于所派范围的角色写明不加未要求的文件 |
| [Claude Sonnet 5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-sonnet-5) | 输出随任务复杂度变化；effort 和 thinking 行为需要按版本重新核对 | 用目标样例校准产物充分性，评估实际 effort；不同代际相同档位不等于相同计算量 |
| [Claude Opus 4.8](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-4-8) | 对 effort 和工具使用有特定建议，某些强制进展脚手架可能多余 | 对确需事实核对的任务明确工具用途，按观察精简重复进展指令；不沿用 Opus 5 的默认 thinking 假设 |

最后一列是本技能的应用判断，不是这些模型在本项目上的实测结论。官方某一代的
“减少验证提示”不能撤销实施规格要求的测试，也不能改变独立评审角色职责。

## 适配边界

Anthropic API 文档里的 `thinking`、输出 token 设置、消息追加和工具协议，与
Claude Code subagent frontmatter 属于不同运行面。生成角色配置前用
[Claude Code 规范](claude-code.md)核对字段，不创造宿主未支持的参数。

提示正文可以用清楚的小节或标签分开角色约束、任务数据和引用资料；选择更适合
当前模型与输出的表达，不要求所有 Claude 提示都使用一套 XML 模板。把允许动作、
禁止动作和停止条件写清楚；不能用正向措辞偏好为理由删除真正的禁止边界。

官方建议、当前任务授权、宿主控制和行为实测各有职责。最终以
[适配方法](model-adaptation.md)记录差异，以[验证方法](validation.md)检查角色语义
是否保留；缺少精确模型或运行证据时如实保留未知。
